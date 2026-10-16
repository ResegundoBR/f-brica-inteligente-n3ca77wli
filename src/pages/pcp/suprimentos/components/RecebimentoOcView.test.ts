import { describe, it, expect } from 'vitest'
import { OrdemCompraItem, MaterialShortage, OrdemCompra } from '@/types'
import { OcItemDisplayRow, OcGroupedRecebimento } from './RecebimentoTable'

describe('Visão Por Ordem de Compra em RecebimentoTable', () => {
  const mockOc38922: OrdemCompra = {
    id: 'pk5w1nhjcjwm63w',
    oc_number: '38922',
    supplier: 'FORNECEDOR TESTE',
    status: 'Pendente',
    created: '2026-10-18T10:00:00Z',
    updated: '2026-10-18T10:00:00Z',
  }

  // 5 itens com shortage + 5 itens avulsos (sem shortage) como no caso real da OC 38922
  const mockOcItens: OrdemCompraItem[] = [
    // Com shortage: 14040046 (quantity 8 na OC, enquanto shortage era 6)
    {
      id: 'it_1',
      oc_id: 'pk5w1nhjcjwm63w',
      code: '14040046',
      description: 'CHAPA AÇO 14040046',
      quantity: 8,
      received_quantity: 0,
      material_shortage_id: 'shortage_14040046',
      created: '2026-10-18T10:00:00Z',
      updated: '2026-10-18T10:00:00Z',
      expand: {
        oc_id: mockOc38922,
      },
    },
    // Com shortage: 05330098 (quantity 3 na OC, enquanto shortage era 1)
    {
      id: 'it_2',
      oc_id: 'pk5w1nhjcjwm63w',
      code: '05330098',
      description: 'PARAFUSO 05330098',
      quantity: 3,
      received_quantity: 1,
      material_shortage_id: 'shortage_05330098',
      created: '2026-10-18T10:00:00Z',
      updated: '2026-10-18T10:00:00Z',
      expand: {
        oc_id: mockOc38922,
      },
    },
    // 5 itens manuais sem shortage (material_shortage_id vazio)
    {
      id: 'it_3',
      oc_id: 'pk5w1nhjcjwm63w',
      code: '14040047',
      description: 'ITEM AVULSO 14040047',
      quantity: 10,
      received_quantity: 0,
      created: '2026-10-18T10:00:00Z',
      updated: '2026-10-18T10:00:00Z',
      expand: {
        oc_id: mockOc38922,
      },
    },
    {
      id: 'it_4',
      oc_id: 'pk5w1nhjcjwm63w',
      code: '05330073',
      description: 'ITEM AVULSO 05330073',
      quantity: 5,
      received_quantity: 5,
      created: '2026-10-18T10:00:00Z',
      updated: '2026-10-18T10:00:00Z',
      expand: {
        oc_id: mockOc38922,
      },
    },
    {
      id: 'it_5',
      oc_id: 'pk5w1nhjcjwm63w',
      code: '14040177',
      description: 'ITEM AVULSO 14040177',
      quantity: 2.5, // float-safe MT
      received_quantity: 0.5,
      created: '2026-10-18T10:00:00Z',
      updated: '2026-10-18T10:00:00Z',
      expand: {
        oc_id: mockOc38922,
      },
    },
    {
      id: 'it_6',
      oc_id: 'pk5w1nhjcjwm63w',
      code: '05330313',
      description: 'ITEM AVULSO 05330313',
      quantity: 20,
      received_quantity: 0,
      created: '2026-10-18T10:00:00Z',
      updated: '2026-10-18T10:00:00Z',
      expand: {
        oc_id: mockOc38922,
      },
    },
    {
      id: 'it_7',
      oc_id: 'pk5w1nhjcjwm63w',
      code: '05330314',
      description: 'ITEM AVULSO 05330314',
      quantity: 12,
      received_quantity: 0,
      created: '2026-10-18T10:00:00Z',
      updated: '2026-10-18T10:00:00Z',
      expand: {
        oc_id: mockOc38922,
      },
    },
  ]

  const mockShortages: MaterialShortage[] = [
    {
      id: 'shortage_14040046',
      code: '14040046',
      description: 'CHAPA AÇO 14040046',
      quantity: 6, // menor que a OC
      received_quantity: 0,
      order_id: 'op_100',
      status: 'Compra',
      sector: 'Corte',
      priority: 'Urgente',
      request_type: 'Materiais',
      created: '2026-10-18T09:00:00Z',
      updated: '2026-10-18T09:00:00Z',
    },
    {
      id: 'shortage_05330098',
      code: '05330098',
      description: 'PARAFUSO 05330098',
      quantity: 1, // menor que a OC (3)
      received_quantity: 1,
      order_id: 'op_101',
      status: 'Compra',
      sector: 'Montagem',
      priority: 'Sem pressa',
      request_type: 'Materiais',
      created: '2026-10-18T09:00:00Z',
      updated: '2026-10-18T09:00:00Z',
    },
  ]

  it('lista TODOS os itens da OC na visão, incluindo os que não têm shortage vinculada', () => {
    // Simula a construção do agrupamento
    const rows: OcItemDisplayRow[] = mockOcItens.map((it) => {
      const isStandalone = !it.material_shortage_id
      const shortage = mockShortages.find((s) => s.id === it.material_shortage_id)
      const purchasedQty = Number(it.quantity) || 0
      const receivedQty = Math.max(
        Number(it.received_quantity) || 0,
        Number(shortage?.received_quantity) || 0,
      )
      return {
        type: isStandalone ? 'standalone' : 'shortage',
        id: it.id,
        code: it.code || '',
        description: it.description,
        purchasedQty,
        receivedQty,
        saldoQty: Math.max(0, purchasedQty - receivedQty),
        shortage,
        ocItem: it,
      }
    })

    expect(rows).toHaveLength(7)
    const standaloneRows = rows.filter((r) => r.type === 'standalone')
    expect(standaloneRows).toHaveLength(5)
    expect(standaloneRows.map((r) => r.code)).toEqual(
      expect.arrayContaining(['14040047', '05330073', '14040177', '05330313', '05330314']),
    )
  })

  it('as colunas Comprado/Já Recebido/Saldo vêm do item da OC (quantity da OC) e não do shortage', () => {
    // Item 14040046: shortage diz 6, mas a OC diz 8
    const item14040046 = mockOcItens.find((it) => it.code === '14040046')!
    const shortage14040046 = mockShortages.find((s) => s.code === '14040046')!

    const purchasedQty = Number(item14040046.quantity)
    const receivedQty = Math.max(
      Number(item14040046.received_quantity) || 0,
      Number(shortage14040046.received_quantity) || 0,
    )
    const saldo = Math.max(0, purchasedQty - receivedQty)

    expect(purchasedQty).toBe(8) // Veio da OC e NÃO do shortage (6)
    expect(receivedQty).toBe(0)
    expect(saldo).toBe(8)

    // Item 05330098: shortage diz 1, mas a OC diz 3. Recebido = 1. Saldo = 2
    const item05330098 = mockOcItens.find((it) => it.code === '05330098')!
    const shortage05330098 = mockShortages.find((s) => s.code === '05330098')!

    const pQty2 = Number(item05330098.quantity)
    const rQty2 = Math.max(
      Number(item05330098.received_quantity) || 0,
      Number(shortage05330098.received_quantity) || 0,
    )
    const saldo2 = Math.max(0, pQty2 - rQty2)

    expect(pQty2).toBe(3) // Veio da OC e NÃO do shortage (1)
    expect(rQty2).toBe(1)
    expect(saldo2).toBe(2)
  })

  it('mantém integridade float-safe para unidades fracionárias (ex: 2.5 un compradas, 0.5 recebidas)', () => {
    const itemFrac = mockOcItens.find((it) => it.code === '14040177')!
    const purchased = Number(itemFrac.quantity)
    const received = Number(itemFrac.received_quantity)
    const saldo = Math.round((purchased - received) * 10000) / 10000

    expect(purchased).toBe(2.5)
    expect(received).toBe(0.5)
    expect(saldo).toBe(2.0)
  })

  it('o progresso da OC considera TODOS os itens da OC (incluindo avulsos)', () => {
    let fullyReceivedCount = 0
    for (const it of mockOcItens) {
      const p = Number(it.quantity) || 0
      const shortage = mockShortages.find((s) => s.id === it.material_shortage_id)
      const r = Math.max(
        Number(it.received_quantity) || 0,
        Number(shortage?.received_quantity) || 0,
      )
      if (p > 0 && r >= p - 0.0001) {
        fullyReceivedCount++
      }
    }

    // Apenas it_4 (05330073) tem 5 de 5 recebido
    expect(mockOcItens.length).toBe(7)
    expect(fullyReceivedCount).toBe(1)

    const group: OcGroupedRecebimento = {
      oc: mockOc38922,
      supplier: mockOc38922.supplier || '-',
      totalItemsCount: mockOcItens.length,
      receivedItemsCount: fullyReceivedCount,
      itemRows: [],
    }

    expect(group.totalItemsCount).toBe(7)
    expect(group.receivedItemsCount).toBe(1)
    const pct = Math.round((group.receivedItemsCount / group.totalItemsCount) * 100)
    expect(pct).toBe(14)
  })
})
