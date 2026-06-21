/**
 * Maps detailed production stages to macro sectors for logic purposes.
 */
export function getMacroSector(stage: string): string {
  const fabricacao = [
    'Corte',
    'Dobra',
    'Calandra',
    'Solda',
    'Furação',
    'Rosca',
    'Bases de concreto',
    'Fabricação',
  ]

  const acabamento = [
    'Acabamento corte',
    'Acabamento de solda',
    'Preparação (wash primer, primer e lixamento)',
    'Pintura',
    'Verniz',
    'Retoques',
    'Acabamento',
  ]

  const montagem = ['Montagem']

  const expedicao = ['Controle de qualidade', 'Embalagem', 'Expedição']

  if (fabricacao.includes(stage)) return 'Fabricação'
  if (acabamento.includes(stage)) return 'Acabamento'
  if (montagem.includes(stage)) return 'Montagem'
  if (expedicao.includes(stage)) return 'Expedição'

  return 'Outros'
}

/**
 * Determines if an observation should be highlighted based on the current stage
 * and the designated observation sector.
 */
export function shouldHighlightObservation(stage: string, sector?: string): boolean {
  if (!sector) return false
  const macro = getMacroSector(stage)
  return macro === sector || macro === 'Expedição'
}
