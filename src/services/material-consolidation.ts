import { MaterialShortage, PcpOrderMaterial } from '@/types'
import pb from '@/lib/pocketbase/client'
import {
  getStockAvailabilityForCodes,
  ComponentStockAvailability,
} from '@/services/material-reservations'

/** Status considerados em aberto */
export const OPEN_SHORTAGE_STATUSES = [
  'Pendente',
  'Liberado_Estoque',
  'Cotação',
  'Compra',
  'Recebido_Parcial',
] as const

export type DemandType = 'solicitacao_aberta' | 'necessidade_futura'

export interface OtherOpDemandItem {
  shortageId: string
  demandType: DemandType
  orderId?: string
  orderNumber: string
  opNumber: string
  deliveryDate?: string
  quantity: number // saldo necessário
  originalQuantity: number
  receivedQuantity: number
  status: string
  clientName?: string
}

export interface ItemStockInfo {
  totalStock: number
  reservedStock: number
  availableStock: number
  suggestedPurchaseQty: number // max(0, totalConsolidatedQuantity - availableStock)
  unit: string
}

export interface ItemDemandConsolidation {
  currentBalance: number
  otherDemands: OtherOpDemandItem[]
  totalOtherQuantity: number
  totalConsolidatedQuantity: number // saldo atual + soma das outras OPs
  countOtherOps: number
  // Subtotais por tipo de demanda
  totalOpenShortagesQuantity: number
  totalFutureDemandsQuantity: number
  // Informações de estoque e sugestão de compra (quando consultado)
  stockInfo?: ItemStockInfo
}

/**
 * Normaliza strings para comparação insensível a maiúsculas, espaços e acentos.
 */
export function normalizeKey(text?: string | null): string {
  if (!text) return ''
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Calcula o saldo faltante de um item de solicitação.
 * Se Recebido ou Cancelado, o saldo é 0.
 * Se Recebido_Parcial, é max(0, quantity - received_quantity).
 * Caso contrário, é a quantidade total (menos o recebido se houver).
 */
export function calculateShortageBalance(
  item: Pick<MaterialShortage, 'quantity' | 'received_quantity' | 'status'>,
): number {
  const status = item.status
  if (status === 'Recebido' || status === 'Cancelado') return 0
  const qty = Number(item.quantity) || 0
  const rec = Number(item.received_quantity) || 0
  if (status === 'Recebido_Parcial') {
    return Math.max(0, qty - rec)
  }
  return Math.max(0, qty - rec > 0 ? qty - rec : qty)
}

/**
 * Verifica se dois itens correspondem ao mesmo produto/componente:
 * 1. Pelo código do item (se ambos tiverem código não vazio)
 * 2. Fallback: pela descrição igual ou similar (normalizada)
 */
export function isSameItem(
  a: { code?: string | null; description?: string | null },
  b: { code?: string | null; description?: string | null },
): boolean {
  const codeA = normalizeKey(a.code)
  const codeB = normalizeKey(b.code)

  if (codeA && codeB) {
    return codeA === codeB
  }

  const descA = normalizeKey(a.description)
  const descB = normalizeKey(b.description)

  if (!descA || !descB) return false

  return descA === descB
}

/**
 * Busca outras solicitações em aberto do mesmo item em uma lista de material_shortages.
 * Exclui a própria solicitação (`currentItem.id` ou itens em `excludedShortageIds`)
 * e solicitações com status Recebido ou Cancelado.
 */
export function findOtherOpDemands(
  currentItem: MaterialShortage,
  allShortages: MaterialShortage[],
  excludedShortageIds?: string[],
): ItemDemandConsolidation {
  if (!currentItem) {
    return {
      currentBalance: 0,
      otherDemands: [],
      totalOtherQuantity: 0,
      totalConsolidatedQuantity: 0,
      countOtherOps: 0,
      totalOpenShortagesQuantity: 0,
      totalFutureDemandsQuantity: 0,
    }
  }

  const excludedIdsSet = new Set<string>(excludedShortageIds || [currentItem.id])
  excludedIdsSet.add(currentItem.id)

  const currentBalance = calculateShortageBalance(currentItem)
  const otherDemands: OtherOpDemandItem[] = []

  for (const s of allShortages) {
    // Não comparar com o próprio registro ou itens do mesmo grupo
    if (excludedIdsSet.has(s.id)) continue

    // Apenas em aberto: não pode ser Recebido nem Cancelado
    if (s.status === 'Recebido' || s.status === 'Cancelado') continue

    // Verifica se é o mesmo item (código ou descrição)
    if (!isSameItem(currentItem, s)) continue

    const balance = calculateShortageBalance(s)
    if (balance <= 0) continue

    const order = s.expand?.order_id
    const orderNumber = order?.order_number || (s.order_id ? 'OP vinculada' : 'Req. Geral')
    const opNumber = order?.op_number || '-'
    const deliveryDate = order?.delivery_date || s.expected_date

    otherDemands.push({
      shortageId: s.id,
      demandType: 'solicitacao_aberta',
      orderId: s.order_id,
      orderNumber,
      opNumber,
      deliveryDate,
      quantity: balance,
      originalQuantity: Number(s.quantity) || 0,
      receivedQuantity: Number(s.received_quantity) || 0,
      status: s.status,
      clientName: order?.client_name,
    })
  }

  const totalOtherQuantity = otherDemands.reduce((sum, d) => sum + d.quantity, 0)
  const totalConsolidatedQuantity = currentBalance + totalOtherQuantity

  return {
    currentBalance,
    otherDemands,
    totalOtherQuantity,
    totalConsolidatedQuantity,
    countOtherOps: otherDemands.length,
    totalOpenShortagesQuantity: totalOtherQuantity,
    totalFutureDemandsQuantity: 0,
  }
}

/**
 * Status de solicitação que contam como em aberto correspondente
 * (Pendente, Liberado_Estoque, Cotação, Compra, Recebido_Parcial)
 */
const ACTIVE_SHORTAGE_STATUSES = new Set([
  'Pendente',
  'Liberado_Estoque',
  'Cotação',
  'Compra',
  'Recebido_Parcial',
])

/**
 * Busca necessidades futuras de engenharia (pcp_order_materials) para o item:
 * 1. OPs NÃO concluídas (status ≠ Concluído)
 * 2. Item com status ≠ 'Separado'
 * 3. OPs que NÃO tenham solicitação em aberto correspondente no mesmo código/descrição
 *    (Pendente/Cotação/Compra/Recebido_Parcial/Liberado_Estoque)
 * 4. Exclui a OP do próprio item atual ou OPs já presentes nas solicitações do grupo
 */
export async function findFutureEngineeringDemands(
  currentItem: { code?: string | null; description?: string | null },
  allShortages: MaterialShortage[] = [],
  excludedOrderIds: string[] = [],
): Promise<OtherOpDemandItem[]> {
  const normCode = normalizeKey(currentItem.code)
  const normDesc = normalizeKey(currentItem.description)

  if (!normCode && !normDesc) return []

  try {
    // 1. Varrer pcp_order_materials buscando pelo código ou descrição, com expand em order_id
    let filter = 'status != "Separado"'
    if (normCode) {
      filter += ` && code ~ "${currentItem.code!.trim()}"`
    }

    const materials = await pb.collection('pcp_order_materials').getFullList<PcpOrderMaterial>({
      filter,
      expand: 'order_id',
      sort: '-created',
    })

    if (!materials || materials.length === 0) return []

    // 2. Coletar IDs de pedidos que já possuem solicitação em aberto para este item
    const ordersWithActiveShortage = new Set<string>()
    for (const s of allShortages) {
      if (s.order_id && ACTIVE_SHORTAGE_STATUSES.has(s.status) && isSameItem(currentItem, s)) {
        ordersWithActiveShortage.add(s.order_id)
      }
    }

    const excludedOrdersSet = new Set<string>(excludedOrderIds)

    const futureDemands: OtherOpDemandItem[] = []
    const seenOrderKeys = new Set<string>()

    for (const mat of materials) {
      // Validar correspondência exata do item
      if (!isSameItem(currentItem, mat)) continue

      // Descartar se status for 'Separado'
      if (mat.status === 'Separado') continue

      const order = mat.expand?.order_id
      if (!order) continue

      // OP NÃO concluída (status ≠ Concluído)
      if (order.status === 'Concluído') continue

      // Excluir se o pedido já tem solicitação em aberto correspondente
      if (ordersWithActiveShortage.has(order.id)) continue

      // Excluir se pedido faz parte do grupo atualmente selecionado
      if (excludedOrdersSet.has(order.id)) continue

      // Evitar duplicar a mesma OP caso haja mais de um registro do material na mesma OP
      const dedupeKey = `${order.id}-${mat.id}`
      if (seenOrderKeys.has(dedupeKey)) continue
      seenOrderKeys.add(dedupeKey)

      const qty = Number(mat.quantity) || 0
      if (qty <= 0) continue

      futureDemands.push({
        shortageId: `future-${mat.id}`,
        demandType: 'necessidade_futura',
        orderId: order.id,
        orderNumber: order.order_number || 'OP s/ número',
        opNumber: order.op_number || '-',
        deliveryDate: order.delivery_date,
        quantity: qty,
        originalQuantity: qty,
        receivedQuantity: 0,
        status: order.status || 'OP em andamento',
        clientName: order.client_name,
      })
    }

    return futureDemands
  } catch (err) {
    console.error('Erro ao buscar demandas futuras de engenharia:', err)
    return []
  }
}

/**
 * Função unificada assíncrona que consolida:
 * 1. Saldo atual (ou do grupo)
 * 2. Outras solicitações em aberto (material_shortages)
 * 3. Necessidades futuras de engenharia (pcp_order_materials em OPs não concluídas sem solicitação aberta e não separadas)
 * 4. Disponibilidade de estoque (total / reservado / disponível) via getStockAvailabilityForCodes
 * 5. Sugestão de compra = max(0, totalConsolidado - disponível)
 */
export async function findConsolidatedDemandAsync(params: {
  currentItem: MaterialShortage
  groupItems?: MaterialShortage[]
  allShortages: MaterialShortage[]
  includeFutureDemands?: boolean
  includeStock?: boolean
}): Promise<ItemDemandConsolidation> {
  const {
    currentItem,
    groupItems = [],
    allShortages = [],
    includeFutureDemands = true,
    includeStock = true,
  } = params

  if (!currentItem) {
    return {
      currentBalance: 0,
      otherDemands: [],
      totalOtherQuantity: 0,
      totalConsolidatedQuantity: 0,
      countOtherOps: 0,
      totalOpenShortagesQuantity: 0,
      totalFutureDemandsQuantity: 0,
    }
  }

  const isMultiItem = groupItems.length > 1
  const effectiveGroup = isMultiItem ? groupItems : [currentItem]

  // Saldo base: soma dos itens do grupo atual
  const currentBalance = effectiveGroup.reduce((sum, it) => sum + calculateShortageBalance(it), 0)

  // IDs e orderIds excluídos de "outras demandas" pois já são o contexto atual
  const excludedShortageIds = effectiveGroup.map((it) => it.id)
  const excludedOrderIds = effectiveGroup
    .map((it) => it.order_id)
    .filter((id): id is string => Boolean(id))

  // 1. Demanda de outras solicitações em aberto
  const baseConsolidation = findOtherOpDemands(currentItem, allShortages, excludedShortageIds)
  const openShortageDemands = baseConsolidation.otherDemands

  // 2. Necessidades futuras de engenharia (se habilitado)
  let futureDemands: OtherOpDemandItem[] = []
  if (includeFutureDemands) {
    futureDemands = await findFutureEngineeringDemands(currentItem, allShortages, excludedOrderIds)
  }

  const allOtherDemands = [...openShortageDemands, ...futureDemands]
  const totalOpenShortagesQuantity = openShortageDemands.reduce((sum, d) => sum + d.quantity, 0)
  const totalFutureDemandsQuantity = futureDemands.reduce((sum, d) => sum + d.quantity, 0)
  const totalOtherQuantity = totalOpenShortagesQuantity + totalFutureDemandsQuantity
  const totalConsolidatedQuantity = currentBalance + totalOtherQuantity

  // 3. Informações de estoque (se habilitado e código estiver presente)
  let stockInfo: ItemStockInfo | undefined = undefined
  if (includeStock && currentItem.code) {
    try {
      const stockMap = await getStockAvailabilityForCodes([currentItem.code])
      const availability = stockMap.get(normalizeKey(currentItem.code))
      if (availability) {
        const suggestedPurchaseQty = Math.max(
          0,
          totalConsolidatedQuantity - availability.availableStock,
        )
        stockInfo = {
          totalStock: availability.totalStock,
          reservedStock: availability.reservedStock,
          availableStock: availability.availableStock,
          suggestedPurchaseQty,
          unit: availability.unit || 'un',
        }
      }
    } catch (err) {
      console.error('Erro ao consultar estoque para consolidação:', err)
    }
  }

  return {
    currentBalance,
    otherDemands: allOtherDemands,
    totalOtherQuantity,
    totalConsolidatedQuantity,
    countOtherOps: allOtherDemands.length,
    totalOpenShortagesQuantity,
    totalFutureDemandsQuantity,
    stockInfo,
  }
}
