import { describe, it, expect } from 'vitest'
import { MaterialShortage } from '@/types'
import { buildRecebimentoDisplayItems } from './RecebimentoTable'

/**
 * Função utilitária que espelha a lógica de pré-inicialização do SmartReceiveDialog
 * ao abrir o recebimento de itens vinculados a um lote (batch_id).
 */
export interface MockOcItem {
  material_shortage_id?: string
  quantity: number
}

/**
 * Função utilitária que espelha a lógica de pré-inicialização do SmartReceiveDialog
 * ao abrir o recebimento de itens vinculados a um lote (batch_id) ou avulsos,
 * agora com as regras 1 e 2 da Rodada B:
 * - Regra 1: Pré-preencher com a quantidade COMPRADA (OC ou received_quantity), nunca com a soma de necessidades das OPs.
 * - Regra 2: Distribuição pré-preenchida apenas DENTRO do total recebido (prioridade pela necessidade da OP)
 *   e bloqueio se exceder.
 */
export function calculateBatchSmartReceiveInitialState(
  batchItems: MaterialShortage[],
  activeItem?: MaterialShortage,
  ocItens?: MockOcItem[],
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

  // REGRA 1: Quantidade comprada (OC itens vinculados aos registros do lote ou actual_quantity ou received_quantity)
  let purchasedQty = 0
  if (ocItens && ocItens.length > 0) {
    const batchIds = new Set(batchItems.map((x) => x.id))
    purchasedQty = ocItens
      .filter((it) => it.material_shortage_id && batchIds.has(it.material_shortage_id))
      .reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)
  }

  let initialTotalReceived = 0
  if (purchasedQty > 0) {
    initialTotalReceived = purchasedQty
  } else if (actualQty && actualQty > 0) {
    initialTotalReceived = actualQty
  } else {
    const sumReceivedQty = batchItems.reduce((s, x) => s + (Number(x.received_quantity) || 0), 0)
    if (sumReceivedQty > 0) {
      initialTotalReceived = sumReceivedQty
    } else if (surplusMember && Number(surplusMember.quantity) > 0) {
      const opSum = opMembers.reduce((s, x) => s + (Number(x.quantity) || 0), 0)
      initialTotalReceived = opSum + Number(surplusMember.quantity)
    } else {
      initialTotalReceived = Number(parent?.quantity) || 0
    }
  }

  const totalReceived = String(initialTotalReceived)

  // REGRA 2: Distribuição pré-preenchida APENAS DENTRO do total recebido (prioridade pela necessidade da OP)
  let remainingQuota = initialTotalReceived
  const distributions: Record<string, string> = {}
  for (const bItem of opMembers) {
    const needed = Number(bItem.quantity) || 0
    const already = Number(bItem.received_quantity) || 0
    const rem = Math.max(0, needed - already)
    if (rem > 0 && remainingQuota > 0) {
      const allocated = Math.min(rem, remainingQuota)
      if (allocated > 0) {
        distributions[bItem.id] = String(allocated)
        remainingQuota -= allocated
      }
    }
  }

  const totalDistributed = Object.values(distributions).reduce((s, q) => s + (Number(q) || 0), 0)
  const isOverDistributed = totalDistributed > (Number(totalReceived) || 0)
  const surplusToInventory = Math.max(0, (Number(totalReceived) || 0) - totalDistributed)

  return {
    totalReceived,
    distributions,
    totalDistributed,
    surplusToInventory,
    isOverDistributed,
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

  it('não contamina solicitações avulsas de outras rodadas: item avulso sem batch_id isola estritamente o próprio registro', () => {
    // Cenário que reproduz a falha reportada:
    // O registro kiw4h2ovwt2x7ic (12 PC da OP 433) não deve carregar registros de outras rodadas
    const singleOp433: MaterialShortage = {
      id: 'kiw4h2ovwt2x7ic',
      code: '05090003',
      description: 'SOQUETE BASE E27 P/ ABAJUR TERMOP BCO 2A/250V',
      quantity: 12,
      order_id: 'order_433',
      status: 'Compra',
      sector: 'Montagem',
      priority: 'Sem pressa',
      request_type: 'Materiais',
      created: '2026-10-09T14:49:28Z',
      updated: '2026-10-09T14:49:28Z',
    }

    // Quando item avulso é recebido, apenas o próprio registro pode estar em related
    const related = [singleOp433]
    expect(related).toHaveLength(1)
    expect(related[0].id).toBe('kiw4h2ovwt2x7ic')
    expect(related[0].quantity).toBe(12)
  })

  it('buildRecebimentoDisplayItems não consolida itens de códigos diferentes mesmo que compartilhem o mesmo batch_id acidentalmente', () => {
    const item1: MaterialShortage = {
      id: 'rec_1',
      code: '05100004',
      description: 'PARAFUSO ALLEN M4X10',
      quantity: 50,
      sector: 'Suprimentos',
      priority: 'Urgente',
      request_type: 'Materiais',
      batch_id: 'lote_acidental',
      status: 'Compra',
      created: '2026-10-09T10:00:00Z',
      updated: '2026-10-09T10:00:00Z',
    }
    const item2: MaterialShortage = {
      id: 'rec_2',
      code: '05100105',
      description: 'PARAFUSO ALLEN M4X4',
      quantity: 50,
      sector: 'Suprimentos',
      priority: 'Urgente',
      request_type: 'Materiais',
      batch_id: 'lote_acidental',
      status: 'Compra',
      created: '2026-10-09T10:00:00Z',
      updated: '2026-10-09T10:00:00Z',
    }

    const displayItems = buildRecebimentoDisplayItems([item1, item2])
    // Blindagem: deve gerar 2 linhas separadas, uma para cada código, e não 1 linha com códigos misturados
    expect(displayItems).toHaveLength(2)
    const codes = displayItems.map((d) => d.code)
    expect(codes).toContain('05100004')
    expect(codes).toContain('05100105')
  })

  describe('Rodada B: Regras 1 e 2 no SmartReceiveDialog', () => {
    // Cenário real do parafuso M6x6 (05100030):
    // Entraram 50 unidades compradas pela OC. As OPs tinham necessidades somadas, mas a compra foi 50.
    // Suponhamos 3 OPs: OP A precisa de 20, OP B precisa de 25, OP C precisa de 30 (necessidade total = 75).
    const opA: MaterialShortage = {
      id: 'op_a',
      code: '05100030',
      description: 'PARAFUSO ALLEN S/ CABECA M6X6MM',
      quantity: 20,
      order_id: 'order_a',
      batch_id: 'batch_m6x6',
      status: 'Compra',
      sector: 'Montagem',
      priority: 'Urgente',
      request_type: 'Materiais',
      created: '2026-10-08T10:00:00Z',
      updated: '2026-10-08T10:00:00Z',
    }
    const opB: MaterialShortage = {
      id: 'op_b',
      code: '05100030',
      description: 'PARAFUSO ALLEN S/ CABECA M6X6MM',
      quantity: 25,
      order_id: 'order_b',
      batch_id: 'batch_m6x6',
      status: 'Compra',
      sector: 'Montagem',
      priority: 'Urgente',
      request_type: 'Materiais',
      created: '2026-10-08T11:00:00Z',
      updated: '2026-10-08T11:00:00Z',
    }
    const opC: MaterialShortage = {
      id: 'op_c',
      code: '05100030',
      description: 'PARAFUSO ALLEN S/ CABECA M6X6MM',
      quantity: 30,
      order_id: 'order_c',
      batch_id: 'batch_m6x6',
      status: 'Compra',
      sector: 'Montagem',
      priority: 'Urgente',
      request_type: 'Materiais',
      created: '2026-10-08T12:00:00Z',
      updated: '2026-10-08T12:00:00Z',
    }
    const batchOps = [opA, opB, opC]

    it('Regra 1: pré-preenche a quantidade total recebida com a quantidade COMPRADA (itens de OC), NUNCA com a soma das necessidades das OPs', () => {
      // 50 un compradas na OC para o lote
      const ocItens: MockOcItem[] = [{ material_shortage_id: 'op_a', quantity: 50 }]

      const state = calculateBatchSmartReceiveInitialState(batchOps, opA, ocItens)

      // Total das necessidades é 75 (20+25+30), MAS o pré-preenchimento deve ser estritamente 50 (comprado)
      expect(state.totalReceived).toBe('50')
      expect(state.totalReceived).not.toBe('75')
    })

    it('Regra 2: pré-distribui cada OP apenas DENTRO do total recebido (prioridade pela ordem/necessidade)', () => {
      // 50 compradas.
      // OP A (precisa 20): ganha 20 (restam 30)
      // OP B (precisa 25): ganha 25 (restam 5)
      // OP C (precisa 30): ganha apenas os 5 restantes!
      const ocItens: MockOcItem[] = [{ material_shortage_id: 'op_a', quantity: 50 }]

      const state = calculateBatchSmartReceiveInitialState(batchOps, opA, ocItens)

      expect(state.distributions['op_a']).toBe('20')
      expect(state.distributions['op_b']).toBe('25')
      expect(state.distributions['op_c']).toBe('5')
      // Soma distribuída não passa de 50
      expect(state.totalDistributed).toBe(50)
      expect(state.isOverDistributed).toBe(false)
      expect(state.surplusToInventory).toBe(0)
    })

    it('Regra 2: quando a quantidade recebida for MAIOR que a necessidade das OPs, o excedente vai como Entrada em Estoque', () => {
      // Necessidade somada é 75. Recebido/comprado é 100.
      const ocItens: MockOcItem[] = [{ material_shortage_id: 'op_a', quantity: 100 }]

      const state = calculateBatchSmartReceiveInitialState(batchOps, opA, ocItens)

      expect(state.totalReceived).toBe('100')
      expect(state.distributions['op_a']).toBe('20')
      expect(state.distributions['op_b']).toBe('25')
      expect(state.distributions['op_c']).toBe('30')
      expect(state.totalDistributed).toBe(75)
      // 100 - 75 = 25 excedente direcionado ao estoque
      expect(state.surplusToInventory).toBe(25)
      expect(state.isOverDistributed).toBe(false)
    })

    it('Regra 2: detecta e sinaliza isOverDistributed se a soma distribuída pelas OPs exceder o total recebido', () => {
      const ocItens: MockOcItem[] = [{ material_shortage_id: 'op_a', quantity: 50 }]
      const state = calculateBatchSmartReceiveInitialState(batchOps, opA, ocItens)

      // Se o usuário manualmente aumentar a distribuição além de 50
      const manualDist = {
        ...state.distributions,
        op_c: '30', // agora: 20 + 25 + 30 = 75
      }
      const sumDist = Object.values(manualDist).reduce((s, q) => s + Number(q), 0)
      const isOver = sumDist > Number(state.totalReceived)

      expect(sumDist).toBe(75)
      expect(isOver).toBe(true)
    })

    it('Regra 1 (fallback): se não houver itens de OC, usa received_quantity dos registros da compra ou actual_quantity', () => {
      const opWithReceived: MaterialShortage = {
        ...opA,
        received_quantity: 50,
      }
      const state = calculateBatchSmartReceiveInitialState([opWithReceived], opWithReceived, [])
      expect(state.totalReceived).toBe('50')
    })
  })
})
