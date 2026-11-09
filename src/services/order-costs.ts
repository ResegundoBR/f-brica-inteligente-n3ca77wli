import pb from '@/lib/pocketbase/client'
import {
  InventoryMovement,
  OrderCostCategory,
  PcpCostCategory,
  PcpCostSettings,
  PcpOrderCost,
} from '@/types'

export const ORDER_COST_CATEGORIES: OrderCostCategory[] = [
  'Material',
  'Insumo',
  'Mão de Obra',
  'Terceirização',
  'Impostos',
  'Comissão',
  'RT',
  'Frete',
  'Outros',
]

/**
 * Normaliza string para comparação sem acento e case-insensitive
 */
export function normalizeCategoryName(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Lista categorias ativas de pcp_cost_categories ordenadas por sort_order, name
 */
export async function listCostCategories(onlyActive = true): Promise<PcpCostCategory[]> {
  try {
    return await pb.collection('pcp_cost_categories').getFullList<PcpCostCategory>({
      filter: onlyActive ? 'active = true' : '',
      sort: 'sort_order,name',
    })
  } catch (err) {
    console.error('Erro ao listar categorias de custo:', err)
    // Fallback gracioso para as 9 fixas se a coleção falhar
    return ORDER_COST_CATEGORIES.map((name, i) => ({
      id: `fallback-${i}`,
      name,
      sort_order: i + 1,
      active: true,
      created: '',
      updated: '',
    }))
  }
}

/**
 * Cria ou retorna categoria existente (verificando duplicidade case-insensitive/sem acento).
 * Retorna { category, existed: boolean }
 */
export async function findOrCreateCostCategory(
  rawName: string,
): Promise<{ category: PcpCostCategory; existed: boolean }> {
  const trimmed = rawName.trim()
  if (!trimmed) {
    throw new Error('O nome da categoria não pode estar em branco.')
  }

  const normalizedInput = normalizeCategoryName(trimmed)

  // Busca todas as categorias existentes
  const all = await pb.collection('pcp_cost_categories').getFullList<PcpCostCategory>({
    sort: 'sort_order,name',
  })

  const existing = all.find((c) => normalizeCategoryName(c.name) === normalizedInput)
  if (existing) {
    return { category: existing, existed: true }
  }

  // Descobre o próximo sort_order
  const maxSort = all.reduce((acc, c) => Math.max(acc, c.sort_order || 0), 0)

  const created = await pb.collection('pcp_cost_categories').create<PcpCostCategory>({
    name: trimmed,
    sort_order: maxSort + 1,
    active: true,
  })

  return { category: created, existed: false }
}

export interface CostLine {
  id: string
  category: string
  categoryId?: string
  description: string
  quantity: number
  unitCost: number
  total: number
  source: 'Automático' | 'Manual'
  date?: string
  notes?: string
  createdBy?: string
}

/** Busca as configurações globais de custo (valor/hora padrão e overhead %). */
export async function getCostSettings(): Promise<PcpCostSettings | null> {
  try {
    const list = await pb.collection('pcp_cost_settings').getList<PcpCostSettings>(1, 1)
    return list.items[0] || null
  } catch {
    return null
  }
}

export async function saveCostSettings(data: {
  default_hour_rate?: number
  overhead_percent?: number
}): Promise<PcpCostSettings | null> {
  const existing = await getCostSettings()
  if (existing) {
    return pb
      .collection('pcp_cost_settings')
      .update<PcpCostSettings>(existing.id, data) as Promise<PcpCostSettings>
  }
  return pb
    .collection('pcp_cost_settings')
    .create<PcpCostSettings>(data) as Promise<PcpCostSettings>
}

/** Custo automático de material: inventory_movements (Entrada) vinculados à OP, com frete rateado. */
export function buildAutomaticMaterialCosts(
  movements: InventoryMovement[],
  orderId: string,
): CostLine[] {
  const relevant = movements.filter(
    (m) => m.order_id === orderId && m.type === 'Entrada' && Number(m.quantity) > 0,
  )
  if (relevant.length === 0) return []

  return relevant.map((m) => {
    const inv = m.expand?.inventory_id
    const qty = Number(m.quantity) || 0
    // total_value já contém a parte do frete rateada por VALOR (gravada no backend
    // no recebimento). Usá-lo direto evita dupla contagem do frete.
    const total =
      m.total_value != null && Number(m.total_value) > 0
        ? Number(m.total_value)
        : (Number(m.unit_price) || 0) * qty
    // m.freight é a PARTE do frete que coube a este item na entrega (informativo)
    const itemFreight = Number(m.freight) || 0
    const descParts = [inv?.code ? `[${inv.code}]` : '', inv?.description || m.reason || '']
      .map((p) => p.trim())
      .filter(Boolean)
    return {
      id: `auto-${m.id}`,
      category: 'Material',
      description: descParts.join(' ') || 'Material comprado',
      quantity: qty,
      unitCost: qty > 0 ? total / qty : total,
      total,
      source: 'Automático' as const,
      date: m.purchase_date || m.created,
      notes: itemFreight > 0 ? `inclui frete rateado R$ ${itemFreight.toFixed(2)}` : '',
    }
  })
}

/** Busca os movimentos automáticos vinculados à OP diretamente da API */
export async function fetchAutomaticMaterialCosts(orderId: string): Promise<CostLine[]> {
  try {
    const movements = await pb.collection('inventory_movements').getFullList<InventoryMovement>({
      filter: `order_id="${orderId}" && type="Entrada"`,
      expand: 'inventory_id',
      sort: 'created',
    })
    return buildAutomaticMaterialCosts(movements, orderId)
  } catch (err) {
    console.error('Erro ao buscar custos automáticos de material:', err)
    return []
  }
}

/** Atualiza dados de venda e taxa de hora da OP */
export async function updateOrderFinancialData(
  orderId: string,
  data: { sale_price?: number | null; labor_hour_rate?: number | null },
) {
  return pb.collection('pcp_orders').update(orderId, {
    sale_price: data.sale_price ?? null,
    labor_hour_rate: data.labor_hour_rate ?? null,
  })
}

export async function listOrderCosts(orderId: string): Promise<PcpOrderCost[]> {
  return pb.collection('pcp_order_costs').getFullList<PcpOrderCost>({
    filter: `order_id="${orderId}"`,
    sort: '-created',
    expand: 'created_by,category_id',
  })
}

/** Linhas de custo attachadas ao PEDIDO (order_id vazio + order_number preenchido). */
export async function listOrderCostsByOrderNumber(orderNumber: string): Promise<PcpOrderCost[]> {
  return pb.collection('pcp_order_costs').getFullList<PcpOrderCost>({
    filter: `order_number="${orderNumber}" && order_id=""`,
    sort: '-created',
    expand: 'created_by,category_id',
  })
}

export async function createOrderCost(
  data: Omit<Partial<PcpOrderCost>, 'order_id'> & {
    category: string
    category_id?: string
    order_id?: string
    order_number?: string
  },
): Promise<PcpOrderCost> {
  const payload: Record<string, unknown> = {
    ...data,
    source: 'Manual' as const,
    created_by: pb.authStore.isValid ? pb.authStore.record?.id : undefined,
  }
  if (!data.order_id) payload.order_id = ''
  return pb.collection('pcp_order_costs').create<PcpOrderCost>(payload, {
    expand: 'created_by,category_id',
  })
}

export async function updateOrderCost(id: string, data: Partial<PcpOrderCost>) {
  return pb.collection('pcp_order_costs').update<PcpOrderCost>(id, data, {
    expand: 'created_by,category_id',
  })
}

export async function deleteOrderCost(id: string) {
  return pb.collection('pcp_order_costs').delete(id)
}

export async function getAllOrderCosts(): Promise<PcpOrderCost[]> {
  return pb.collection('pcp_order_costs').getFullList<PcpOrderCost>({
    sort: '-created',
    expand: 'created_by,order_id,category_id',
  })
}

export interface CostSummary {
  automaticMaterial: number
  manualByCategory: Record<string, number>
  materialManual: number
  materialTotal: number
  otherCategoriesTotal: number
  directCost: number
  overheadPercent: number
  overheadValue: number
  fullCost: number // direto + overhead
  salePrice: number
  hasSalePrice: boolean
  contributionMarginValue: number | null
  contributionMarginPercent: number | null
  markup: number | null
  grossMarginValue: number | null
  grossMarginPercent: number | null
  netMarginValue: number | null
  netMarginPercent: number | null
}

const emptyByCategory = (): Record<string, number> =>
  ORDER_COST_CATEGORIES.reduce(
    (acc, c) => {
      acc[c] = 0
      return acc
    },
    {} as Record<string, number>,
  )

export function summarizeCosts(options: {
  automaticMaterial: number
  manualLines: CostLine[]
  salePrice?: number | null
  overheadPercent?: number
}): CostSummary {
  const { automaticMaterial, manualLines, salePrice, overheadPercent = 0 } = options

  const manualByCategory: Record<string, number> = emptyByCategory()
  for (const line of manualLines) {
    const cat = line.category || 'Outros'
    manualByCategory[cat] = (manualByCategory[cat] || 0) + (Number(line.total) || 0)
  }

  const materialManual = manualByCategory['Material'] || 0
  const materialTotal = automaticMaterial + materialManual

  // Categorias que não são Material (inclui todas as 8 fixas + quaisquer novas dinâmicas)
  let otherCategoriesTotal = 0
  for (const [cat, val] of Object.entries(manualByCategory)) {
    if (cat !== 'Material') {
      otherCategoriesTotal += val || 0
    }
  }

  const directCost = materialTotal + otherCategoriesTotal
  const overheadValue = directCost * (overheadPercent / 100)
  const fullCost = directCost + overheadValue

  const hasSalePrice = salePrice != null && Number(salePrice) > 0
  const price = hasSalePrice ? Number(salePrice) : 0

  const pct = (value: number) => (Number.isFinite(value) ? value : null)

  const contributionMarginValue = hasSalePrice ? price - directCost : null
  const contributionMarginPercent =
    hasSalePrice && price > 0 ? pct(((price - directCost) / price) * 100) : null
  const markup = directCost > 0 && hasSalePrice ? pct(price / directCost) : null
  const grossMarginValue = hasSalePrice ? price - materialTotal : null
  const grossMarginPercent =
    hasSalePrice && price > 0 ? pct(((price - materialTotal) / price) * 100) : null
  const netMarginValue = hasSalePrice ? price - fullCost : null
  const netMarginPercent =
    hasSalePrice && price > 0 ? pct(((price - fullCost) / price) * 100) : null

  return {
    automaticMaterial,
    manualByCategory,
    materialManual,
    materialTotal,
    otherCategoriesTotal,
    directCost,
    overheadPercent,
    overheadValue,
    fullCost,
    salePrice: price,
    hasSalePrice,
    contributionMarginValue,
    contributionMarginPercent,
    markup,
    grossMarginValue,
    grossMarginPercent,
    netMarginValue,
    netMarginPercent,
  }
}

export const fmtBRL = (value: number | null | undefined) =>
  (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const fmtPct = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`
