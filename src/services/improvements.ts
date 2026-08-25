import pb from '@/lib/pocketbase/client'

export const SECTORS = [
  'Embalagem',
  'Expedição',
  'Montagem',
  'Limpeza',
  'Fabricação',
  'Acabamento',
  'Concreto',
] as const

export type ImprovementSector = (typeof SECTORS)[number]

export type ImprovementCategory =
  | 'Operacional'
  | 'Processual'
  | 'Ferramental'
  | 'Infraestrutura'
  | 'Inovação'

export type ImprovementPriority = 'Crítica' | 'Alta' | 'Média' | 'Baixa'

export type ImprovementStatus =
  | 'Identificado'
  | 'Em Análise'
  | 'Planejado'
  | 'Em Execução'
  | 'Verificando'
  | 'Concluído'
  | 'Reaberto'

export interface ActionLogEntry {
  date: string
  user: string
  action: string
  detail?: string
}

export interface Improvement {
  id: string
  title: string
  sector?: ImprovementSector
  category: ImprovementCategory
  priority: ImprovementPriority
  description: string
  root_cause: string
  solution_idea?: string
  expected_impact: string
  status: ImprovementStatus
  ia_suggestions?: Record<string, string>
  actions_log?: ActionLogEntry[]
  created_by: string
  assigned_to?: string
  created: string
  updated: string
  expand?: {
    created_by?: { id: string; name: string; email?: string }
    assigned_to?: { id: string; name: string; email?: string }
  }
}

export interface SimpleUser {
  id: string
  name: string
}

export const IMPROVEMENT_COLUMNS: ImprovementStatus[] = [
  'Identificado',
  'Em Análise',
  'Planejado',
  'Em Execução',
  'Verificando',
  'Concluído',
  'Reaberto',
]

export const IMPROVEMENT_NEXT_STATUS: Record<ImprovementStatus, ImprovementStatus | null> = {
  Identificado: 'Em Análise',
  'Em Análise': 'Planejado',
  Planejado: 'Em Execução',
  'Em Execução': 'Verificando',
  Verificando: 'Concluído',
  Concluído: null,
  Reaberto: 'Em Análise',
}

export const SECTOR_COLORS: Record<ImprovementSector, string> = {
  Embalagem: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  Expedição: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  Montagem: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  Limpeza: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  Fabricação: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  Acabamento: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  Concreto: 'bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-300',
}

export const CATEGORY_COLORS: Record<ImprovementCategory, string> = {
  Operacional: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Processual: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  Ferramental: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  Infraestrutura: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  Inovação: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
}

export const PRIORITY_COLORS: Record<ImprovementPriority, string> = {
  Crítica: 'bg-red-500 text-white',
  Alta: 'bg-orange-500 text-white',
  Média: 'bg-yellow-400 text-slate-900',
  Baixa: 'bg-green-500 text-white',
}

export const PRIORITY_BORDER: Record<ImprovementPriority, string> = {
  Crítica: 'border-l-red-500',
  Alta: 'border-l-orange-500',
  Média: 'border-l-yellow-400',
  Baixa: 'border-l-green-500',
}

export type AiStep = 'cause_analysis' | 'solution_ideas' | 'impact_validation'

export async function fetchAiSuggestions(
  step: AiStep,
  context: {
    title?: string
    description?: string
    root_cause?: string
    solution_idea?: string
    category?: string
    priority?: string
  },
): Promise<string> {
  const res = await pb.send('/backend/v1/improvements/ai-suggestions', {
    method: 'POST',
    body: JSON.stringify({ step, context }),
  })
  return (res && res.suggestions) || ''
}

export async function listImprovements(): Promise<Improvement[]> {
  const res = await pb.collection('improvements').getFullList({
    expand: 'created_by,assigned_to',
    sort: '-created',
  })
  return res as unknown as Improvement[]
}

export async function createImprovement(
  data: Partial<Improvement>,
  user: SimpleUser,
): Promise<Improvement> {
  const payload: Record<string, unknown> = {
    title: data.title,
    sector: data.sector,
    category: data.category,
    priority: data.priority,
    description: data.description,
    root_cause: data.root_cause,
    solution_idea: data.solution_idea || '',
    expected_impact: data.expected_impact,
    status: 'Identificado',
    created_by: user.id,
    actions_log: [
      {
        date: new Date().toISOString(),
        user: user.name || 'Sistema',
        action: 'Identificado',
        detail: 'Apontamento criado.',
      },
    ],
  }
  if (data.ia_suggestions) payload.ia_suggestions = data.ia_suggestions
  const res = await pb.collection('improvements').create(payload)
  return res as unknown as Improvement
}

export async function updateImprovement(
  id: string,
  data: Partial<Improvement>,
): Promise<Improvement> {
  const res = await pb.collection('improvements').update(id, data as any)
  return res as unknown as Improvement
}

export async function appendActionLog(
  improvement: Improvement,
  action: string,
  detail: string | undefined,
  user: SimpleUser,
): Promise<Improvement> {
  const log = Array.isArray(improvement.actions_log) ? [...improvement.actions_log] : []
  log.push({
    date: new Date().toISOString(),
    user: user.name || 'Sistema',
    action,
    detail,
  })
  const res = await pb
    .collection('improvements')
    .update(improvement.id, { actions_log: log } as any)
  return res as unknown as Improvement
}
