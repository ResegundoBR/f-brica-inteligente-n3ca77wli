import pb from '@/lib/pocketbase/client'
import { Quotation } from '@/types'

export const getQuotations = () =>
  pb
    .collection('quotations')
    .getFullList<Quotation>({ sort: '-created', expand: 'material_shortage_id' })

export const getQuotationsByShortage = (shortageId: string) =>
  pb.collection('quotations').getFullList<Quotation>({
    filter: `material_shortage_id = "${shortageId}"`,
    sort: 'price',
  })

export const createQuotation = (data: {
  material_shortage_id: string
  supplier: string
  price: number
  delivery_days?: number
}) => pb.collection('quotations').create({ ...data, selected: false })

export const selectQuotation = async (quotationId: string, shortageId: string) => {
  const all = await pb
    .collection('quotations')
    .getFullList({ filter: `material_shortage_id = "${shortageId}"` })
  for (const q of all) {
    if (q.id !== quotationId) {
      await pb.collection('quotations').update(q.id, { selected: false })
    }
  }
  await pb.collection('quotations').update(quotationId, { selected: true })
  const selected = await pb.collection('quotations').getOne<Quotation>(quotationId)

  const expectedDate =
    selected.delivery_days && selected.delivery_days > 0
      ? new Date(Date.now() + selected.delivery_days * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0]
      : undefined

  await pb.collection('material_shortages').update(shortageId, {
    supplier: selected.supplier,
    unit_price: selected.price,
    ...(expectedDate && { expected_date: expectedDate }),
  })

  return selected
}

export const deleteQuotation = (id: string) => pb.collection('quotations').delete(id)

export const advanceToCompra = (shortageId: string) =>
  pb.collection('material_shortages').update(shortageId, { status: 'Compra' })

export const sendDirectToCompra = (
  shortageId: string,
  data?: { supplier?: string; unit_price?: number; expected_date?: string },
) => pb.collection('material_shortages').update(shortageId, { status: 'Compra', ...data })

export const updateShortageItem = (
  shortageId: string,
  data: { description?: string; quantity?: number },
) => pb.collection('material_shortages').update(shortageId, data)
