import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  differenceInDays,
  startOfDay,
  parseISO,
  isSameDay,
  addDays,
  isWithinInterval,
  isSameWeek,
  addWeeks,
  isBefore,
  isValid,
} from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDeadline(deliveryDateStr: string | undefined | null, status: string): string {
  if (status === 'Concluído') return '-'
  if (!deliveryDateStr) return '-'
  const date = parseISO(deliveryDateStr)
  if (isNaN(date.getTime())) return '-'
  const daysDiff = differenceInDays(startOfDay(date), startOfDay(new Date()))
  if (daysDiff < 0) return `${Math.abs(daysDiff)} dia${Math.abs(daysDiff) === 1 ? '' : 's'} vencido`
  if (daysDiff === 0) return 'Vence hoje'
  return `${daysDiff} dia${daysDiff === 1 ? '' : 's'} restante${daysDiff === 1 ? '' : 's'}`
}

export function isOrderOverdue(
  deliveryDateStr: string | undefined | null,
  status: string,
): boolean {
  if (status === 'Concluído' || !deliveryDateStr) return false
  const date = parseISO(deliveryDateStr)
  if (isNaN(date.getTime())) return false
  return isBefore(startOfDay(date), startOfDay(new Date()))
}

export function filterByDeadline(
  deliveryDateStr: string | null | undefined,
  filter: string,
  status?: string,
): boolean {
  if (!filter || filter === 'all') return true
  if (filter === 'atrasados') {
    if (status === 'Concluído') return false
    if (!deliveryDateStr) return false
    const date = parseISO(deliveryDateStr)
    if (!isValid(date)) return false
    return isBefore(startOfDay(date), startOfDay(new Date()))
  }
  if (!deliveryDateStr) return false
  const date = parseISO(deliveryDateStr)
  if (!isValid(date)) return false

  const today = startOfDay(new Date())

  switch (filter) {
    case 'hoje':
      return isSameDay(date, today)
    case 'amanha':
      return isSameDay(date, addDays(today, 1))
    case 'prox-3d':
      return isWithinInterval(date, { start: today, end: addDays(today, 3) })
    case 'esta-semana':
      return isSameWeek(date, today, { weekStartsOn: 0 })
    case 'prox-semana':
      return isSameWeek(date, addWeeks(today, 1), { weekStartsOn: 0 })
    case 'prox-15d':
      return isWithinInterval(date, { start: today, end: addDays(today, 15) })
    default:
      return true
  }
}

export const STAGE_THRESHOLDS: Record<string, number> = {
  Projetos: 72,
  Separação: 24,
  Cotação: 24,
  Compra: 48,
  Retirada: 24,
  Aguardando: 480,
  Corte: 24,
  Dobra: 24,
  Calandra: 24,
  Solda: 48,
  'Acab. Solda': 24,
  Furação: 24,
  Rosca: 24,
  Concreto: 72,
  Terceirização: 120,
  Preparação: 24,
  Pintura: 48,
  Verniz: 24,
  Retoques: 24,
  Montagem: 48,
  Qualidade: 24,
  Embalagem: 24,
  Expedição: 24,
}

export function isStageDelayed(order: any): boolean {
  if (order.status === 'Concluído' || order.status === 'Parado') return false
  const thresholdHours = STAGE_THRESHOLDS[order.stage]
  if (!thresholdHours) return false
  const diffHours = (new Date().getTime() - new Date(order.updated).getTime()) / (1000 * 60 * 60)
  return diffHours > thresholdHours
}

const engenhariaStages = ['Projetos']

const fabricacaoStages = [
  'Separação',
  'Corte',
  'Dobra',
  'Calandra',
  'Solda',
  'Acab. Solda',
  'Furação',
  'Rosca',
  'Concreto',
  'Fabricação',
  'Suprimentos',
  'Terceirização',
]

const acabamentoStages = ['Preparação', 'Pintura', 'Verniz', 'Retoques', 'Acabamento']

const montagemStages = ['Montagem']

export function shouldHighlightObservation(op: any, currentStage: string): boolean {
  if (!op || !op.observations || op.observations.trim() === '') return false

  if (currentStage === 'Expedição' || currentStage === 'Qualidade') {
    return true
  }

  if (op.observation_sector === 'Projetos' && engenhariaStages.includes(currentStage)) {
    return true
  }
  if (op.observation_sector === 'Fabricação' && fabricacaoStages.includes(currentStage)) {
    return true
  }
  if (op.observation_sector === 'Acabamento' && acabamentoStages.includes(currentStage)) {
    return true
  }
  if (op.observation_sector === 'Montagem' && montagemStages.includes(currentStage)) {
    return true
  }

  return false
}

export function isSectorActiveForStage(sector: string, currentStage: string): boolean {
  if (!sector) return false

  if (currentStage === 'Expedição' || currentStage === 'Qualidade') {
    return true
  }

  if (sector === 'Projetos' && engenhariaStages.includes(currentStage)) {
    return true
  }
  if (sector === 'Fabricação' && fabricacaoStages.includes(currentStage)) {
    return true
  }
  if (sector === 'Acabamento' && acabamentoStages.includes(currentStage)) {
    return true
  }
  if (sector === 'Montagem' && montagemStages.includes(currentStage)) {
    return true
  }

  return false
}

export function formatDelayDuration(hours: number): string {
  const totalMinutes = Math.floor(hours * 60)
  const days = Math.floor(totalMinutes / (60 * 24))
  const remainingHours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) {
    return `${days}d ${remainingHours}h`
  }
  return `${remainingHours}h ${minutes}m`
}

export function getStageDelay(
  order: any,
  process?: { estimated_hours?: number; estimated_days?: number },
): { delayed: boolean; formatted: string } {
  if (order.status === 'Concluído' || order.status === 'Parado') {
    return { delayed: false, formatted: '' }
  }

  if (!order.updated) return { delayed: false, formatted: '' }

  const entryDate = new Date(order.updated)
  const now = new Date()
  const elapsedHours = (now.getTime() - entryDate.getTime()) / (1000 * 60 * 60)

  let threshold = 0
  if (process?.estimated_hours && process.estimated_hours > 0) {
    threshold = process.estimated_hours
  } else if (process?.estimated_days && process.estimated_days > 0) {
    threshold = process.estimated_days * 24
  } else {
    threshold = STAGE_THRESHOLDS[order.stage] || 0
  }
  if (threshold <= 0) return { delayed: false, formatted: '' }

  if (elapsedHours <= threshold) return { delayed: false, formatted: '' }

  const delayHours = elapsedHours - threshold
  return { delayed: true, formatted: formatDelayDuration(delayHours) }
}

export function formatOpIdentifier(order: any): string {
  const orderNum = order.order_number || ''
  const opNum = order.op_number || ''
  return `Pedido ${orderNum} | OP ${opNum}`
}

export function normalizeSearchText(text: string): string {
  if (!text) return ''
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,\-/]/g, '')
    .toLowerCase()
    .trim()
}
