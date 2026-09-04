import pb from '@/lib/pocketbase/client'
import { PcpOrderDelivery } from '@/types'

export interface CreateDeliveryInput {
  order_id: string
  quantity: number
  nf?: string
  transportadora?: string
  data_saida?: string
  notes?: string
}

export async function getDeliveriesByOrder(orderId: string): Promise<PcpOrderDelivery[]> {
  try {
    return await pb.collection('pcp_order_deliveries').getFullList<PcpOrderDelivery>({
      filter: `order_id="${orderId}"`,
      sort: '-created',
      expand: 'created_by',
    })
  } catch (err) {
    console.error('Error fetching deliveries for order', orderId, err)
    return []
  }
}

export async function getDeliveriesForOrders(
  orderIds: string[],
): Promise<Record<string, PcpOrderDelivery[]>> {
  if (orderIds.length === 0) return {}
  try {
    const filter = orderIds.map((id) => `order_id="${id}"`).join(' || ')
    const deliveries = await pb.collection('pcp_order_deliveries').getFullList<PcpOrderDelivery>({
      filter,
      sort: '-created',
      expand: 'created_by',
    })
    const map: Record<string, PcpOrderDelivery[]> = {}
    for (const d of deliveries) {
      if (!map[d.order_id]) map[d.order_id] = []
      map[d.order_id].push(d)
    }
    return map
  } catch (err) {
    console.error('Error fetching deliveries batch', err)
    return {}
  }
}

export async function createDelivery(input: CreateDeliveryInput): Promise<PcpOrderDelivery> {
  const currentUserId = pb.authStore.record?.id
  const payload: any = {
    order_id: input.order_id,
    quantity: input.quantity,
    nf: input.nf?.trim() || '',
    transportadora: input.transportadora?.trim() || '',
    notes: input.notes?.trim() || '',
  }
  if (input.data_saida) {
    payload.data_saida = new Date(input.data_saida).toISOString()
  }
  if (currentUserId) {
    payload.created_by = currentUserId
  }

  return await pb.collection('pcp_order_deliveries').create<PcpOrderDelivery>(payload)
}

export function calculateOrderDeliveryBalance(op: {
  quantity: number
  delivered_quantity?: number
}): { total: number; delivered: number; pending: number } {
  const total = op.quantity || 0
  const delivered = Math.max(0, op.delivered_quantity || 0)
  const pending = Math.max(0, total - delivered)
  return { total, delivered, pending }
}
