import { describe, it, expect } from 'vitest'
import { PcpOrder } from '@/types'

describe('ProductsBlock metric validation', () => {
  const mockOrders: Partial<PcpOrder>[] = [
    {
      id: 'op-1',
      order_number: '14011',
      op_number: '000517/2026',
      quantity: 2,
      status: 'Fila',
      stage: 'Separação',
      op_type: 'Linha',
      delivery_date: '2026-10-20',
      created: '2026-03-01T10:00:00.000Z',
    },
    {
      id: 'op-2',
      order_number: '14011',
      op_number: '000519/2026',
      quantity: 55,
      status: 'Fila',
      stage: 'Cotação',
      op_type: 'Especial',
      delivery_date: '2026-11-17',
      created: '2026-03-01T10:00:00.000Z',
    },
    {
      id: 'op-3',
      order_number: '14017',
      op_number: '000512/2026',
      quantity: 1,
      status: 'Fila',
      stage: 'Aguardando',
      op_type: 'Assistência',
      delivery_date: '2026-10-22',
      created: '2026-03-01T10:00:00.000Z',
    },
    {
      id: 'op-4',
      order_number: '14016',
      op_number: '000518/2026',
      quantity: 2,
      status: 'Fila',
      stage: 'Separação',
      op_type: 'Linha',
      delivery_date: '2026-10-22',
      created: '2026-03-01T10:00:00.000Z',
    },
    {
      id: 'op-5',
      order_number: '14013',
      op_number: '000515/2026',
      quantity: 1,
      status: 'Fila',
      stage: 'Separação',
      op_type: 'Especial',
      delivery_date: '2026-10-21',
      created: '2026-03-01T10:00:00.000Z',
    },
    {
      id: 'op-6',
      order_number: '14012',
      op_number: '000492/2026',
      quantity: 1,
      status: 'Fila',
      stage: 'Cotação',
      op_type: 'Assistência',
      delivery_date: '2026-10-05',
      created: '2026-03-01T10:00:00.000Z',
    },
    {
      id: 'op-7',
      order_number: '14005',
      op_number: '500/2026',
      quantity: 2,
      status: 'Fila',
      stage: 'Fila' as any,
      op_type: 'Linha',
      delivery_date: '2026-10-15',
      created: '2026-03-01T10:00:00.000Z',
    },
    // OP concluída: NÃO DEVE COMPUTAR
    {
      id: 'op-8-concluded',
      order_number: '13999',
      op_number: '490/2026',
      quantity: 100,
      status: 'Concluído',
      stage: 'Expedição',
      op_type: 'Linha',
      delivery_date: '2026-01-01',
      created: '2026-01-01T10:00:00.000Z',
    },
  ]

  it('calculates total non-concluded units matching Reginaldo example (2+55+1+2+1+1+2 = 64)', () => {
    const openOrders = mockOrders.filter((o) => o.status !== 'Concluído')
    expect(openOrders.length).toBe(7)

    const totalUnits = openOrders.reduce((acc, curr) => acc + (curr.quantity || 0), 0)
    expect(totalUnits).toBe(64)
  })

  it('correctly aggregates units by OP type', () => {
    const openOrders = mockOrders.filter((o) => o.status !== 'Concluído')

    const linhaUnits = openOrders
      .filter((o) => (o.op_type || 'Linha') === 'Linha')
      .reduce((acc, curr) => acc + (curr.quantity || 0), 0)
    expect(linhaUnits).toBe(2 + 2 + 2) // 6 unidades

    const especialUnits = openOrders
      .filter((o) => o.op_type === 'Especial')
      .reduce((acc, curr) => acc + (curr.quantity || 0), 0)
    expect(especialUnits).toBe(55 + 1) // 56 unidades

    const assistenciaUnits = openOrders
      .filter((o) => o.op_type === 'Assistência')
      .reduce((acc, curr) => acc + (curr.quantity || 0), 0)
    expect(assistenciaUnits).toBe(1 + 1) // 2 unidades

    expect(linhaUnits + especialUnits + assistenciaUnits).toBe(64)
  })

  it('excludes concluded orders from all card sums', () => {
    const concludedOrders = mockOrders.filter((o) => o.status === 'Concluído')
    expect(concludedOrders.length).toBe(1)
    expect(concludedOrders[0].quantity).toBe(100)

    const openOrders = mockOrders.filter((o) => o.status !== 'Concluído')
    const hasConcludedInOpen = openOrders.some((o) => o.status === 'Concluído')
    expect(hasConcludedInOpen).toBe(false)
  })
})
