import pb from '@/lib/pocketbase/client'
import { InventoryMovement, OrderCostCategory, PcpCostSettings, PcpOrderCost } from '@/types'

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

export interface CostLine {
  id: string
  category: OrderCostCategory
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

  const totalQty = relevant.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0)
  const totalFreight = relevant.reduce((acc, m) => acc + (Number(m.freight) || 0), 0)

  return relevant
    .map((m) => {
      const inv = m.expand?.inventory_id
      const qty = Number(m.quantity) || 0
      const baseValue =
        m.total_value != null && Number(m.total_value) > 0
          ? Number(m.total_value)
          : (Number(m.unit_price) || 0) * qty
      const freightShare = totalQty > 0 ? (Number(m.freight) || 0) * (qty / totalQty) : 0
      const total = baseValue + freightShare
      const descParts = [inv?.code ? `[${inv.code}]` : '', inv?.description || m.reason || '']
        .map((p) => p.trim())
        .filter(Boolean)
      return {
        id: `auto-${m.id}`,
        category: 'Material' as OrderCostCategory,
        description: descParts.join(' ') || 'Material comprado',
        quantity: qty,
        unitCost: qty > 0 ? total / qty : total,
        total,
        source: 'Automático' as const,
        date: m.purchase_date || m.created,
        notes: freightShare > 0 ? `Frete rateado: R$ ${freightShare.toFixed(2)}` : '',
      }
    })
    .concat(
      // sobras de rateio de frete vão para a primeira linha para fechar a conta
      (() => {
        const allocated = relevant.reduce((acc, m) => {
          const qty = Number(m.quantity) || 0
          return acc + (totalQty > 0 ? (Number(m.freight) || 0) * (qty / totalQty) : 0)
        }, 0)
        const diff = totalFreight - allocated
        if (Math.abs(diff) < 0.005 || relevant.length === 0) return []
        const first = relevant[0]
        const inv = first.expand?.inventory_id
        return [
          {
            id: `auto-freight-adjust-${first.id}`,
            category: 'Material' as OrderCostCategory,
            description: `Ajuste de rateio de frete${inv?.code ? ` [${inv.code}]` : ''}`,
            quantity: 0,
            unitCost: 0,
            total: diff,
            source: 'Automático' as const,
            date: first.purchase_date || first.created,
            notes: '',
          },
        ]
      })(),
    )
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
    expand: 'created_by',
  })
}

export async function createOrderCost(
  data: Partial<PcpOrderCost> & { order_id: string; category: OrderCostCategory },
): Promise<PcpOrderCost> {
  const payload = {
    ...data,
    source: 'Manual' as const,
    created_by: pb.authStore.isValid ? pb.authStore.record?.id : undefined,
  }
  return pb.collection('pcp_order_costs').create<PcpOrderCost>(payload)
}

export async function updateOrderCost(id: string, data: Partial<PcpOrderCost>) {
  return pb.collection('pcp_order_costs').update<PcpOrderCost>(id, data)
}

export async function deleteOrderCost(id: string) {
  return pb.collection('pcp_order_costs').delete(id)
}

export async function getAllOrderCosts(): Promise<PcpOrderCost[]> {
  return pb.collection('pcp_order_costs').getFullList<PcpOrderCost>({
    sort: '-created',
    expand: 'created_by,order_id',
  })
}

export interface CostSummary {
  automaticMaterial: number
  manualByCategory: Record<OrderCostCategory, number>
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

const emptyByCategory = (): Record<OrderCostCategory, number> =>
  ORDER_COST_CATEGORIES.reduce(
    (acc, c) => {
      acc[c] = 0
      return acc
    },
    {} as Record<OrderCostCategory, number>,
  )

export function summarizeCosts(options: {
  automaticMaterial: number
  manualLines: CostLine[]
  salePrice?: number | null
  overheadPercent?: number
}): CostSummary {
  const { automaticMaterial, manualLines, salePrice, overheadPercent = 0 } = options

  const manualByCategory = emptyByCategory()
  for (const line of manualLines) {
    if (manualByCategory[line.category] !== undefined) {
      manualByCategory[line.category] += Number(line.total) || 0
    }
  }

  const materialManual = manualByCategory['Material'] || 0
  const materialTotal = automaticMaterial + materialManual
  const otherCategoriesTotal = ORDER_COST_CATEGORIES.filter((c) => c !== 'Material').reduce(
    (acc, c) => acc + (manualByCategory[c] || 0),
    0,
  )
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
