export interface MacroGroup {
  name: string
  stages: string[]
}

export const MACRO_GROUPS: MacroGroup[] = [
  { name: 'Engenharia/Projetos', stages: ['Projetos'] },
  {
    name: 'Suprimentos',
    stages: ['Separação', 'Cotação', 'Compra', 'Retirada', 'Aguardando', 'Suprimentos'],
  },
  {
    name: 'Fabricação',
    stages: [
      'Corte',
      'Dobra',
      'Calandra',
      'Solda',
      'Acab. Solda',
      'Furação',
      'Rosca',
      'Concreto',
      'Fabricação',
    ],
  },
  { name: 'Terceirização', stages: ['Terceirização'] },
  { name: 'Acabamento', stages: ['Preparação', 'Pintura', 'Verniz', 'Retoques', 'Acabamento'] },
  { name: 'Montagem', stages: ['Montagem'] },
  { name: 'Expedição', stages: ['Qualidade', 'Embalagem', 'Expedição'] },
]
