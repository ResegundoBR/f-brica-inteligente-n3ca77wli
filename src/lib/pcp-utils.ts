import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function shouldHighlightObservation(op: any, currentStage: string): boolean {
  if (!op || !op.observations || op.observations.trim() === '') return false

  if (currentStage === 'Expedição' || currentStage === 'Controle de qualidade') {
    return true
  }

  const fabricacaoStages = [
    'Separação no estoque fisico',
    'Corte',
    'Acabamento corte',
    'Dobra',
    'Calandra',
    'Solda',
    'Acabamento de solda',
    'Furação',
    'Rosca',
    'Bases de concreto',
    'Fabricação',
    'Suprimentos',
  ]

  const acabamentoStages = [
    'Preparação (wash primer, primer e lixamento)',
    'Pintura',
    'Verniz',
    'Retoques',
    'Acabamento',
  ]

  const montagemStages = ['Montagem']

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
