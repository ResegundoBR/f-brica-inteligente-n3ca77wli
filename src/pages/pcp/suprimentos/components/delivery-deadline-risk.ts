import { differenceInCalendarDays } from 'date-fns'
import { MaterialShortage } from '@/types'
import { ItemDemandConsolidation } from '@/services/material-consolidation'

export interface MostUrgentOpContext {
  opNumber: string
  orderNumber?: string
  deliveryDateStr: string
  daysUntilDue: number // diferença em dias calendário entre deliveryDate e hoje
  isPastDue: boolean
}

export interface DeliveryDeadlineCheckResult {
  hasRisk: boolean
  deliveryDays: number
  mostUrgentOp: MostUrgentOpContext | null
  message?: string
  urgencyLevel?: 'urgent' | 'warning'
}

/**
 * Converte string de data no formato ISO ou YYYY-MM-DD em objeto Date local sem desvio de fuso
 */
export function parseDateOnly(dateStr?: string | null): Date | null {
  if (!dateStr) return null
  try {
    const cleaned = dateStr.slice(0, 10)
    const parts = cleaned.split('-').map(Number)
    if (parts.length !== 3) return null
    const [y, m, d] = parts
    if (!y || !m || !d) return null
    const target = new Date(y, m - 1, d)
    if (isNaN(target.getTime())) return null
    return target
  } catch {
    return null
  }
}

/**
 * Normaliza uma data para início do dia de hoje (00:00:00 local)
 */
export function getTodayDate(refDate: Date = new Date()): Date {
  return new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate())
}

/**
 * Encontra a OP mais urgente (com menor deliveryDate) no contexto:
 * - Se consolidation tiver otherDemands, analisa as datas das linhas consolidadas (já ordenadas crescente)
 * - Analisa também o item atual e os itens do grupo (groupList), se possuírem order_id.delivery_date ou expected_date
 * - Retorna o contexto da OP com a menor data de vencimento
 */
export function findMostUrgentOp(params: {
  currentItem?: MaterialShortage | null
  groupList?: MaterialShortage[]
  consolidation?: ItemDemandConsolidation | null
  referenceDate?: Date
}): MostUrgentOpContext | null {
  const { currentItem, groupList, consolidation, referenceDate = new Date() } = params
  const today = getTodayDate(referenceDate)

  interface Candidate {
    opNumber: string
    orderNumber?: string
    deliveryDateStr: string
    parsedDate: Date
  }

  const candidates: Candidate[] = []

  // 1. Linhas do ConsolidatedDemandBlock (otherDemands)
  if (consolidation?.otherDemands && consolidation.otherDemands.length > 0) {
    for (const demand of consolidation.otherDemands) {
      if (demand.deliveryDate) {
        const parsed = parseDateOnly(demand.deliveryDate)
        if (parsed) {
          const opNum =
            demand.opNumber && demand.opNumber !== '-'
              ? demand.opNumber
              : demand.orderNumber || 'OP'
          candidates.push({
            opNumber: opNum,
            orderNumber: demand.orderNumber,
            deliveryDateStr: demand.deliveryDate.slice(0, 10),
            parsedDate: parsed,
          })
        }
      }
    }
  }

  // 2. Itens do grupo (lote consolidado isMultiItem)
  if (groupList && groupList.length > 0) {
    for (const g of groupList) {
      const order = g.expand?.order_id
      const dateStr = order?.delivery_date || g.expected_date
      if (dateStr) {
        const parsed = parseDateOnly(dateStr)
        if (parsed) {
          const opNum = order?.op_number || order?.order_number || '-'
          candidates.push({
            opNumber: opNum !== '-' ? opNum : 'OP',
            orderNumber: order?.order_number,
            deliveryDateStr: dateStr.slice(0, 10),
            parsedDate: parsed,
          })
        }
      }
    }
  } else if (currentItem) {
    // 3. Item único
    const order = currentItem.expand?.order_id
    const dateStr = order?.delivery_date || currentItem.expected_date
    if (dateStr) {
      const parsed = parseDateOnly(dateStr)
      if (parsed) {
        const opNum = order?.op_number || order?.order_number || '-'
        candidates.push({
          opNumber: opNum !== '-' ? opNum : 'OP',
          orderNumber: order?.order_number,
          deliveryDateStr: dateStr.slice(0, 10),
          parsedDate: parsed,
        })
      }
    }
  }

  if (candidates.length === 0) return null

  // Ordenar pela menor data (mais antiga / mais urgente)
  candidates.sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime())

  const mostUrgent = candidates[0]
  const daysUntilDue = differenceInCalendarDays(mostUrgent.parsedDate, today)

  return {
    opNumber: mostUrgent.opNumber,
    orderNumber: mostUrgent.orderNumber,
    deliveryDateStr: mostUrgent.deliveryDateStr,
    daysUntilDue,
    isPastDue: daysUntilDue < 0,
  }
}

/**
 * Realiza o cruzamento do prazo de entrega informado em dias com o vencimento da OP mais urgente.
 *
 * Regras:
 * - Se prazo for nulo, indefinido ou <= 0: sem aviso (hasRisk: false).
 * - Se não houver data de vencimento da OP: sem aviso (hasRisk: false).
 * - Data prevista de entrega = hoje + prazo em dias.
 * - Se prazo em dias > dias restantes para o vencimento da OP (isto é, entrega prevista posterior ao vencimento):
 *     hasRisk = true
 *     Exibe aviso destacado (âmbar/vermelho) não bloqueante.
 * - Se entrega prevista cobre o vencimento (prazo <= dias restantes): hasRisk = false (silêncio).
 */
export function checkQuotationDeliveryRisk(params: {
  deliveryDays?: number | string | null
  mostUrgentOp: MostUrgentOpContext | null
}): DeliveryDeadlineCheckResult {
  const { deliveryDays: rawDays, mostUrgentOp } = params

  if (rawDays == null || rawDays === '') {
    return { hasRisk: false, deliveryDays: 0, mostUrgentOp }
  }

  const days = typeof rawDays === 'number' ? rawDays : parseInt(String(rawDays), 10)

  if (isNaN(days) || days <= 0 || !mostUrgentOp) {
    return { hasRisk: false, deliveryDays: isNaN(days) ? 0 : days, mostUrgentOp }
  }

  const { opNumber, daysUntilDue, isPastDue } = mostUrgentOp

  // A entrega prevista chega no dia (hoje + days).
  // A OP vence no dia (hoje + daysUntilDue).
  // Se days > daysUntilDue, a entrega é posterior ao vencimento da OP.
  if (days > daysUntilDue) {
    let message = ''
    if (isPastDue) {
      const overdueDays = Math.abs(daysUntilDue)
      const overdueText = overdueDays === 0 ? 'hoje' : `vencida há ${overdueDays} dia(s)`
      message = `⚠ Entrega prevista em ${days} dia${days === 1 ? '' : 's'}, mas a OP ${opNumber} já está ${overdueText} — risco crítico de atraso.`
    } else if (daysUntilDue === 0) {
      message = `⚠ Entrega prevista em ${days} dia${days === 1 ? '' : 's'}, mas a OP ${opNumber} vence hoje — risco de atraso.`
    } else {
      message = `⚠ Entrega prevista em ${days} dia${days === 1 ? '' : 's'}, mas a OP ${opNumber} vence em ${daysUntilDue} dia${daysUntilDue === 1 ? '' : 's'} — risco de atraso.`
    }

    // Se já estiver vencida ou vencer em <= 3 dias, urgência vermelha ('urgent'); senão âmbar ('warning')
    const urgencyLevel: 'urgent' | 'warning' = daysUntilDue <= 3 ? 'urgent' : 'warning'

    return {
      hasRisk: true,
      deliveryDays: days,
      mostUrgentOp,
      message,
      urgencyLevel,
    }
  }

  // Prazo cobre o vencimento (silêncio)
  return {
    hasRisk: false,
    deliveryDays: days,
    mostUrgentOp,
  }
}
