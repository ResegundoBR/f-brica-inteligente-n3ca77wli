import pb from '@/lib/pocketbase/client'
import { MasterComponent, Inventory, Product } from '@/types'

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
  deactivated_by?: string
  deactivated_at?: string
  expand?: MasterComponent['expand']
}

export interface ComponentUsageCheckResult {
  canDelete: boolean
  reasons: string[]
  details: {
    inventoryItemsCount: number
    movementsCount: number
    shortagesCount: number
    ocItensCount: number
    opMaterialsCount: number
    catalogCompositionsCount: number
    catalogProducts: string[]
  }
}

/**
 * Busca unificada no Cadastro Mestre de Componentes.
 * Por padrão filtra apenas itens ativos (active != false), a não ser que includeInactive seja true.
 * Modo estritamente aditivo: nenhum dado existente é alterado ou mesclado automaticamente.
 */
export const getMasterComponents = async (
  filter?: string,
  options?: { includeInactive?: boolean; expand?: string },
): Promise<MasterComponent[]> => {
  const parts: string[] = []

  if (!options?.includeInactive) {
    parts.push('active != false')
  }

  if (filter && filter.trim()) {
    parts.push(`(${filter.trim()})`)
  }

  const finalFilter = parts.join(' && ')

  return pb.collection('components').getFullList<MasterComponent>({
    sort: 'description',
    filter: finalFilter,
    expand: options?.expand || 'deactivated_by',
  })
}

export const searchMasterComponents = async (
  term: string,
  limit = 40,
  options?: { includeInactive?: boolean; expand?: string },
): Promise<MasterComponent[]> => {
  const cleanTerm = term.trim().replace(/["'\\]/g, '')
  const activeCondition = options?.includeInactive ? '' : 'active != false'

  if (!cleanTerm) {
    return pb
      .collection('components')
      .getList<MasterComponent>(1, limit, {
        sort: 'description',
        filter: activeCondition,
        expand: options?.expand || 'deactivated_by',
      })
      .then((res) => res.items)
  }

  const searchCondition = `(code ~ "${cleanTerm}" || description ~ "${cleanTerm}")`
  const finalFilter = activeCondition ? `${activeCondition} && ${searchCondition}` : searchCondition

  return pb
    .collection('components')
    .getList<MasterComponent>(1, limit, {
      filter: finalFilter,
      sort: 'description',
      expand: options?.expand || 'deactivated_by',
    })
    .then((res) => res.items)
}

/**
 * Busca componentes unificados agregando dados de estoque do inventário.
 * Retorna os itens do mestre de componentes com informação se possuem estoque ou se são somente catálogo.
 * Respeita itens ativos por padrão.
 */
export const searchUnifiedComponentsWithStock = async (
  term: string,
  limit = 40,
  options?: { includeInactive?: boolean },
): Promise<UnifiedComponentSearchResult[]> => {
  const [components, inventoryItems] = await Promise.all([
    searchMasterComponents(term, limit, options),
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
      deactivated_by: comp.deactivated_by,
      deactivated_at: comp.deactivated_at,
      expand: comp.expand,
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

/**
 * Marca um componente do mestre como inativo com rastreabilidade de quem inativou.
 */
export const deactivateMasterComponent = async (
  componentId: string,
  userId: string,
): Promise<MasterComponent> => {
  return pb.collection('components').update<MasterComponent>(
    componentId,
    {
      active: false,
      deactivated_by: userId,
      deactivated_at: new Date().toISOString(),
    },
    { expand: 'deactivated_by' },
  )
}

/**
 * Reativa um componente previamente inativado (se o usuário desejar desfazer).
 */
export const reactivateMasterComponent = async (componentId: string): Promise<MasterComponent> => {
  return pb.collection('components').update<MasterComponent>(
    componentId,
    {
      active: true,
      deactivated_by: null,
      deactivated_at: null,
    },
    { expand: 'deactivated_by' },
  )
}

/**
 * Verifica todos os vínculos do componente antes de permitir exclusão:
 * 1. inventory (itens de estoque vinculados direta ou indiretamente por code/descrição)
 * 2. inventory_movements (movimentações de estoque)
 * 3. material_shortages (solicitações/compras)
 * 4. ordem_compra_itens (itens de pedidos de compra)
 * 5. pcp_order_materials (materiais de OPs de produção)
 * 6. products.data.composition (uso na composição técnica de produtos do catálogo)
 */
export const checkComponentUsage = async (
  component: MasterComponent,
): Promise<ComponentUsageCheckResult> => {
  const reasons: string[] = []
  const normCode = (component.code || '').trim()
  const normDesc = (component.description || '').trim()
  const cleanCode = normCode.replace(/["'\\]/g, '')
  const cleanDesc = normDesc.replace(/["'\\]/g, '')

  // 1. Verificar estoque (inventory) e movimentações (inventory_movements)
  let matchingInventoryItems: Inventory[] = []
  try {
    const invFilters: string[] = [`component_id = "${component.id}"`]
    if (cleanCode) invFilters.push(`code = "${cleanCode}"`)
    if (cleanDesc) invFilters.push(`description = "${cleanDesc}"`)

    matchingInventoryItems = await pb.collection('inventory').getFullList<Inventory>({
      filter: invFilters.join(' || '),
    })
  } catch {
    matchingInventoryItems = []
  }

  const inventoryIds = matchingInventoryItems.map((i) => i.id)

  let movementsCount = 0
  if (inventoryIds.length > 0) {
    try {
      const invIdFilter = inventoryIds.map((id) => `inventory_id = "${id}"`).join(' || ')
      const movements = await pb.collection('inventory_movements').getFullList({
        filter: invIdFilter,
        fields: 'id',
      })
      movementsCount = movements.length
    } catch {
      movementsCount = 0
    }
  }

  // 2. Verificar material_shortages
  let shortagesCount = 0
  try {
    const shortFilters: string[] = []
    if (cleanCode) shortFilters.push(`code = "${cleanCode}"`)
    if (cleanDesc) shortFilters.push(`description = "${cleanDesc}"`)
    if (shortFilters.length > 0) {
      const shortages = await pb.collection('material_shortages').getFullList({
        filter: shortFilters.join(' || '),
        fields: 'id',
      })
      shortagesCount = shortages.length
    }
  } catch {
    shortagesCount = 0
  }

  // 3. Verificar ordem_compra_itens
  let ocItensCount = 0
  try {
    const ocFilters: string[] = []
    if (cleanCode) ocFilters.push(`code = "${cleanCode}"`)
    if (cleanDesc) ocFilters.push(`description = "${cleanDesc}"`)
    if (ocFilters.length > 0) {
      const ocItens = await pb.collection('ordem_compra_itens').getFullList({
        filter: ocFilters.join(' || '),
        fields: 'id',
      })
      ocItensCount = ocItens.length
    }
  } catch {
    ocItensCount = 0
  }

  // 4. Verificar pcp_order_materials (materiais de OP)
  let opMaterialsCount = 0
  try {
    const opMatFilters: string[] = []
    if (cleanCode) opMatFilters.push(`code = "${cleanCode}"`)
    if (cleanDesc) opMatFilters.push(`description = "${cleanDesc}"`)
    if (opMatFilters.length > 0) {
      const mats = await pb.collection('pcp_order_materials').getFullList({
        filter: opMatFilters.join(' || '),
        fields: 'id',
      })
      opMaterialsCount = mats.length
    }
  } catch {
    opMaterialsCount = 0
  }

  // 5. Verificar products.data.composition (catálogo de produtos)
  let catalogCompositionsCount = 0
  const catalogProducts: string[] = []
  try {
    const prods = await pb.collection('products').getFullList<Product>({
      fields: 'id,name,code,data',
    })
    for (const p of prods) {
      const compList = p.data?.composition
      if (Array.isArray(compList)) {
        const found = compList.some((item: any) => {
          if (!item) return false
          const iCode = (item.code || '').trim().toLowerCase()
          const iDesc = (item.description || '').trim().toLowerCase()
          if (normCode && iCode && iCode === normCode.toLowerCase()) return true
          if (normDesc && iDesc && iDesc === normDesc.toLowerCase()) return true
          return false
        })
        if (found) {
          catalogCompositionsCount++
          catalogProducts.push(p.name || p.code || p.id)
        }
      }
    }
  } catch {
    catalogCompositionsCount = 0
  }

  // Montar mensagens explicativas dos vínculos encontrados
  if (matchingInventoryItems.length > 0) {
    const totalQty = matchingInventoryItems.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0)
    reasons.push(
      `Vinculado ao estoque (${matchingInventoryItems.length} cadastro(s), saldo total atual: ${totalQty})`,
    )
  }

  if (movementsCount > 0) {
    reasons.push(`${movementsCount} movimentação(ões) no histórico de estoque (entradas/saídas)`)
  }

  if (shortagesCount > 0) {
    reasons.push(`${shortagesCount} solicitação(ões) de compra / insumo registradas`)
  }

  if (ocItensCount > 0) {
    reasons.push(`${ocItensCount} item(ns) de Ordem de Compra vinculados`)
  }

  if (opMaterialsCount > 0) {
    reasons.push(`${opMaterialsCount} matéria(s)-prima(s) vinculada(s) em Ordens de Produção (OPs)`)
  }

  if (catalogCompositionsCount > 0) {
    const prodNames = catalogProducts.slice(0, 3).join(', ')
    const extra = catalogProducts.length > 3 ? ` e mais ${catalogProducts.length - 3}` : ''
    reasons.push(
      `Utilizado na ficha técnica/composição de ${catalogCompositionsCount} produto(s) do catálogo (${prodNames}${extra})`,
    )
  }

  const canDelete = reasons.length === 0

  return {
    canDelete,
    reasons,
    details: {
      inventoryItemsCount: matchingInventoryItems.length,
      movementsCount,
      shortagesCount,
      ocItensCount,
      opMaterialsCount,
      catalogCompositionsCount,
      catalogProducts,
    },
  }
}

/**
 * Exclui com segurança um componente que NÃO tenha nenhum vínculo.
 * Revalida no servidor e executa console.log para auditoria.
 */
export const deleteMasterComponent = async (
  component: MasterComponent,
  user: { id: string; name?: string; email?: string },
): Promise<{ success: boolean }> => {
  // Revalidação estrita antes da exclusão
  const check = await checkComponentUsage(component)
  if (!check.canDelete) {
    throw new Error(
      `Exclusão bloqueada. O item possui vínculos no sistema:\n- ${check.reasons.join('\n- ')}\nUse "Marcar como Inativo".`,
    )
  }

  console.log(
    `[AUDITORIA] Exclusão de componente mestre executada por ${user.name || user.email} (ID: ${user.id}) às ${new Date().toISOString()}:`,
    {
      id: component.id,
      code: component.code,
      description: component.description,
      unit: component.unit,
      source: component.source,
    },
  )

  await pb.collection('components').delete(component.id)
  return { success: true }
}
