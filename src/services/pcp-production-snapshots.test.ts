import { describe, it, expect } from 'vitest'
import { PcpOrder, PcpProductionSnapshot } from '@/types'
import {
  computeHistoricalSnapshotFromOrders,
  getSnapshotForTargetDate,
  calculateIntervalFlow,
} from '@/services/pcp-production-snapshots'
import { subDays, startOfDay, format } from 'date-fns'

describe('pcp-production-snapshots logic', () => {
  const baseDate = new Date('2026-10-05T12:00:00.000Z')

  const mockOrders: PcpOrder[] = [
    {
      id: 'op-1',
      order_number: '14011',
      op_number: '000517/2026',
      quantity: 10,
      status: 'Fila',
      stage: 'Separação',
      op_type: 'Linha',
      delivery_date: '2026-10-01', // atrasada em relação a 2026-10-05
      created: '2026-09-01T10:00:00.000Z',
    } as PcpOrder,
    {
      id: 'op-2',
      order_number: '14012',
      op_number: '000518/2026',
      quantity: 20,
      status: 'Em Andamento',
      stage: 'Expedição',
      op_type: 'Especial',
      delivery_date: '2026-10-10', // no prazo em 2026-10-05
      created: '2026-09-15T10:00:00.000Z',
    } as PcpOrder,
    {
      id: 'op-3',
      order_number: '14013',
      op_number: '000519/2026',
      quantity: 5,
      status: 'Concluído',
      stage: 'Expedição',
      op_type: 'Linha',
      delivery_date: '2026-09-20',
      created: '2026-08-01T10:00:00.000Z',
      finished_at: '2026-09-25T10:00:00.000Z', // concluída ANTES de 2026-10-05
    } as PcpOrder,
  ]

  it('computes historical snapshot correctly from orders (fallback)', () => {
    const snap = computeHistoricalSnapshotFromOrders(mockOrders, baseDate)

    // op-1 (10) + op-2 (20) estão em aberto; op-3 estava concluída
    expect(snap.total).toBe(30)
    // op-1 tem delivery_date 2026-10-01 < 2026-10-05
    expect(snap.delayed).toBe(10)
    expect(snap.toStart).toBe(10) // op-1 Fila
    expect(snap.inProcess).toBe(20) // op-2 Em Andamento
    expect(snap.expedition).toBe(20) // op-2 Expedição
    expect(snap.linha).toBe(10)
    expect(snap.especial).toBe(20)
    expect(snap.isPersisted).toBe(false)
  })

  it('prioritizes exact persisted snapshot over computed fallback', () => {
    const persisted: PcpProductionSnapshot[] = [
      {
        id: 'snap-1',
        reference_date: '2026-09-28', // 7 dias antes de 2026-10-05
        total_units: 208,
        delayed_units: 117,
        to_start_units: 40,
        in_process_units: 150,
        expedition_units: 18,
        linha_units: 100,
        especial_units: 90,
        assistencia_units: 18,
        open_orders_count: 25,
        delayed_orders_count: 12,
        created: '2026-09-28T03:00:00.000Z',
        updated: '2026-09-28T03:00:00.000Z',
      },
    ]

    const target7d = subDays(baseDate, 7) // 2026-09-28
    const result = getSnapshotForTargetDate(target7d, persisted, mockOrders)

    expect(result.isPersisted).toBe(true)
    expect(result.total).toBe(208)
    expect(result.delayed).toBe(117)
    expect(result.snapshotId).toBe('snap-1')
  })

  it('uses closest persisted snapshot within tolerance window', () => {
    const persisted: PcpProductionSnapshot[] = [
      {
        id: 'snap-close',
        reference_date: '2026-09-29', // 1 dia de diferença em relação a 2026-09-28
        total_units: 210,
        delayed_units: 115,
        created: '2026-09-29T03:00:00.000Z',
        updated: '2026-09-29T03:00:00.000Z',
      },
    ]

    const target7d = subDays(baseDate, 7) // 2026-09-28
    const result = getSnapshotForTargetDate(target7d, persisted, mockOrders, 2)

    expect(result.isPersisted).toBe(true)
    expect(result.total).toBe(210)
    expect(result.delayed).toBe(115)
  })

  it('falls back to computed snapshot when no persisted snapshot is near', () => {
    const persisted: PcpProductionSnapshot[] = [
      {
        id: 'snap-far',
        reference_date: '2026-08-01', // muito longe de 2026-09-28
        total_units: 500,
        delayed_units: 300,
        created: '2026-08-01T03:00:00.000Z',
        updated: '2026-08-01T03:00:00.000Z',
      },
    ]

    const target7d = subDays(baseDate, 7) // 2026-09-28
    const result = getSnapshotForTargetDate(target7d, persisted, mockOrders, 3)

    expect(result.isPersisted).toBe(false)
    expect(result.total).toBe(30)
  })

  it('calculates interval flow correctly: entered, exited and balance in units', () => {
    const ordersFlow: PcpOrder[] = [
      {
        id: 'op-flow-1',
        quantity: 12,
        status: 'Fila',
        created: '2026-10-01T10:00:00.000Z', // dentro do intervalo 2026-09-28 -> 2026-10-05
      } as PcpOrder,
      {
        id: 'op-flow-2',
        quantity: 5,
        status: 'Concluído',
        created: '2026-09-01T10:00:00.000Z',
        finished_at: '2026-10-02T15:00:00.000Z', // concluída no intervalo
      } as PcpOrder,
      {
        id: 'op-flow-3',
        quantity: 8,
        status: 'Concluído',
        created: '2026-09-29T10:00:00.000Z', // criada E concluída no intervalo
        finished_at: '2026-10-03T11:00:00.000Z',
      } as PcpOrder,
      {
        id: 'op-flow-4',
        quantity: 20,
        status: 'Em Andamento',
        created: '2026-09-20T10:00:00.000Z', // fora do intervalo (anterior)
      } as PcpOrder,
    ]

    const startDate = new Date('2026-09-28T00:00:00.000Z')
    const endDate = new Date('2026-10-05T00:00:00.000Z')

    const flow = calculateIntervalFlow(startDate, endDate, ordersFlow, [])

    // Entraram: op-flow-1 (12) + op-flow-3 (8) = 20
    expect(flow.entered).toBe(20)
    // Saíram: op-flow-2 (5) + op-flow-3 (8) = 13
    expect(flow.exited).toBe(13)
    // Saldo: 20 - 13 = +7 (bolo cresceu)
    expect(flow.balance).toBe(7)
  })
})
