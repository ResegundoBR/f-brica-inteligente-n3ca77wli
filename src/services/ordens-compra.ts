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

export function sanitizeOcPayload<T extends Record<string, any>>(obj: T): Partial<T> {
  const cleaned: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    if (typeof v === 'string') {
      const trimmed = v.trim()
      if (trimmed === '') continue
      cleaned[k] = trimmed
    } else {
      cleaned[k] = v
    }
  }
  return cleaned as Partial<T>
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
    st_value?: number
    ipi_value?: number
    total?: number
    material_shortage_id?: string
  }>
}) => {
  const oc_number = await generateOcNumber()
  const currentUserId = pb.authStore.record?.id
  const userId = data.user_id || currentUserId || undefined

  const ocPayload = sanitizeOcPayload({
    oc_number,
    supplier: data.supplier,
    supplier_id: data.supplier_id,
    status: 'Pendente',
    expected_date: data.expected_date,
    delivery_terms: data.delivery_terms,
    payment_terms: data.payment_terms,
    delivery_type: data.delivery_type || 'Entrega',
    total: data.total,
    user_id: userId,
  })

  const oc = await pb.collection('ordens_de_compra').create<OrdemCompra>(ocPayload)

  for (const item of data.itens) {
    const itemPayload = sanitizeOcPayload({
      oc_id: oc.id,
      description: item.description,
      code: item.code,
      quantity: item.quantity,
      unit_price: item.unit_price,
      st_value: item.st_value,
      ipi_value: item.ipi_value,
      total: item.total,
      material_shortage_id: item.material_shortage_id,
    })
    await pb.collection('ordem_compra_itens').create(itemPayload)
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
