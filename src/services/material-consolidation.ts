import { MaterialShortage } from '@/types'

/** Status considerados em aberto */
export const OPEN_SHORTAGE_STATUSES = [
  'Pendente',
  'Liberado_Estoque',
  'Cotação',
  'Compra',
  'Recebido_Parcial',
] as const

export interface OtherOpDemandItem {
  shortageId: string
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

export interface ItemDemandConsolidation {
  currentBalance: number
  otherDemands: OtherOpDemandItem[]
  totalOtherQuantity: number
  totalConsolidatedQuantity: number // saldo atual + soma das outras OPs
  countOtherOps: number
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
  a: Pick<MaterialShortage, 'code' | 'description'>,
  b: Pick<MaterialShortage, 'code' | 'description'>,
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
 * Exclui a própria solicitação (`currentItem.id`) e solicitações com status Recebido ou Cancelado.
 * Agrupa ou lista cada OP vinculada com Pedido, OP, qtde necessária (saldo) e vencimento (delivery_date).
 */
export function findOtherOpDemands(
  currentItem: MaterialShortage,
  allShortages: MaterialShortage[],
): ItemDemandConsolidation {
  const currentBalance = calculateShortageBalance(currentItem)

  if (!currentItem) {
    return {
      currentBalance: 0,
      otherDemands: [],
      totalOtherQuantity: 0,
      totalConsolidatedQuantity: 0,
      countOtherOps: 0,
    }
  }

  const otherDemands: OtherOpDemandItem[] = []

  for (const s of allShortages) {
    // Não comparar com o próprio registro
    if (s.id === currentItem.id) continue

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
  }
}
