import { useMemo } from 'react'
import type { MaterialShortage, MasterComponent, ComponentCategory } from '@/types'

export interface CategoryGroup {
  categoryId: string
  categoryName: string
  items: MaterialShortage[]
  totalItems: number
  totalValue: number
}

export function normalizeKey(text?: string | null): string {
  return (text || '').trim().toLowerCase()
}

/**
 * Cria mapas para busca rápida de componente mestre a partir do código e da descrição.
 */
export function buildComponentLookup(components: MasterComponent[]) {
  const byCode = new Map<string, MasterComponent>()
  const byDesc = new Map<string, MasterComponent>()

  for (const c of components) {
    const code = normalizeKey(c.code)
    if (code && !byCode.has(code)) {
      byCode.set(code, c)
    }
    const desc = normalizeKey(c.description)
    if (desc && !byDesc.has(desc)) {
      byDesc.set(desc, c)
    }
  }

  return { byCode, byDesc }
}

/**
 * Agrupa itens por categoria do componente vinculado.
 * Itens sem componente vinculado ou com componente sem categoria aparecem como 'Sem categoria'.
 */
export function groupShortagesByCategory(
  items: MaterialShortage[],
  components: MasterComponent[],
  categories: ComponentCategory[],
): CategoryGroup[] {
  const { byCode, byDesc } = buildComponentLookup(components)

  const catMap = new Map<string, ComponentCategory>()
  for (const cat of categories) {
    catMap.set(cat.id, cat)
  }

  const groups = new Map<string, MaterialShortage[]>()

  for (const item of items) {
    const itemCode = normalizeKey(item.code)
    const itemDesc = normalizeKey(item.description)

    const comp =
      (itemCode ? byCode.get(itemCode) : undefined) || (itemDesc ? byDesc.get(itemDesc) : undefined)
    const categoryId = comp?.category || '__sem_categoria__'

    if (!groups.has(categoryId)) {
      groups.set(categoryId, [])
    }
    groups.get(categoryId)!.push(item)
  }

  const result: CategoryGroup[] = []
  let noCategoryGroup: CategoryGroup | null = null

  for (const [catId, groupItems] of groups.entries()) {
    const totalValue = groupItems.reduce(
      (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
      0,
    )

    if (catId === '__sem_categoria__') {
      noCategoryGroup = {
        categoryId: '__sem_categoria__',
        categoryName: 'Sem categoria',
        items: groupItems,
        totalItems: groupItems.length,
        totalValue,
      }
    } else {
      const catObj = catMap.get(catId)
      result.push({
        categoryId: catId,
        categoryName: catObj?.name || 'Sem categoria',
        items: groupItems,
        totalItems: groupItems.length,
        totalValue,
      })
    }
  }

  result.sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'pt-BR'))

  if (noCategoryGroup) {
    result.push(noCategoryGroup)
  }

  return result
}

export function useCategoryGroups(
  items: MaterialShortage[],
  components: MasterComponent[],
  categories: ComponentCategory[],
): CategoryGroup[] {
  return useMemo(
    () => groupShortagesByCategory(items, components, categories),
    [items, components, categories],
  )
}
