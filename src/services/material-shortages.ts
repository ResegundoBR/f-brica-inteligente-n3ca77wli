import pb from '@/lib/pocketbase/client'
import type { MaterialShortage } from '@/types'

export const getMaterialShortages = () =>
  pb.collection('material_shortages').getFullList<MaterialShortage>({
    sort: '-created',
    expand: 'order_id,order_id.product_id,requested_by',
  })

export const getMaterialShortage = (id: string) =>
  pb.collection('material_shortages').getOne<MaterialShortage>(id, {
    expand: 'order_id,requested_by',
  })

export const updateMaterialShortage = (id: string, data: Partial<MaterialShortage>) =>
  pb.collection('material_shortages').update<MaterialShortage>(id, data)
