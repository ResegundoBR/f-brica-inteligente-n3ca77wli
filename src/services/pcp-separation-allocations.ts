import pb from '@/lib/pocketbase/client'
import { getOrderMaterialsForOrders } from '@/services/pcp-order-materials'
import { isSameItem, normalizeKey } from '@/services/material-consolidation'
import type { SeparationItem } from '@/services/material-separations'
import type { PcpOrderMaterial, PcpOrder } from '@/types'

export interface OpAllocation {
  orderId: string
  opNumber: string
  quantity: number | null // null se não encontrado na BOM ('—')
  unit?: string
}

export interface AllocationMapResult {
  allocationsByItemKey: Map<string, OpAllocation[]>
  loading: boolean
}

/**
 * Gera chave única para identificar o SeparationItem no mapa de rateio
 */
export function getItemAllocationKey(
  item: Pick<SeparationItem, 'id' | 'code' | 'description'>,
): string {
  if (item.id) return item.id
  const normCode = normalizeKey(item.code)
  if (normCode) return `code:${normCode}`
  return `desc:${normalizeKey(item.description)}`
}

/**
 * Formata número de OP legível para exibição segura com NoTranslate
 * Ex: '000515/2026' -> 'OP 000515/2026'
 * Se já contém 'OP', mantém intacto.
 */
export function formatOpDisplay(rawOpNumber?: string | null): string {
  if (!rawOpNumber) return 'OP -'
  const trimmed = rawOpNumber.trim()
  if (/^op\b/i.test(trimmed)) {
    return trimmed
  }
  return `OP ${trimmed}`
}

/**
 * Carrega a BOM das OPs (pcp_order_materials) e os números legíveis de pcp_orders
 * e monta um mapa por item da rodada de separação com o rateio por OP.
 */
export async function loadRoundOpAllocations(
  orderIds: string[],
  items: SeparationItem[],
): Promise<Map<string, OpAllocation[]>> {
  const allocationMap = new Map<string, OpAllocation[]>()
  if (!orderIds || orderIds.length === 0 || !items || items.length === 0) {
    return allocationMap
  }

  // Deduplicar orderIds
  const uniqueOrderIds = Array.from(new Set(orderIds.filter(Boolean)))
  if (uniqueOrderIds.length === 0) {
    return allocationMap
  }

  try {
    // 1. Carregar paralelamente materiais da BOM (pcp_order_materials) e dados das OPs (pcp_orders)
    const [materials, orders] = await Promise.all([
      getOrderMaterialsForOrders(uniqueOrderIds).catch((err) => {
        console.error('Erro ao carregar pcp_order_materials para rateio:', err)
        return [] as PcpOrderMaterial[]
      }),
      (async () => {
        try {
          const filter = uniqueOrderIds.map((id) => `id = "${id}"`).join(' || ')
          return await pb.collection('pcp_orders').getFullList<PcpOrder>({
            filter,
            fields: 'id,op_number,order_number',
          })
        } catch (err) {
          console.error('Erro ao carregar pcp_orders para rateio:', err)
          return [] as PcpOrder[]
        }
      })(),
    ])

    // Mapa de orderId -> opNumber legível
    const opNumberByOrderId = new Map<string, string>()
    for (const ord of orders) {
      const display = ord.op_number || ord.order_number || ord.id
      opNumberByOrderId.set(ord.id, formatOpDisplay(display))
    }

    // Mapa auxiliar: orderId -> lista de PcpOrderMaterial daquela OP
    const materialsByOrder = new Map<string, PcpOrderMaterial[]>()
    for (const mat of materials) {
      if (!mat.order_id) continue
      const list = materialsByOrder.get(mat.order_id) || []
      list.push(mat)
      materialsByOrder.set(mat.order_id, list)
    }

    // 2. Para cada item da rodada que possui order_ids, montar as alocações
    for (const item of items) {
      const itemKey = getItemAllocationKey(item)
      const itemOrderIds = item.order_ids && item.order_ids.length > 0 ? item.order_ids : []

      if (itemOrderIds.length <= 1) {
        // Itens de OP única permanecem como estão (não precisam de rateio)
        continue
      }

      const allocations: OpAllocation[] = []

      for (let i = 0; i < itemOrderIds.length; i++) {
        const oId = itemOrderIds[i]
        // Fallback de op_number caso não tenha em pcp_orders: usar item.op_numbers[i] se houver
        const fallbackOp = item.op_numbers?.[i] ? formatOpDisplay(item.op_numbers[i]) : undefined
        const resolvedOp = opNumberByOrderId.get(oId) || fallbackOp || formatOpDisplay(oId)

        // Buscar componentes da BOM desta OP que correspondam ao item
        const opMaterials = materialsByOrder.get(oId) || []
        const matchedMaterials = opMaterials.filter((m) => isSameItem(item, m))

        if (matchedMaterials.length > 0) {
          // Somar as quantidades caso haja mais de um registro do mesmo componente na mesma OP
          const totalQty = matchedMaterials.reduce((sum, m) => sum + (Number(m.quantity) || 0), 0)
          const unit = matchedMaterials[0].unit || item.unit || 'un'
          allocations.push({
            orderId: oId,
            opNumber: resolvedOp,
            quantity: totalQty,
            unit,
          })
        } else {
          // Se não encontrado na BOM da OP, quantidade é null ('—') em vez de 0 enganoso
          allocations.push({
            orderId: oId,
            opNumber: resolvedOp,
            quantity: null,
            unit: item.unit || 'un',
          })
        }
      }

      allocationMap.set(itemKey, allocations)
    }

    return allocationMap
  } catch (err) {
    console.error('Erro ao montar rateio por OP na rodada de separação:', err)
    return allocationMap
  }
}
