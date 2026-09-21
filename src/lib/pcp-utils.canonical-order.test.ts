import { describe, it, expect } from 'vitest'
import { sortFilaProductionOrders } from './pcp-utils'

describe('sortFilaProductionOrders - ordenação canônica', () => {
  it('ordena corretamente: emergência -> prazo especial -> data prometida -> manual_sequence -> delivery_date', () => {
    const orders = [
      {
        id: '5',
        order_number: '13.955',
        manual_sequence: 4,
        delivery_date: '2025-05-10',
      },
      {
        id: '1',
        order_number: '13.956',
        manual_sequence: 1,
        delivery_date: '2025-05-20',
      },
      {
        id: 'emergencia',
        order_number: '99.999',
        manual_priority: 1,
        manual_sequence: 10,
      },
      {
        id: '3',
        order_number: '13.959',
        manual_sequence: 3,
        delivery_date: '2025-05-15',
      },
      {
        id: 'prazo-especial',
        order_number: '88.888',
        manual_priority: 2,
        manual_sequence: 20,
      },
      {
        id: '2',
        order_number: '13.961',
        manual_sequence: 2,
        delivery_date: '2025-05-12',
      },
      {
        id: 'prometida',
        order_number: '77.777',
        promised_date: '2025-05-01',
        manual_sequence: 30,
      },
    ]

    const sorted = sortFilaProductionOrders(orders)
    const sortedIds = sorted.map((o) => o.id)

    expect(sortedIds).toEqual([
      'emergencia',
      'prazo-especial',
      'prometida',
      '1', // 13.956 (seq 1)
      '2', // 13.961 (seq 2)
      '3', // 13.959 (seq 3)
      '5', // 13.955 (seq 4)
    ])
  })

  it('ordena por delivery_date quando manual_sequence é nulo ou igual', () => {
    const orders = [
      { id: 'b', order_number: 'B', delivery_date: '2025-06-01' },
      { id: 'a', order_number: 'A', delivery_date: '2025-05-01' },
    ]
    const sorted = sortFilaProductionOrders(orders)
    expect(sorted.map((o) => o.id)).toEqual(['a', 'b'])
  })
})
