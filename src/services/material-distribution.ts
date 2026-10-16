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
