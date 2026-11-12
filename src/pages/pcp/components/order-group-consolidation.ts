import { PcpOrder, PcpOrderCost } from '@/types'
import { CostLine } from '@/services/order-costs'
import { summarizeCosts, CostSummary } from '@/services/order-costs'

/**
 * Consolidação do modo "Por Grupo" da Rentabilidade Especiais.
 *
 * Regras (espelham o modo Por Pedido):
 * - Agrupa as OPs Especiais filtradas por `order_group` (etiqueta gravada em pcp_orders);
 *   OPs SEM etiqueta viram linhas individuais (nunca são omitidas).
 * - Receita = soma dos sale_price das OPs do grupo.
 * - Custos = material automático + linhas manuais de cada OP
 *   + linhas attachadas a cada order_number do grupo (order_id vazio)
 *   + linhas attachadas ao GRUPO (pcp_order_costs com order_id vazio, order_number
 *     vazio e order_group = nome — lançadas pelo botão "Custos do Grupo").
 * - Label = nome do grupo + cliente + contagem de OPs.
 */

export interface GroupConsolidatedRow {
  order: PcpOrder
  orders: PcpOrder[]
  /** Nome da etiqueta do grupo (vazio quando a linha é uma OP individual sem grupo) */
  orderGroup: string
  label: string
  summary: CostSummary
  automaticCount: number
  manualCount: number
  automaticMaterial: number
  manualLines: CostLine[]
  /** Linhas attachadas aos pedidos do grupo (order_number, sem OP) */
  orderLevelLines: CostLine[]
  /** Linhas attachadas ao GRUPO (order_group, sem OP e sem pedido) */
  groupLevelLines: CostLine[]
  archivedCount: number
  archivedAll: boolean
}

/** Converte uma linha de pcp_order_costs em CostLine (source Manual) */
export function costRecordToLine(c: PcpOrderCost): CostLine {
  return {
    id: c.id,
    category: c.expand?.category_id?.name || c.category || 'Outros',
    description: c.description || '',
    quantity: c.quantity ?? 1,
    unitCost: c.unit_cost ?? 0,
    total: c.total ?? 0,
    source: 'Manual' as const,
    date: c.date,
  }
}

export function buildGroupRows({
  rows,
  orderLevelCostsByNumber,
  orderGroupCostsByGroup,
  overheadPercent,
}: {
  /** Linhas base (já filtradas por busca/status/período/arquivados), como no modo Por OP */
  rows: {
    order: PcpOrder
    summary: CostSummary
    automaticCount: number
    manualCount: number
    automaticMaterial: number
    manualLines: CostLine[]
    archivedCount: number
    archivedAll: boolean
  }[]
  /** Mapa order_number → linhas de custo attachadas ao pedido */
  orderLevelCostsByNumber: Record<string, PcpOrderCost[]>
  /** Mapa order_group → linhas de custo attachadas ao grupo */
  orderGroupCostsByGroup: Record<string, PcpOrderCost[]>
  overheadPercent: number
}): GroupConsolidatedRow[] {
  const groups = new Map<string, typeof rows>()
  for (const row of rows) {
    const g = (row.order.order_group || '').trim()
    if (!g) continue
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(row)
  }

  const consolidated: GroupConsolidatedRow[] = []

  for (const [groupName, groupRows] of groups) {
    const sorted = [...groupRows].sort((a, b) =>
      (a.order.op_number || a.order.id).localeCompare(b.order.op_number || b.order.id),
    )
    const groupOrders = sorted.map((r) => r.order)
    const first = groupOrders[0]

    const automaticMaterial = sorted.reduce((acc, r) => acc + (r.automaticMaterial || 0), 0)
    const manualLines = sorted.flatMap((r) => r.manualLines)

    // Linhas attachadas a cada order_number do grupo (order_id vazio)
    const orderNumbers = new Set(
      groupOrders.map((o) => (o.order_number || '').trim()).filter(Boolean),
    )
    const orderLevelLines: CostLine[] = []
    for (const onum of orderNumbers) {
      const lines = orderLevelCostsByNumber[onum] || []
      orderLevelLines.push(...lines.map(costRecordToLine))
    }

    // Linhas attachadas ao GRUPO (order_id vazio, order_number vazio, order_group = nome)
    const groupLevelLines = (orderGroupCostsByGroup[groupName] || []).map(costRecordToLine)

    const salePrice = groupOrders.reduce((acc, o) => acc + (Number(o.sale_price) || 0), 0)
    const summary = summarizeCosts({
      automaticMaterial,
      manualLines: [...manualLines, ...orderLevelLines, ...groupLevelLines],
      salePrice,
      overheadPercent,
    })

    const clientName = first.client_name || first.expand?.client_id?.name || '-'

    consolidated.push({
      order: first,
      orders: groupOrders,
      orderGroup: groupName,
      label: `${groupName} · ${clientName} · ${groupOrders.length} OP${
        groupOrders.length > 1 ? 's' : ''
      }`,
      summary,
      automaticCount: sorted.reduce((acc, r) => acc + (r.automaticCount || 0), 0),
      manualCount: sorted.reduce((acc, r) => acc + (r.manualCount || 0), 0),
      automaticMaterial,
      manualLines,
      orderLevelLines,
      groupLevelLines,
      archivedCount: sorted.reduce((acc, r) => acc + (r.archivedCount || 0), 0),
      archivedAll: groupOrders.every((o) => o.archived === true),
    })
  }

  // OPs SEM etiqueta: linhas individuais (nunca omitidas)
  for (const row of rows) {
    if ((row.order.order_group || '').trim()) continue
    consolidated.push({
      order: row.order,
      orders: [row.order],
      orderGroup: '',
      label: row.order.op_number ? `OP ${row.order.op_number}` : `OP #${row.order.id.slice(0, 5)}`,
      summary: row.summary,
      automaticCount: row.automaticCount,
      manualCount: row.manualCount,
      automaticMaterial: row.automaticMaterial,
      manualLines: row.manualLines,
      orderLevelLines: [],
      groupLevelLines: [],
      archivedCount: row.archivedCount,
      archivedAll: row.archivedAll,
    })
  }

  return consolidated
}
