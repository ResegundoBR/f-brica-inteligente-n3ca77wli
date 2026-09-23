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

/**
 * Utilitários canônicos de data sem shift de fuso horário:
 * parseLocalDate: 'YYYY-MM-DD' → Date local ao meio-dia seguro
 * formatLocalDate: 'YYYY-MM-DD' (ou ISO com data) → 'DD/MM/YYYY' direto, sem conversão UTC
 * toDateFieldValue: Date ou string → 'YYYY-MM-DD' usando getFullYear/getMonth/getDate locais (nunca toISOString)
 */
export function parseLocalDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null
  const clean = dateStr.trim().split('T')[0].split(' ')[0]
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean)
  if (!match) {
    const fallback = new Date(dateStr)
    return isNaN(fallback.getTime()) ? null : fallback
  }
  const year = parseInt(match[1], 10)
  const month = parseInt(match[2], 10) - 1
  const day = parseInt(match[3], 10)
  return new Date(year, month, day, 12, 0, 0)
}

export function formatLocalDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-'
  const clean = dateStr.trim().split('T')[0].split(' ')[0]
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean)
  if (match) {
    const [, year, month, day] = match
    return `${day}/${month}/${year}`
  }
  // Se for timestamp com hora, tenta extrair data
  try {
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0')
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const year = d.getFullYear()
      return `${day}/${month}/${year}`
    }
  } catch {
    /* fallback */
  }
  return dateStr
}

export function toDateFieldValue(date: Date | string | undefined | null): string {
  if (!date) return ''
  if (typeof date === 'string') {
    const clean = date.trim().split('T')[0].split(' ')[0]
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean
    const parsed = new Date(date)
    if (isNaN(parsed.getTime())) return ''
    const year = parsed.getFullYear()
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    const day = String(parsed.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  if (isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDeadline(deliveryDateStr: string | undefined | null, status: string): string {
  if (status === 'Concluído') return '-'
  if (!deliveryDateStr) return '-'
  const date = parseISO(deliveryDateStr)
  if (isNaN(date.getTime())) return '-'
  const localDate = parseLocalDate(deliveryDateStr) || date
  const daysDiff = differenceInDays(startOfDay(localDate), startOfDay(new Date()))
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

/**
 * Normaliza o valor de stage para garantir consistência canônica:
 * 'Retoque' (singular histórico de retrabalhos) é sempre convertido para 'Retoques'.
 */
export function normalizeStage<T extends string | null | undefined>(stage: T): T {
  if (!stage) return stage
  if (stage === 'Retoque') return 'Retoques' as T
  return stage
}

export function isStageDelayed(order: any): boolean {
  if (order.status === 'Concluído' || order.status === 'Parado') return false
  const normalized = normalizeStage(order.stage)
  const thresholdHours = STAGE_THRESHOLDS[normalized]
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

  const stage = normalizeStage(currentStage)
  if (stage === 'Expedição' || stage === 'Qualidade') {
    return true
  }

  if (op.observation_sector === 'Projetos' && engenhariaStages.includes(stage)) {
    return true
  }
  if (op.observation_sector === 'Fabricação' && fabricacaoStages.includes(stage)) {
    return true
  }
  if (op.observation_sector === 'Acabamento' && acabamentoStages.includes(stage)) {
    return true
  }
  if (op.observation_sector === 'Montagem' && montagemStages.includes(stage)) {
    return true
  }

  return false
}

export function isSectorActiveForStage(sector: string, currentStage: string): boolean {
  if (!sector) return false

  const stage = normalizeStage(currentStage)
  if (stage === 'Expedição' || stage === 'Qualidade') {
    return true
  }

  if (sector === 'Projetos' && engenhariaStages.includes(stage)) {
    return true
  }
  if (sector === 'Fabricação' && fabricacaoStages.includes(stage)) {
    return true
  }
  if (sector === 'Acabamento' && acabamentoStages.includes(stage)) {
    return true
  }
  if (sector === 'Montagem' && montagemStages.includes(stage)) {
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
    threshold = STAGE_THRESHOLDS[normalizeStage(order.stage)] || 0
  }
  if (threshold <= 0) return { delayed: false, formatted: '' }

  if (elapsedHours <= threshold) return { delayed: false, formatted: '' }

  const delayHours = elapsedHours - threshold
  return { delayed: true, formatted: formatDelayDuration(delayHours) }
}

/**
 * Ordenação canônica da fila de produção (Painel Kanban e Portal do Operador):
 * 1º Emergenciais (manual_priority === 1)
 * 2º Prazo especial (manual_priority === 2)
 * 3º Data prometida (promised_date preenchida, mais próxima primeiro)
 * 4º manual_sequence (sequência definida pelo gestor, menor índice primeiro)
 * 5º delivery_date / criação
 */
export function sortFilaProductionOrders<
  T extends {
    manual_priority?: number
    promised_date?: string | null
    manual_sequence?: number | null
    delivery_date?: string | null
    created?: string
  },
>(ordersList: T[]): T[] {
  return [...ordersList].sort((a, b) => {
    // 1º Emergenciais (manual_priority === 1)
    const isEmergA = a.manual_priority === 1 ? 0 : 1
    const isEmergB = b.manual_priority === 1 ? 0 : 1
    if (isEmergA !== isEmergB) return isEmergA - isEmergB

    // 2º Prazo especial (manual_priority === 2)
    const isPrazoA = a.manual_priority === 2 ? 0 : 1
    const isPrazoB = b.manual_priority === 2 ? 0 : 1
    if (isPrazoA !== isPrazoB) return isPrazoA - isPrazoB

    // 3º Data prometida (preenchida, mais próxima primeiro)
    const hasPromisedA = !!a.promised_date
    const hasPromisedB = !!b.promised_date
    if (hasPromisedA && !hasPromisedB) return -1
    if (!hasPromisedA && hasPromisedB) return 1
    if (hasPromisedA && hasPromisedB) {
      const timeA = new Date(a.promised_date!).getTime()
      const timeB = new Date(b.promised_date!).getTime()
      if (timeA !== timeB) return timeA - timeB
    }

    // 4º manual_sequence definido pelo gestor (menor primeiro, indefinidos vão para o final)
    const seqA = a.manual_sequence != null ? a.manual_sequence : 999999
    const seqB = b.manual_sequence != null ? b.manual_sequence : 999999
    if (seqA !== seqB) return seqA - seqB

    // 5º delivery_date mais próxima
    const dateA = a.delivery_date ? new Date(a.delivery_date).getTime() : Infinity
    const dateB = b.delivery_date ? new Date(b.delivery_date).getTime() : Infinity
    if (dateA !== dateB) return dateA - dateB

    // Desempate por data de criação
    const createdA = a.created ? new Date(a.created).getTime() : 0
    const createdB = b.created ? new Date(b.created).getTime() : 0
    return createdA - createdB
  })
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

export interface PromisedDateInfo {
  formattedDate: string // "dd/mm"
  isOverdue: boolean // data < hoje && status !== 'Concluído'
  isDueSoon: boolean // <= 3 dias restantes (e não vencida)
  isConcluded: boolean
  daysRemaining: number
}

export function getPromisedDateInfo(
  promisedDateStr: string | undefined | null,
  status?: string,
): PromisedDateInfo | null {
  if (!promisedDateStr) return null
  const date = parseISO(promisedDateStr)
  if (!isValid(date)) return null

  const today = startOfDay(new Date())
  const pDay = startOfDay(date)
  const isConcluded = status === 'Concluído'
  const diff = differenceInDays(pDay, today)
  const isOverdue = !isConcluded && diff < 0
  const isDueSoon = !isConcluded && diff >= 0 && diff <= 3

  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')

  // Usar parseLocalDate para extrair dia e mês visualmente corretos
  const clean = promisedDateStr.trim().split('T')[0].split(' ')[0]
  let displayDay = day
  let displayMonth = month
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean)
  if (match) {
    displayDay = match[3]
    displayMonth = match[2]
  }

  return {
    formattedDate: `${displayDay}/${displayMonth}`,
    isOverdue,
    isDueSoon,
    isConcluded,
    daysRemaining: diff,
  }
}
