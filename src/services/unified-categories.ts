import pb from '@/lib/pocketbase/client'
import type { ComponentCategory, CompositionCategory } from '@/types'

export type CategorySource = 'component_categories' | 'composition_categories'

export interface UnifiedCategory {
  id: string
  name: string
  source: CategorySource
  active?: boolean
}

/**
 * Busca a união das categorias de `component_categories` e `composition_categories`.
 * Ordenada alfabeticamente por nome (locale pt-BR, case-insensitive).
 * Nomes duplicados (case-insensitive) são mesclados, dando preferência ao registro de `component_categories`.
 */
export async function getUnifiedCategories(options?: { includeInactive?: boolean }): Promise<{
  unified: UnifiedCategory[]
  componentCategories: ComponentCategory[]
  compositionCategories: CompositionCategory[]
}> {
  const compFilter = options?.includeInactive ? '' : 'active != false'

  const [compCats, composCats] = await Promise.all([
    pb
      .collection('component_categories')
      .getFullList<ComponentCategory>({
        filter: compFilter,
        sort: 'name',
      })
      .catch((err) => {
        console.warn('Erro ao carregar component_categories:', err)
        return [] as ComponentCategory[]
      }),
    pb
      .collection('composition_categories')
      .getFullList<CompositionCategory>({
        sort: 'name',
      })
      .catch((err) => {
        console.warn('Erro ao carregar composition_categories:', err)
        return [] as CompositionCategory[]
      }),
  ])

  const unified = mergeCategoryLists(compCats, composCats)

  return {
    unified,
    componentCategories: compCats,
    compositionCategories: composCats,
  }
}

/**
 * Mescla puramente as duas listas sem duplicar nomes (case-insensitive e trim).
 * Prioridade: component_categories primeiro, composition_categories depois.
 */
export function mergeCategoryLists(
  componentCategories: ComponentCategory[],
  compositionCategories: CompositionCategory[],
): UnifiedCategory[] {
  const mapByLowerName = new Map<string, UnifiedCategory>()

  // 1. Inserir component_categories primeiro (prioridade)
  for (const c of componentCategories) {
    const rawName = (c.name || '').trim()
    if (!rawName) continue
    const key = rawName.toLowerCase()
    if (!mapByLowerName.has(key)) {
      mapByLowerName.set(key, {
        id: c.id,
        name: rawName,
        source: 'component_categories',
        active: c.active !== false,
      })
    }
  }

  // 2. Inserir composition_categories se ainda não constar
  for (const c of compositionCategories) {
    const rawName = (c.name || '').trim()
    if (!rawName) continue
    const key = rawName.toLowerCase()
    if (!mapByLowerName.has(key)) {
      mapByLowerName.set(key, {
        id: c.id,
        name: rawName,
        source: 'composition_categories',
        active: true,
      })
    }
  }

  const list = Array.from(mapByLowerName.values())
  list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
  return list
}

/**
 * Resolve o category_id a partir do nome da categoria.
 * Regra: Busca PRIMEIRO em component_categories, e DEPOIS em composition_categories.
 * Retorna o id correspondente ou fallback vazio.
 */
export function resolveCategoryIdByName(
  categoryName: string,
  componentCategories: ComponentCategory[],
  compositionCategories: CompositionCategory[],
): string {
  const trimmed = (categoryName || '').trim().toLowerCase()
  if (!trimmed) return ''

  // Busca primeiro em component_categories
  const matchComp = componentCategories.find((c) => (c.name || '').trim().toLowerCase() === trimmed)
  if (matchComp) return matchComp.id

  // Depois em composition_categories
  const matchCompos = compositionCategories.find(
    (c) => (c.name || '').trim().toLowerCase() === trimmed,
  )
  if (matchCompos) return matchCompos.id

  return ''
}

/**
 * Resolve o nome de uma categoria a partir do category_id.
 * Compatibilidade: procura em ambas as coleções (component_categories ou composition_categories).
 */
export function resolveCategoryNameById(
  categoryId: string,
  componentCategories: ComponentCategory[],
  compositionCategories: CompositionCategory[],
): string {
  if (!categoryId) return ''

  const matchComp = componentCategories.find((c) => c.id === categoryId)
  if (matchComp) return matchComp.name

  const matchCompos = compositionCategories.find((c) => c.id === categoryId)
  if (matchCompos) return matchCompos.name

  return ''
}
