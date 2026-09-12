import { pb } from '@/lib/pocketbase/client'
import { MasterComponent, Inventory } from '@/types'

export interface UnifiedComponentSearchResult {
  id: string
  code: string
  description: string
  unit: string
  source: 'inventory' | 'catalog' | 'manual' | 'imported'
  active: boolean
  // Dados de estoque se existirem (para visualização transparente)
  inventory_id?: string
  stock_quantity?: number
  min_quantity?: number
  has_stock: boolean
}

/**
 * Busca unificada no Cadastro Mestre de Componentes combinando dados com o estoque.
 * Modo estritamente aditivo: nenhum dado existente é alterado ou mesclado automaticamente.
 */
export const getMasterComponents = async (filter?: string): Promise<MasterComponent[]> => {
  return pb.collection('components').getFullList<MasterComponent>({
    sort: 'description',
    filter: filter || '',
  })
}

export const searchMasterComponents = async (
  term: string,
  limit = 40,
): Promise<MasterComponent[]> => {
  const cleanTerm = term.trim().replace(/["'\\]/g, '')
  if (!cleanTerm) {
    return pb
      .collection('components')
      .getList<MasterComponent>(1, limit, {
        sort: 'description',
      })
      .then((res) => res.items)
  }

  return pb
    .collection('components')
    .getList<MasterComponent>(1, limit, {
      filter: `code ~ "${cleanTerm}" || description ~ "${cleanTerm}"`,
      sort: 'description',
    })
    .then((res) => res.items)
}

/**
 * Busca componentes unificados agregando dados de estoque do inventário.
 * Retorna os itens do mestre de componentes com informação se possuem estoque ou se são somente catálogo.
 */
export const searchUnifiedComponentsWithStock = async (
  term: string,
  limit = 40,
): Promise<UnifiedComponentSearchResult[]> => {
  const [components, inventoryItems] = await Promise.all([
    searchMasterComponents(term, limit),
    pb.collection('inventory').getFullList<Inventory>(),
  ])

  // Mapeia inventory por code e component_id para lookup instantâneo
  const invByComponentId = new Map<string, Inventory>()
  const invByCode = new Map<string, Inventory>()
  const invByDesc = new Map<string, Inventory>()

  inventoryItems.forEach((inv) => {
    if (inv.component_id) invByComponentId.set(inv.component_id, inv)
    if (inv.code) invByCode.set(inv.code.toLowerCase().trim(), inv)
    if (inv.description) invByDesc.set(inv.description.toLowerCase().trim(), inv)
  })

  return components.map((comp) => {
    const inv =
      invByComponentId.get(comp.id) ||
      (comp.code ? invByCode.get(comp.code.toLowerCase().trim()) : undefined) ||
      invByDesc.get(comp.description.toLowerCase().trim())

    const hasStock = !!inv && inv.quantity !== undefined && inv.quantity !== null

    return {
      id: comp.id,
      code: comp.code || (inv ? inv.code : ''),
      description: comp.description,
      unit: comp.unit || (inv ? inv.unit : 'un') || 'un',
      source: comp.source || (inv ? 'inventory' : 'catalog'),
      active: comp.active !== false,
      inventory_id: inv ? inv.id : undefined,
      stock_quantity: inv ? inv.quantity : undefined,
      min_quantity: inv ? inv.min_quantity : undefined,
      has_stock: hasStock,
    }
  })
}

/**
 * Adiciona componente ao cadastro mestre se não existir (modo aditivo).
 */
export const createMasterComponent = async (data: {
  code?: string
  description: string
  unit?: string
  source?: 'inventory' | 'catalog' | 'manual' | 'imported'
  active?: boolean
}): Promise<MasterComponent> => {
  return pb.collection('components').create<MasterComponent>({
    code: data.code?.trim() || '',
    description: data.description.trim(),
    unit: data.unit?.trim() || 'un',
    source: data.source || 'manual',
    active: data.active !== undefined ? data.active : true,
  })
}
