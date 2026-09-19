import pb from '@/lib/pocketbase/client'
import { ComponentCategory } from '@/types'

/**
 * Retorna todas as categorias de componentes ordenadas por nome.
 * Se includeInactive for falso (padrão), retorna apenas categorias com active != false.
 */
export async function getComponentCategories(options?: {
  includeInactive?: boolean
}): Promise<ComponentCategory[]> {
  const filter = options?.includeInactive ? '' : 'active != false'
  return pb.collection('component_categories').getFullList<ComponentCategory>({
    filter,
    sort: 'name',
  })
}

/**
 * Cria uma nova categoria de componente.
 */
export async function createComponentCategory(name: string): Promise<ComponentCategory> {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('O nome da categoria não pode ser vazio.')
  }
  return pb.collection('component_categories').create<ComponentCategory>({
    name: trimmed,
    active: true,
  })
}

/**
 * Renomeia uma categoria de componente.
 */
export async function updateComponentCategory(
  id: string,
  name: string,
): Promise<ComponentCategory> {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('O nome da categoria não pode ser vazio.')
  }
  return pb.collection('component_categories').update<ComponentCategory>(id, {
    name: trimmed,
  })
}

/**
 * Alterna ativação / desativação de uma categoria de componente.
 */
export async function toggleComponentCategoryActive(
  id: string,
  active: boolean,
): Promise<ComponentCategory> {
  return pb.collection('component_categories').update<ComponentCategory>(id, {
    active,
  })
}

/**
 * Atribui uma categoria a múltiplos componentes em lote.
 * Se categoryId for null ou string vazia, desassocia a categoria.
 */
export async function updateComponentsCategoryBatch(
  componentIds: string[],
  categoryId: string | null,
): Promise<void> {
  if (!componentIds.length) return

  // Atualiza um a um para garantir atomicidade no PocketBase
  const targetCategory = categoryId && categoryId.trim() ? categoryId.trim() : null
  const promises = componentIds.map((id) =>
    pb.collection('components').update(id, {
      category: targetCategory,
    }),
  )
  await Promise.all(promises)
}
