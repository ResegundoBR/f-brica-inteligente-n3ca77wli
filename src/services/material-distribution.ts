import pb from '@/lib/pocketbase/client'

export interface Distribution {
  shortage_id: string
  quantity: number
}

export interface SurplusInfo {
  code: string
  description: string
  quantity: number
}

export const distributeMaterials = (distributions: Distribution[], surplus?: SurplusInfo) =>
  pb.send('/backend/v1/materials/distribute', {
    method: 'POST',
    body: JSON.stringify({ distributions, surplus }),
    headers: { 'Content-Type': 'application/json' },
  })
