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
) =>
  pb.send('/backend/v1/materials/distribute', {
    method: 'POST',
    body: JSON.stringify({ distributions, total_received: totalReceived, traceability }),
    headers: { 'Content-Type': 'application/json' },
  })
