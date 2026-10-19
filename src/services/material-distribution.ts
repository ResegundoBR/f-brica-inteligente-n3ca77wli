import pb from '@/lib/pocketbase/client'

export interface Distribution {
  shortage_id: string
  quantity: number
}

export interface TraceabilityInfo {
  code?: string
  description?: string
  purchase_date?: string
  arrival_date?: string
  unit_price?: number
  freight?: number
}

export const distributeMaterials = (
  distributions: Distribution[],
  totalReceived: number,
  traceability?: TraceabilityInfo,
  shortageId?: string,
) =>
  pb.send('/backend/v1/materials/distribute', {
    method: 'POST',
    body: JSON.stringify({
      distributions,
      total_received: totalReceived,
      traceability,
      shortage_id: shortageId,
    }),
    headers: { 'Content-Type': 'application/json' },
  })

export interface DistributeOcItemPayload {
  oc_item_id: string
  received_quantity: number
  traceability?: TraceabilityInfo & { unit?: string }
}

export const distributeOcItemDirectToInventory = (payload: DistributeOcItemPayload) =>
  pb.send('/backend/v1/materials/distribute-oc-item', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  })

export interface DistributeOcFullPayload {
  oc_id: string
  selected_item_ids?: string[]
  reconcile_only?: boolean
}

export interface DistributeOcFullResult {
  success: boolean
  oc_id: string
  oc_number: string
  oc_status: string
  oc_marked_received: boolean
  processed_items: Array<{
    item_id: string
    code: string
    total_qty: number
    received_now: number
    distributed_ops: number
    surplus_stock: number
    final_inv_balance: number
    reconciled?: boolean
  }>
  skipped_items: Array<{
    item_id: string
    reason: string
  }>
}

export const distributeOcFull = (payload: DistributeOcFullPayload) =>
  pb.send<DistributeOcFullResult>('/backend/v1/materials/distribute-oc-full', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  })
