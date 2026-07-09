import pb from '@/lib/pocketbase/client'
import { Inventory, InventoryMovement } from '@/types'

export const getInventory = () =>
  pb.collection('inventory').getFullList<Inventory>({ sort: 'description' })

export const getInventoryItem = (id: string) => pb.collection('inventory').getOne<Inventory>(id)

export const createInventoryItem = (data: {
  code: string
  description: string
  quantity: number
  min_quantity?: number
  unit?: string
}) => pb.collection('inventory').create(data)

export const updateInventoryItem = (
  id: string,
  data: Partial<{
    code: string
    description: string
    quantity: number
    min_quantity: number
    unit: string
  }>,
) => pb.collection('inventory').update(id, data)

export const deleteInventoryItem = (id: string) => pb.collection('inventory').delete(id)

export const getMovements = () =>
  pb
    .collection('inventory_movements')
    .getFullList<InventoryMovement>({ sort: '-created', expand: 'inventory_id,user_id,order_id' })

export const getMovementsByInventory = (inventoryId: string) =>
  pb.collection('inventory_movements').getFullList<InventoryMovement>({
    filter: `inventory_id = "${inventoryId}"`,
    sort: '-created',
    expand: 'user_id,order_id',
  })

export const createMovement = (data: {
  inventory_id: string
  quantity: number
  type: 'Entrada' | 'Saída'
  reason?: string
  order_id?: string
}) =>
  pb.collection('inventory_movements').create({
    ...data,
    user_id: pb.authStore.isValid ? pb.authStore.record?.id : undefined,
  })
