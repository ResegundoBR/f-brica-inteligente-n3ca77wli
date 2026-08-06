import pb from '@/lib/pocketbase/client'
import type { OrdemCompra, OrdemCompraItem } from '@/types'

const OC_NUMBER_SEED = 38896

export const getOrdensCompra = () =>
  pb.collection('ordens_de_compra').getFullList<OrdemCompra>({
    sort: '-created',
    expand: 'supplier_id,user_id',
  })

export const getOrdemCompra = (id: string) =>
  pb.collection('ordens_de_compra').getOne<OrdemCompra>(id, { expand: 'supplier_id,user_id' })

export const getOrdemCompraItens = (ocId: string) =>
  pb.collection('ordem_compra_itens').getFullList<OrdemCompraItem>({
    filter: `oc_id = "${ocId}"`,
    sort: 'created',
  })

export const updateOrdemCompraStatus = (id: string, status: string) =>
  pb.collection('ordens_de_compra').update(id, { status })

async function generateOcNumber(): Promise<string> {
  let maxNum = OC_NUMBER_SEED - 1
  try {
    const all = await pb.collection('ordens_de_compra').getFullList({ fields: 'oc_number' })
    for (const r of all as any[]) {
      const raw = (r.oc_number || '').trim()
      if (/^\d+$/.test(raw)) {
        const num = parseInt(raw, 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    }
  } catch {
    /* ignore */
  }
  return String(maxNum + 1)
}

export const createOrdemCompra = async (data: {
  supplier: string
  supplier_id?: string
  expected_date?: string
  delivery_terms?: string
  payment_terms?: string
  delivery_type?: string
  total: number
  user_id?: string
  itens: Array<{
    description: string
    code?: string
    quantity: number
    unit_price?: number
    total?: number
    material_shortage_id?: string
  }>
}) => {
  const oc_number = await generateOcNumber()
  const oc = await pb.collection('ordens_de_compra').create<OrdemCompra>({
    oc_number,
    supplier: data.supplier,
    ...(data.supplier_id && { supplier_id: data.supplier_id }),
    status: 'Pendente',
    ...(data.expected_date && { expected_date: data.expected_date }),
    ...(data.delivery_terms && { delivery_terms: data.delivery_terms }),
    ...(data.payment_terms && { payment_terms: data.payment_terms }),
    ...(data.delivery_type && { delivery_type: data.delivery_type }),
    total: data.total,
    ...(data.user_id && { user_id: data.user_id }),
  })

  for (const item of data.itens) {
    await pb.collection('ordem_compra_itens').create({
      oc_id: oc.id,
      description: item.description,
      ...(item.code && { code: item.code }),
      quantity: item.quantity,
      ...(item.unit_price !== undefined && { unit_price: item.unit_price }),
      ...(item.total !== undefined && { total: item.total }),
      ...(item.material_shortage_id && { material_shortage_id: item.material_shortage_id }),
    })
  }

  return oc
}

export const deleteOrdemCompra = async (id: string) => {
  const itens = await getOrdemCompraItens(id)
  for (const item of itens) {
    await pb.collection('ordem_compra_itens').delete(item.id)
  }
  await pb.collection('ordens_de_compra').delete(id)
}
