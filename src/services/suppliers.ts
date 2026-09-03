import pb from '@/lib/pocketbase/client'
import type { Supplier } from '@/types'

export type { Supplier }
export interface SupplierMetrics {
  supplierId: string
  totalOrders: number
  onTimeDeliveries: number
  averageDelayDays: number
  qualityRating: number
  quotationCount: number
  purchaseCount: number
  receivedCount: number
  averageLeadTime: number | null
  history: Array<{
    type: 'quotation' | 'purchase' | 'received'
    description: string
    date: string
    details: string
  }>
}
export const getSupplierMetrics = async (_id: string): Promise<SupplierMetrics | null> => null

export const getSuppliers = () => pb.collection('suppliers').getFullList<Supplier>({ sort: 'name' })

export const getSupplier = (id: string) => pb.collection('suppliers').getOne<Supplier>(id)

export const createSupplier = (data: Partial<Supplier>) =>
  pb.collection('suppliers').create<Supplier>(data)

export const updateSupplier = (id: string, data: Partial<Supplier>) =>
  pb.collection('suppliers').update<Supplier>(id, data)

export const deleteSupplier = (id: string) => pb.collection('suppliers').delete(id)

export const searchSuppliers = (query: string) => {
  if (!query.trim()) return getSuppliers()
  return pb.collection('suppliers').getFullList<Supplier>({
    filter: `name ~ "${query}"`,
    sort: 'name',
  })
}
