import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { differenceInDays, startOfDay, parseISO } from 'date-fns'

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
