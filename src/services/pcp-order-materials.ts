import pb from '@/lib/pocketbase/client'
import type { PcpOrderMaterial, PcpOrderMaterialStatus, PcpOrderMaterialSector } from '@/types'

export interface CreatePcpOrderMaterialInput {
  order_id: string
  sector: PcpOrderMaterialSector
  code: string
  description: string
  quantity: number
  unit?: string
  category?: string
  status?: PcpOrderMaterialStatus
  measurements?: string
  notes?: string
}

export const getOrderMaterials = async (orderId: string): Promise<PcpOrderMaterial[]> => {
  return pb.collection('pcp_order_materials').getFullList<PcpOrderMaterial>({
    filter: `order_id = "${orderId}"`,
    sort: 'created',
    expand: 'separated_by',
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
    expand: 'separated_by',
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

/**
 * Mapeia e escala itens da composição do catálogo de produto para linhas de pcp_order_materials
 * aplicando estritamente: quantity = per_unit_quantity * op_quantity.
 */
export function buildOrderMaterialsFromComposition(params: {
  orderId: string
  orderQuantity: number
  composition: Array<{
    code?: string
    description?: string
    quantity?: number | string
    unit?: string
    measurements?: string
    etapa?: string
    category?: string
  }>
}): CreatePcpOrderMaterialInput[] {
  const { orderId, orderQuantity, composition } = params
  const opQty = Number(orderQuantity) > 0 ? Number(orderQuantity) : 1

  return (composition || []).map((c) => {
    let sec: PcpOrderMaterialSector = 'FABRICAÇÃO'
    const etapa = (c.etapa || '').toUpperCase()
    if (etapa.includes('PREPAR') || etapa.includes('ACABAM')) sec = 'PREPARAÇÃO'
    else if (etapa.includes('MONTAG')) sec = 'MONTAGEM'
    else if (etapa.includes('EXPED') || etapa.includes('EMBAL')) sec = 'EXPEDIÇÃO'

    const compQty = Number(c.quantity) || 1
    const totalQty = Math.round(compQty * opQty * 10000) / 10000

    return {
      order_id: orderId,
      sector: sec,
      code: c.code || '',
      description: c.description || '',
      quantity: totalQty,
      unit: c.unit || 'UN',
      category: c.category || '',
      measurements: c.measurements || '',
      status: 'Pendente',
    }
  })
}

/**
 * Escala itens revisados do modal de PDF aplicando:
 * quantity = per_unit_quantity * op_quantity.
 */
export function scaleReviewedPdfMaterialsForOp(params: {
  orderId: string
  orderQuantity: number
  reviewedMaterials: Array<{
    sector: PcpOrderMaterialSector
    code?: string
    description: string
    quantity: number
    unit?: string
    measurements?: string
    category?: string
  }>
}): CreatePcpOrderMaterialInput[] {
  const { orderId, orderQuantity, reviewedMaterials } = params
  const opQty = Number(orderQuantity) > 0 ? Number(orderQuantity) : 1

  return (reviewedMaterials || []).map((m) => {
    const totalQty = Math.round(Number(m.quantity || 0) * opQty * 10000) / 10000
    return {
      order_id: orderId,
      sector: m.sector,
      code: m.code || '',
      description: m.description,
      quantity: totalQty,
      unit: m.unit,
      category: m.category || '',
      measurements: m.measurements,
      status: 'Pendente',
    }
  })
}
