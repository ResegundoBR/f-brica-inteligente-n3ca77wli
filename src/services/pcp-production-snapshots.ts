import pb from '@/lib/pocketbase/client'
import { PcpOrder, PcpProductionSnapshot } from '@/types'
import { format, parseISO, isValid, isBefore, startOfDay, differenceInCalendarDays } from 'date-fns'

export interface CalculatedSnapshotMetrics {
  total: number
  delayed: number
  toStart: number
  inProcess: number
  expedition: number
  linha: number
  especial: number
  assistencia: number
  openOrdersCount: number
  delayedOrdersCount: number
  isPersisted?: boolean
  snapshotId?: string
}

/**
 * Calcula métricas de um snapshot a partir das OPs atuais (reconstrução computada/fallback).
 * Utilizado para datas anteriores ao primeiro snapshot gravado para não haver buraco branco.
 */
export function computeHistoricalSnapshotFromOrders(
  orders: PcpOrder[],
  refDate: Date,
): CalculatedSnapshotMetrics {
  const dayEnd = new Date(refDate)
  dayEnd.setHours(23, 59, 59, 999)
  const dayStart = startOfDay(refDate)
  const refDateStr = format(refDate, 'yyyy-MM-dd')

  let total = 0
  let delayed = 0
  let toStart = 0
  let inProcess = 0
  let expedition = 0
  let linha = 0
  let especial = 0
  let assistencia = 0
  let openOrdersCount = 0
  let delayedOrdersCount = 0

  orders.forEach((op) => {
    // OP criada até a data de referência?
    const createdDate = parseISO(op.created)
    if (!isValid(createdDate) || isBefore(dayEnd, createdDate)) {
      return
    }

    // Estava concluída até a data?
    let wasFinished = false
    if (op.status === 'Concluído') {
      const finishDateStr = op.finished_at || op.updated
      if (finishDateStr) {
        const fDate = parseISO(finishDateStr)
        if (isValid(fDate) && !isBefore(dayEnd, fDate)) {
          wasFinished = true
        }
      } else {
        wasFinished = true
      }
    }

    if (wasFinished) return

    const qty = Number(op.quantity) || 0
    total += qty
    openOrdersCount++

    // Estava atrasada na data? delivery_date < refDate
    if (op.delivery_date) {
      const dDate = parseISO(op.delivery_date)
      if (isValid(dDate) && isBefore(startOfDay(dDate), dayStart)) {
        delayed += qty
        delayedOrdersCount++
      }
    }

    if (op.status === 'Fila') {
      toStart += qty
    } else if (op.status === 'Em Andamento' || op.status === 'Parado') {
      inProcess += qty
    }

    if (op.stage === 'Expedição') {
      expedition += qty
    }

    const opType = op.op_type || 'Linha'
    if (opType === 'Especial') {
      especial += qty
    } else if (opType === 'Assistência') {
      assistencia += qty
    } else {
      linha += qty
    }
  })

  return {
    total,
    delayed,
    toStart,
    inProcess,
    expedition,
    linha,
    especial,
    assistencia,
    openOrdersCount,
    delayedOrdersCount,
    isPersisted: false,
  }
}

/**
 * Busca snapshots gravados no backend (últimos N dias, padrão 60 dias).
 */
export async function fetchProductionSnapshots(
  limitDays: number = 60,
): Promise<PcpProductionSnapshot[]> {
  try {
    const list = await pb
      .collection('pcp_production_snapshots')
      .getFullList<PcpProductionSnapshot>({
        sort: '-reference_date',
      })
    return list
  } catch (err) {
    console.warn('Falha ao buscar snapshots de produção:', err)
    return []
  }
}

/**
 * Registra o snapshot de hoje no backend de forma aditiva e idempotente.
 * Dedupe: se já existir registro para hoje, atualiza; nunca duplica.
 */
export async function recordTodaySnapshot(): Promise<PcpProductionSnapshot | null> {
  try {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const response = await pb.send('/backend/v1/pcp/snapshots/record-today', {
      method: 'POST',
      body: { reference_date: todayStr },
    })
    return response as PcpProductionSnapshot
  } catch (err) {
    console.warn('Falha ao acionar endpoint de gravação do snapshot de hoje:', err)
    return null
  }
}

/**
 * Encontra o snapshot gravado mais próximo da data alvo (YYYY-MM-DD),
 * ou retorna fallback calculado se não houver snapshot próximo suficiente (ou nenhum).
 */
export function getSnapshotForTargetDate(
  targetDate: Date,
  persistedSnapshots: PcpProductionSnapshot[],
  orders: PcpOrder[],
  maxToleranceDays: number = 3,
): CalculatedSnapshotMetrics {
  const targetDateStr = format(targetDate, 'yyyy-MM-dd')

  if (persistedSnapshots.length > 0) {
    // Procura exato primeiro
    const exact = persistedSnapshots.find((s) => s.reference_date === targetDateStr)
    if (exact) {
      return {
        total: Number(exact.total_units) || 0,
        delayed: Number(exact.delayed_units) || 0,
        toStart: Number(exact.to_start_units) || 0,
        inProcess: Number(exact.in_process_units) || 0,
        expedition: Number(exact.expedition_units) || 0,
        linha: Number(exact.linha_units) || 0,
        especial: Number(exact.especial_units) || 0,
        assistencia: Number(exact.assistencia_units) || 0,
        openOrdersCount: Number(exact.open_orders_count) || 0,
        delayedOrdersCount: Number(exact.delayed_orders_count) || 0,
        isPersisted: true,
        snapshotId: exact.id,
      }
    }

    // Se não encontrou exato, procura o mais próximo dentro da tolerância
    let closest: PcpProductionSnapshot | null = null
    let minDiff = Infinity

    for (const snap of persistedSnapshots) {
      const snapDate = parseISO(snap.reference_date)
      if (isValid(snapDate)) {
        const diff = Math.abs(differenceInCalendarDays(snapDate, targetDate))
        if (diff < minDiff) {
          minDiff = diff
          closest = snap
        }
      }
    }

    if (closest && minDiff <= maxToleranceDays) {
      return {
        total: Number(closest.total_units) || 0,
        delayed: Number(closest.delayed_units) || 0,
        toStart: Number(closest.to_start_units) || 0,
        inProcess: Number(closest.in_process_units) || 0,
        expedition: Number(closest.expedition_units) || 0,
        linha: Number(closest.linha_units) || 0,
        especial: Number(closest.especial_units) || 0,
        assistencia: Number(closest.assistencia_units) || 0,
        openOrdersCount: Number(closest.open_orders_count) || 0,
        delayedOrdersCount: Number(closest.delayed_orders_count) || 0,
        isPersisted: true,
        snapshotId: closest.id,
      }
    }
  }

  // FALLBACK: reconstrução computada a partir das OPs atuais
  return computeHistoricalSnapshotFromOrders(orders, targetDate)
}
