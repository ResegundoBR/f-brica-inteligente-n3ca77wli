import { describe, it, expect } from 'vitest'
import { groupShortagesByCode, normalizeGroupKey } from '@/lib/shortage-grouping'
import { MaterialShortage } from '@/types'

describe('shortage-grouping', () => {
  it('normalizes code and description properly', () => {
    expect(normalizeGroupKey('05090003', 'Soquete e27')).toBe('code:05090003')
    expect(normalizeGroupKey('', 'Soquete E27 ')).toBe('desc:soquete e27')
    expect(normalizeGroupKey(null, 'Parafuso Inox 10mm')).toBe('desc:parafuso inox 10mm')
  })

  it('groups multiple shortages with same code into one group with summed quantity', () => {
    const mockItems: MaterialShortage[] = [
      {
        id: '1',
        code: '05090003',
        description: 'Soquete e27',
        quantity: 1,
        status: 'Pendente',
        sector: 'Acabamento',
        priority: 'Sem pressa',
        created: '2026-09-23T15:45:07Z',
        updated: '2026-09-23T15:45:07Z',
        order_id: 'op1',
        expand: { order_id: { id: 'op1', op_number: '14007', order_number: '000493/2026' } as any },
      },
      {
        id: '2',
        code: '05090003',
        description: 'Soquete e27',
        quantity: 4,
        status: 'Pendente',
        sector: 'Acabamento',
        priority: 'Urgente',
        created: '2026-09-23T15:42:04Z',
        updated: '2026-09-23T15:42:04Z',
        order_id: 'op2',
        expand: { order_id: { id: 'op2', op_number: '13.975', order_number: '453/2026' } as any },
      },
      {
        id: '3',
        code: '05090003',
        description: 'Soquete e27',
        quantity: 5,
        status: 'Pendente',
        sector: 'Montagem',
        priority: 'Próximos dias',
        created: '2026-09-23T15:43:08Z',
        updated: '2026-09-23T15:43:08Z',
        order_id: 'op3',
        expand: { order_id: { id: 'op3', op_number: '13.959', order_number: '427/2026' } as any },
      },
      {
        id: '4',
        code: '050800030',
        description: 'Cabo slim',
        quantity: 8400,
        status: 'Pendente',
        sector: 'Expedição',
        priority: 'Sem pressa',
        created: '2026-09-23T16:16:23Z',
        updated: '2026-09-23T16:16:23Z',
        order_id: 'op4',
        expand: { order_id: { id: 'op4', op_number: '13966', order_number: '000435/2026' } as any },
      },
      {
        id: '5',
        code: '050800030',
        description: 'Cabo slim',
        quantity: 8400,
        status: 'Pendente',
        sector: 'Expedição',
        priority: 'Sem pressa',
        created: '2026-09-23T16:17:20Z',
        updated: '2026-09-23T16:17:20Z',
        order_id: 'op4',
        expand: { order_id: { id: 'op4', op_number: '13966', order_number: '000435/2026' } as any },
      },
    ]

    const groups = groupShortagesByCode(mockItems)

    expect(groups).toHaveLength(2)

    // Soquete e27
    const soqueteGroup = groups.find((g) => g.code === '05090003')
    expect(soqueteGroup).toBeDefined()
    expect(soqueteGroup!.totalQuantity).toBe(10) // 1 + 4 + 5
    expect(soqueteGroup!.items).toHaveLength(3)
    expect(soqueteGroup!.opCount).toBe(3)
    expect(soqueteGroup!.highestPriority).toBe('Urgente')
    expect(soqueteGroup!.sectors).toContain('Acabamento')
    expect(soqueteGroup!.sectors).toContain('Montagem')

    // Cabo slim (duplicidade preservada nos dados, soma 16.800)
    const caboGroup = groups.find((g) => g.code === '050800030')
    expect(caboGroup).toBeDefined()
    expect(caboGroup!.totalQuantity).toBe(16800)
    expect(caboGroup!.items).toHaveLength(2)
  })

  it('recalculates group properly when partial purchase removes some items (leaving remaining)', () => {
    // Caso real: grupo 'Soquete e27' consolida 57 un de 5 OPs.
    // Comprador compra 14 un de 1 OP agora, restando 43 un em 4 OPs.
    const soqueteItems: MaterialShortage[] = [
      {
        id: 's1',
        code: '05090003',
        description: 'Soquete e27',
        quantity: 14,
        status: 'Cotação',
        sector: 'Montagem',
        priority: 'Urgente',
        created: '2026-09-23T15:00:00Z',
        updated: '2026-09-23T15:00:00Z',
        order_id: 'op1',
        expand: { order_id: { id: 'op1', op_number: 'OP-101', order_number: 'P-101' } as any },
      },
      {
        id: 's2',
        code: '05090003',
        description: 'Soquete e27',
        quantity: 10,
        status: 'Cotação',
        sector: 'Acabamento',
        priority: 'Próximos dias',
        created: '2026-09-23T15:05:00Z',
        updated: '2026-09-23T15:05:00Z',
        order_id: 'op2',
        expand: { order_id: { id: 'op2', op_number: 'OP-102', order_number: 'P-102' } as any },
      },
      {
        id: 's3',
        code: '05090003',
        description: 'Soquete e27',
        quantity: 15,
        status: 'Cotação',
        sector: 'Montagem',
        priority: 'Sem pressa',
        created: '2026-09-23T15:10:00Z',
        updated: '2026-09-23T15:10:00Z',
        order_id: 'op3',
        expand: { order_id: { id: 'op3', op_number: 'OP-103', order_number: 'P-103' } as any },
      },
      {
        id: 's4',
        code: '05090003',
        description: 'Soquete e27',
        quantity: 8,
        status: 'Cotação',
        sector: 'Acabamento',
        priority: 'Próximos dias',
        created: '2026-09-23T15:15:00Z',
        updated: '2026-09-23T15:15:00Z',
        order_id: 'op4',
        expand: { order_id: { id: 'op4', op_number: 'OP-104', order_number: 'P-104' } as any },
      },
      {
        id: 's5',
        code: '05090003',
        description: 'Soquete e27',
        quantity: 10,
        status: 'Cotação',
        sector: 'Montagem',
        priority: 'Sem pressa',
        created: '2026-09-23T15:20:00Z',
        updated: '2026-09-23T15:20:00Z',
        order_id: 'op5',
        expand: { order_id: { id: 'op5', op_number: 'OP-105', order_number: 'P-105' } as any },
      },
    ]

    // Antes da compra parcial: 57 un em 5 OPs
    const initialGroups = groupShortagesByCode(soqueteItems)
    expect(initialGroups).toHaveLength(1)
    expect(initialGroups[0].totalQuantity).toBe(57)
    expect(initialGroups[0].opCount).toBe(5)
    expect(initialGroups[0].highestPriority).toBe('Urgente')

    // Simula compra parcial: remove 's1' (14 un da OP-101 avançou para Compras, não está mais em Cotação)
    const remainingItems = soqueteItems.filter((i) => i.id !== 's1')
    const recalculatedGroups = groupShortagesByCode(remainingItems)

    expect(recalculatedGroups).toHaveLength(1)
    expect(recalculatedGroups[0].totalQuantity).toBe(43) // 57 - 14 = 43 un
    expect(recalculatedGroups[0].items).toHaveLength(4)
    expect(recalculatedGroups[0].opCount).toBe(4) // 4 OPs restantes
    // Como a mais urgente ('Urgente' em s1) foi comprada, a nova prioridade mais alta passa a ser 'Próximos dias'
    expect(recalculatedGroups[0].highestPriority).toBe('Próximos dias')
  })
})
