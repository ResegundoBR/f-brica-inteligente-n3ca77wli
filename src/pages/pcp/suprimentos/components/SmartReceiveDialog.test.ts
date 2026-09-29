import { describe, it, expect } from 'vitest'
import { MaterialShortage } from '@/types'
import { buildRecebimentoDisplayItems } from './RecebimentoTable'

/**
 * Função utilitária que espelha a lógica de pré-inicialização do SmartReceiveDialog
 * ao abrir o recebimento de itens vinculados a um lote (batch_id).
 */
export function calculateBatchSmartReceiveInitialState(
  batchItems: MaterialShortage[],
  activeItem?: MaterialShortage,
) {
  const parent =
    batchItems.find((x) => x.batch_info?.is_batch_parent) || activeItem || batchItems[0]
  const actualQty = parent?.batch_info?.actual_quantity

  const opMembers = batchItems.filter(
    (x) =>
      Boolean(x.order_id) &&
      !x.observation?.includes('Compra para estoque') &&
      x.id !== parent?.batch_info?.surplus_shortage_id,
  )

  const surplusCandidates = batchItems.filter(
    (x) =>
      !x.order_id &&
      (x.observation?.includes('Compra para estoque') ||
        x.id === parent?.batch_info?.surplus_shortage_id),
  )
  const surplusMember =
    surplusCandidates.find((x) => x.id === parent?.batch_info?.surplus_shortage_id) ||
    surplusCandidates[surplusCandidates.length - 1]

  let totalReceived = '0'
  if (actualQty && actualQty > 0) {
    totalReceived = String(actualQty)
  } else if (surplusMember && Number(surplusMember.quantity) > 0) {
    const opSum = opMembers.reduce((s, x) => s + (Number(x.quantity) || 0), 0)
    totalReceived = String(opSum + Number(surplusMember.quantity))
  } else {
    const sumTotal = batchItems.reduce((s, x) => s + (Number(x.quantity) || 0), 0)
    totalReceived = String(sumTotal)
  }

  const distributions: Record<string, string> = {}
  for (const bItem of opMembers) {
    const needed = Number(bItem.quantity) || 0
    const already = Number(bItem.received_quantity) || 0
    const rem = Math.max(0, needed - already)
    if (rem > 0) {
      distributions[bItem.id] = String(rem)
    }
  }

  const totalDistributed = Object.values(distributions).reduce((s, q) => s + (Number(q) || 0), 0)
  const surplusToInventory = Math.max(0, (Number(totalReceived) || 0) - totalDistributed)

  return {
    totalReceived,
    distributions,
    totalDistributed,
    surplusToInventory,
    opMembersCount: opMembers.length,
    hasSurplusMember: Boolean(surplusMember),
  }
}

describe('SmartReceiveDialog - Recebimento de Lote com Quantidade Adicional / Excedente', () => {
  const mockOp1: MaterialShortage = {
    id: 'owbbm9ibmq0pntn',
    code: '05090003',
    description: 'Soquete e27',
    quantity: 1,
    order_id: 'order_1',
    batch_id: 'batch_soquete_123',
    batch_info: {
      is_batch_parent: true,
      actual_quantity: 19,
      requested_total: 10,
      surplus_quantity: 9,
      sub_shortage_ids: ['owbbm9ibmq0pntn', 'pvja5jo8r1l36bv', 'rwszhhy714twx1e'],
      surplus_shortage_id: 'surplus_999',
    },
    status: 'Compra',
    sector: 'Acabamento',
    priority: 'Sem pressa',
    request_type: 'Materiais',
    created: '2026-09-23T15:45:07Z',
    updated: '2026-09-29T21:57:33Z',
  }

  const mockOp2: MaterialShortage = {
    id: 'pvja5jo8r1l36bv',
    code: '05090003',
    description: 'Soquete e27',
    quantity: 5,
    order_id: 'order_2',
    batch_id: 'batch_soquete_123',
    status: 'Compra',
    sector: 'Acabamento',
    priority: 'Sem pressa',
    request_type: 'Materiais',
    created: '2026-09-23T15:43:08Z',
    updated: '2026-09-29T21:57:01Z',
  }

  const mockOp3: MaterialShortage = {
    id: 'rwszhhy714twx1e',
    code: '05090003',
    description: 'Soquete e27',
    quantity: 4,
    order_id: 'order_3',
    batch_id: 'batch_soquete_123',
    status: 'Compra',
    sector: 'Acabamento',
    priority: 'Sem pressa',
    request_type: 'Materiais',
    created: '2026-09-23T15:42:04Z',
    updated: '2026-09-29T21:57:01Z',
  }

  const mockSurplusShortage: MaterialShortage = {
    id: 'surplus_999',
    code: '05090003',
    description: 'Soquete e27',
    quantity: 9,
    batch_id: 'batch_soquete_123',
    status: 'Compra',
    observation:
      'Compra para estoque (excedente de lote consolidado: 19 un compradas − 10 un solicitadas)',
    sector: 'Acabamento',
    priority: 'Sem pressa',
    request_type: 'Materiais',
    created: '2026-09-29T21:58:00Z',
    updated: '2026-09-29T21:58:00Z',
  }

  const fullBatch = [mockOp1, mockOp2, mockOp3, mockSurplusShortage]

  it('carrega todos os membros do lote e pré-preenche a quantidade total recebida com a quantidade real do lote (19 un)', () => {
    const state = calculateBatchSmartReceiveInitialState(fullBatch, mockOp1)

    // Total recebido pré-preenchido com a quantidade real do lote (19 un)
    expect(state.totalReceived).toBe('19')
  })

  it('pré-distribui as quantidades exatas para baixa das OPs vinculadas (1, 5, 4 un)', () => {
    const state = calculateBatchSmartReceiveInitialState(fullBatch, mockOp1)

    expect(state.distributions['owbbm9ibmq0pntn']).toBe('1')
    expect(state.distributions['pvja5jo8r1l36bv']).toBe('5')
    expect(state.distributions['rwszhhy714twx1e']).toBe('4')
    // A linha de excedente de estoque NÃO é uma OP para baixa individual
    expect(state.distributions['surplus_999']).toBeUndefined()
    expect(state.totalDistributed).toBe(10)
  })

  it('direciona o EXCEDENTE (9 un) para o saldo do inventário (estoque geral)', () => {
    const state = calculateBatchSmartReceiveInitialState(fullBatch, mockOp1)

    // 19 recebidas - 10 distribuídas para OPs = 9 un excedente que alimentará inventory
    expect(state.surplusToInventory).toBe(9)
  })

  it('se aberto a partir de uma OP secundária do lote (ex.: pvja5jo8r1l36bv), localiza o pai e pré-preenche corretamente 19 un e 9 un excedente', () => {
    const state = calculateBatchSmartReceiveInitialState(fullBatch, mockOp2)

    expect(state.totalReceived).toBe('19')
    expect(state.totalDistributed).toBe(10)
    expect(state.surplusToInventory).toBe(9)
  })

  it('buildRecebimentoDisplayItems agrupa registros com o mesmo batch_id em UMA ÚNICA LINHA exibindo a quantidade real (17 un da OC)', () => {
    // Cenário real do Soquete E27 com a OC 38.911:
    // 3 solicitações de OPs (1, 5, 4 un) + 1 excedente mantido (7 un) + duplicado cancelado (9 un)
    const op1: MaterialShortage = {
      ...mockOp1,
      batch_id: 'lote_soquete_e27_retroativo',
      batch_info: {
        is_batch_parent: true,
        actual_quantity: 17,
        requested_total: 10,
        surplus_quantity: 7,
        sub_shortage_ids: ['owbbm9ibmq0pntn', 'pvja5jo8r1l36bv', 'rwszhhy714twx1e'],
        surplus_shortage_id: '5hcl185ovv57nai',
      },
    }
    const op2: MaterialShortage = { ...mockOp2, batch_id: 'lote_soquete_e27_retroativo' }
    const op3: MaterialShortage = { ...mockOp3, batch_id: 'lote_soquete_e27_retroativo' }
    const surplus7: MaterialShortage = {
      id: '5hcl185ovv57nai',
      code: '05090003',
      description: 'Soquete e27',
      quantity: 7,
      batch_id: 'lote_soquete_e27_retroativo',
      status: 'Compra',
      observation:
        'Compra para estoque (excedente de lote consolidado: 17 un compradas − 10 un solicitadas)',
      sector: 'Acabamento',
      created: '2026-09-29T22:16:40Z',
      updated: '2026-09-29T22:28:20Z',
    }

    const testShortages = [op1, op2, op3, surplus7]
    const displayItems = buildRecebimentoDisplayItems(testShortages)

    // Deve gerar exatamente 1 linha de lote consolidado
    expect(displayItems).toHaveLength(1)
    const batchRow = displayItems[0]

    expect(batchRow.type).toBe('batch')
    expect(batchRow.id).toBe('lote_soquete_e27_retroativo')
    // Quantidade total exibida deve ser 17 (quantidade real da OC) e NÃO a soma de registros
    expect(batchRow.totalQuantity).toBe(17)
    expect(batchRow.opQuantity).toBe(10)
    expect(batchRow.surplusQuantity).toBe(7)
    expect(batchRow.opItems).toHaveLength(3)
  })
})
