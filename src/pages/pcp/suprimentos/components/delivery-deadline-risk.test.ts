import { describe, it, expect } from 'vitest'
import {
  findMostUrgentOp,
  checkQuotationDeliveryRisk,
  parseDateOnly,
  getTodayDate,
} from './delivery-deadline-risk'
import { MaterialShortage, PcpOrder } from '@/types'
import { ItemDemandConsolidation, OtherOpDemandItem } from '@/services/material-consolidation'

describe('Aviso de Prazo de Compra × Vencimento da OP (delivery-deadline-risk)', () => {
  // Fixar data de referência para testes reprodutíveis: 2026-05-10
  const referenceDate = new Date(2026, 4, 10) // 10 de Maio de 2026

  const mockOrderOp1: PcpOrder = {
    id: 'ord-1',
    order_number: 'PED-101',
    op_number: '000517/2026',
    client_name: 'Cliente A',
    quantity: 10,
    is_special: false,
    status: 'Em Andamento',
    stage: 'Cotação',
    bottleneck_reason: 'Nenhum',
    delivery_date: '2026-05-13', // vence em 3 dias em relação a 2026-05-10
    created: '2026-05-01',
    updated: '2026-05-01',
  }

  const mockOrderOp2: PcpOrder = {
    id: 'ord-2',
    order_number: 'PED-102',
    op_number: '000520/2026',
    client_name: 'Cliente B',
    quantity: 5,
    is_special: false,
    status: 'Em Andamento',
    stage: 'Cotação',
    bottleneck_reason: 'Nenhum',
    delivery_date: '2026-05-20', // vence em 10 dias
    created: '2026-05-01',
    updated: '2026-05-01',
  }

  const mockOrderOp3: PcpOrder = {
    id: 'ord-3',
    order_number: 'PED-103',
    op_number: '000515/2026',
    client_name: 'Cliente C',
    quantity: 8,
    is_special: false,
    status: 'Em Andamento',
    stage: 'Cotação',
    bottleneck_reason: 'Nenhum',
    delivery_date: '2026-05-08', // já vencida há 2 dias
    created: '2026-05-01',
    updated: '2026-05-01',
  }

  it('parseDateOnly faz parse correto de data sem desvio de timezone', () => {
    const d = parseDateOnly('2026-05-13')
    expect(d).not.toBeNull()
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(4) // 0-based
    expect(d?.getDate()).toBe(13)
  })

  it('no item único: identifica a OP e calcula dias restantes até o vencimento', () => {
    const singleItem: MaterialShortage = {
      id: 'shortage-1',
      order_id: 'ord-1',
      code: 'PARAF-M6',
      description: 'Parafuso M6',
      quantity: 10,
      sector: 'Montagem',
      status: 'Cotação',
      created: '2026-05-01',
      updated: '2026-05-01',
      expand: {
        order_id: mockOrderOp1,
      },
    }

    const mostUrgent = findMostUrgentOp({
      currentItem: singleItem,
      referenceDate,
    })

    expect(mostUrgent).not.toBeNull()
    expect(mostUrgent?.opNumber).toBe('000517/2026')
    expect(mostUrgent?.daysUntilDue).toBe(3)
    expect(mostUrgent?.isPastDue).toBe(false)
  })

  it('cotação com prazo MAIOR que dias restantes da OP mais urgente exibe o aviso com os números corretos', () => {
    const singleItem: MaterialShortage = {
      id: 'shortage-1',
      order_id: 'ord-1',
      code: 'PARAF-M6',
      description: 'Parafuso M6',
      quantity: 10,
      sector: 'Montagem',
      status: 'Cotação',
      created: '2026-05-01',
      updated: '2026-05-01',
      expand: {
        order_id: mockOrderOp1, // vence em 3 dias
      },
    }

    const mostUrgent = findMostUrgentOp({
      currentItem: singleItem,
      referenceDate,
    })

    // Prazo de entrega de 10 dias quando a OP vence em 3 dias
    const result = checkQuotationDeliveryRisk({
      deliveryDays: 10,
      mostUrgentOp: mostUrgent,
    })

    expect(result.hasRisk).toBe(true)
    expect(result.deliveryDays).toBe(10)
    expect(result.mostUrgentOp?.opNumber).toBe('000517/2026')
    expect(result.mostUrgentOp?.daysUntilDue).toBe(3)
    expect(result.urgencyLevel).toBe('urgent')
    expect(result.message).toContain('Entrega prevista em 10 dias')
    expect(result.message).toContain('OP 000517/2026 vence em 3 dias')
    expect(result.message).toContain('risco de atraso')
  })

  it('prazo SUFICIENTE não exibe aviso (silêncio = ok)', () => {
    const singleItem: MaterialShortage = {
      id: 'shortage-1',
      order_id: 'ord-1',
      code: 'PARAF-M6',
      description: 'Parafuso M6',
      quantity: 10,
      sector: 'Montagem',
      status: 'Cotação',
      created: '2026-05-01',
      updated: '2026-05-01',
      expand: {
        order_id: mockOrderOp1, // vence em 3 dias
      },
    }

    const mostUrgent = findMostUrgentOp({
      currentItem: singleItem,
      referenceDate,
    })

    // Prazo de entrega de 2 dias (menor que 3 dias)
    const result2Days = checkQuotationDeliveryRisk({
      deliveryDays: 2,
      mostUrgentOp: mostUrgent,
    })
    expect(result2Days.hasRisk).toBe(false)
    expect(result2Days.message).toBeUndefined()

    // Prazo de entrega exatamente no dia do vencimento (3 dias)
    const result3Days = checkQuotationDeliveryRisk({
      deliveryDays: 3,
      mostUrgentOp: mostUrgent,
    })
    expect(result3Days.hasRisk).toBe(false)
  })

  it('prazo vazio, zero ou negativo não dispara aviso', () => {
    const mostUrgent = {
      opNumber: '000517/2026',
      deliveryDateStr: '2026-05-13',
      daysUntilDue: 3,
      isPastDue: false,
    }

    expect(checkQuotationDeliveryRisk({ deliveryDays: '', mostUrgentOp: mostUrgent }).hasRisk).toBe(
      false,
    )
    expect(
      checkQuotationDeliveryRisk({ deliveryDays: null, mostUrgentOp: mostUrgent }).hasRisk,
    ).toBe(false)
    expect(checkQuotationDeliveryRisk({ deliveryDays: 0, mostUrgentOp: mostUrgent }).hasRisk).toBe(
      false,
    )
    expect(checkQuotationDeliveryRisk({ deliveryDays: -5, mostUrgentOp: mostUrgent }).hasRisk).toBe(
      false,
    )
  })

  it('no modo grupo consolidado (isMultiItem): usa a OP mais urgente do lote', () => {
    // Grupo com 2 itens: um vence em 10 dias (OP 000520/2026) e outro em 3 dias (OP 000517/2026)
    const item1: MaterialShortage = {
      id: 'shortage-1',
      order_id: 'ord-2',
      code: 'CABO-10',
      description: 'Cabo 10mm',
      quantity: 5,
      sector: 'Montagem',
      status: 'Cotação',
      created: '2026-05-01',
      updated: '2026-05-01',
      expand: {
        order_id: mockOrderOp2, // 2026-05-20 (10 dias)
      },
    }

    const item2: MaterialShortage = {
      id: 'shortage-2',
      order_id: 'ord-1',
      code: 'CABO-10',
      description: 'Cabo 10mm',
      quantity: 10,
      sector: 'Montagem',
      status: 'Cotação',
      created: '2026-05-01',
      updated: '2026-05-01',
      expand: {
        order_id: mockOrderOp1, // 2026-05-13 (3 dias) -> mais urgente do lote!
      },
    }

    const groupList = [item1, item2]

    const mostUrgent = findMostUrgentOp({
      currentItem: item1,
      groupList,
      referenceDate,
    })

    // Deve selecionar a OP do item2 (000517/2026), pois é a mais urgente do lote (3 dias vs 10 dias)
    expect(mostUrgent).not.toBeNull()
    expect(mostUrgent?.opNumber).toBe('000517/2026')
    expect(mostUrgent?.daysUntilDue).toBe(3)

    // Se fornecedor pedir 7 dias de prazo:
    // 7 > 3 => risco de atraso apontando para a OP 000517/2026
    const risk = checkQuotationDeliveryRisk({
      deliveryDays: 7,
      mostUrgentOp: mostUrgent,
    })
    expect(risk.hasRisk).toBe(true)
    expect(risk.mostUrgentOp?.opNumber).toBe('000517/2026')
    expect(risk.message).toContain('OP 000517/2026 vence em 3 dias')
  })

  it('quando o ConsolidatedDemandBlock traz OPs adicionais, seleciona a menor data global entre lote e outras OPs', () => {
    const item1: MaterialShortage = {
      id: 'shortage-1',
      order_id: 'ord-2',
      code: 'CABO-10',
      description: 'Cabo 10mm',
      quantity: 5,
      sector: 'Montagem',
      status: 'Cotação',
      created: '2026-05-01',
      updated: '2026-05-01',
      expand: {
        order_id: mockOrderOp2, // vence em 10 dias (2026-05-20)
      },
    }

    const demandOtherOp: OtherOpDemandItem = {
      shortageId: 'other-1',
      demandType: 'solicitacao_aberta',
      orderId: 'ord-1',
      orderNumber: 'PED-101',
      opNumber: '000517/2026',
      deliveryDate: '2026-05-13', // vence em 3 dias
      quantity: 12,
      originalQuantity: 12,
      receivedQuantity: 0,
      status: 'Cotação',
    }

    const consolidation: ItemDemandConsolidation = {
      currentBalance: 5,
      otherDemands: [demandOtherOp],
      totalOtherQuantity: 12,
      totalConsolidatedQuantity: 17,
      countOtherOps: 1,
      totalOpenShortagesQuantity: 12,
      totalFutureDemandsQuantity: 0,
    }

    const mostUrgent = findMostUrgentOp({
      currentItem: item1,
      consolidation,
      referenceDate,
    })

    expect(mostUrgent).not.toBeNull()
    expect(mostUrgent?.opNumber).toBe('000517/2026')
    expect(mostUrgent?.daysUntilDue).toBe(3)
  })

  it('quando a OP mais urgente já está vencida no passado (daysUntilDue < 0), exibe mensagem de já vencida e status urgente', () => {
    const singleItem: MaterialShortage = {
      id: 'shortage-3',
      order_id: 'ord-3',
      code: 'PARAF-M6',
      description: 'Parafuso M6',
      quantity: 8,
      sector: 'Montagem',
      status: 'Cotação',
      created: '2026-05-01',
      updated: '2026-05-01',
      expand: {
        order_id: mockOrderOp3, // 2026-05-08 -> já vencida há 2 dias em relação a 2026-05-10
      },
    }

    const mostUrgent = findMostUrgentOp({
      currentItem: singleItem,
      referenceDate,
    })

    expect(mostUrgent?.isPastDue).toBe(true)
    expect(mostUrgent?.daysUntilDue).toBe(-2)

    const risk = checkQuotationDeliveryRisk({
      deliveryDays: 5,
      mostUrgentOp: mostUrgent,
    })

    expect(risk.hasRisk).toBe(true)
    expect(risk.urgencyLevel).toBe('urgent')
    expect(risk.message).toContain('já está vencida há 2 dia(s)')
  })

  it('quando a OP vence hoje (daysUntilDue === 0), prazo > 0 exibe aviso adequado', () => {
    const mostUrgent = {
      opNumber: '000599/2026',
      deliveryDateStr: '2026-05-10',
      daysUntilDue: 0,
      isPastDue: false,
    }

    const risk = checkQuotationDeliveryRisk({
      deliveryDays: 1,
      mostUrgentOp: mostUrgent,
    })

    expect(risk.hasRisk).toBe(true)
    expect(risk.urgencyLevel).toBe('urgent')
    expect(risk.message).toContain('vence hoje')
  })
})
