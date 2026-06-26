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
): boolean {
  if (!filter || filter === 'all') return true
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
