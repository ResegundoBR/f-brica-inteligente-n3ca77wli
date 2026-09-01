import pb from '@/lib/pocketbase/client'
import type { PcpOrderMaterial, PcpOrderMaterialStatus, PcpOrderMaterialSector } from '@/types'

export interface CreatePcpOrderMaterialInput {
  order_id: string
  sector: PcpOrderMaterialSector
  code: string
  description: string
  quantity: number
  unit?: string
  status?: PcpOrderMaterialStatus
  measurements?: string
  notes?: string
}

export const getOrderMaterials = async (orderId: string): Promise<PcpOrderMaterial[]> => {
  return pb.collection('pcp_order_materials').getFullList<PcpOrderMaterial>({
    filter: `order_id = "${orderId}"`,
    sort: 'created',
  })
}

export const getOrderMaterialsForOrders = async (
  orderIds: string[],
): Promise<PcpOrderMaterial[]> => {
  if (orderIds.length === 0) return []
  const filter = orderIds.map((id) => `order_id = "${id}"`).join(' || ')
  return pb.collection('pcp_order_materials').getFullList<PcpOrderMaterial>({
    filter,
    sort: 'created',
  })
}

export const createOrderMaterialsBatch = async (
  materials: CreatePcpOrderMaterialInput[],
): Promise<PcpOrderMaterial[]> => {
  const created: PcpOrderMaterial[] = []
  for (const mat of materials) {
    const record = await pb.collection('pcp_order_materials').create<PcpOrderMaterial>({
      ...mat,
      status: mat.status || 'Pendente',
    })
    created.push(record)
  }
  return created
}

export const updateOrderMaterialStatus = async (
  id: string,
  status: PcpOrderMaterialStatus,
  separated_by?: string,
): Promise<PcpOrderMaterial> => {
  const payload: Partial<PcpOrderMaterial> = {
    status,
    separated_at: status === 'Separado' ? new Date().toISOString() : undefined,
    separated_by: status === 'Separado' ? separated_by : undefined,
  }
  return pb.collection('pcp_order_materials').update<PcpOrderMaterial>(id, payload)
}

export const deleteOrderMaterialsByOrder = async (orderId: string): Promise<void> => {
  const existing = await getOrderMaterials(orderId)
  for (const item of existing) {
    await pb.collection('pcp_order_materials').delete(item.id)
  }
}
