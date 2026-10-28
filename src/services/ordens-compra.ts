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

export interface UpdateOrdemCompraItemInput {
  id?: string
  description: string
  code?: string
  quantity: number
  unit_price?: number
  st_value?: number
  ipi_value?: number
  total?: number
  material_shortage_id?: string
}

/**
 * Calcula o total de um item de Ordem de Compra:
 * total = quantity * unit_price + st_value + ipi_value
 */
export function calculateOcItemTotal(item: {
  quantity: number
  unit_price?: number
  st_value?: number
  ipi_value?: number
  total?: number
}): number {
  if (item.total !== undefined && item.total !== null && !isNaN(Number(item.total))) {
    return Number(item.total)
  }
  const q = Number(item.quantity) || 0
  const p = Number(item.unit_price) || 0
  const st = Number(item.st_value) || 0
  const ipi = Number(item.ipi_value) || 0
  return q * p + st + ipi
}

/**
 * Calcula o total geral de uma Ordem de Compra a partir dos seus itens.
 */
export function calculateOcGrandTotal(
  itens: Array<{
    quantity: number
    unit_price?: number
    st_value?: number
    ipi_value?: number
    total?: number
  }>,
): number {
  return itens.reduce((sum, item) => sum + calculateOcItemTotal(item), 0)
}

export interface UpdateOrdemCompraInput {
  supplier: string
  supplier_id?: string
  expected_date?: string
  delivery_terms?: string
  payment_terms?: string
  delivery_type?: string
  total: number
  itens: UpdateOrdemCompraItemInput[]
}

export const updateOrdemCompra = async (
  ocId: string,
  data: UpdateOrdemCompraInput,
  userNameOrEmail?: string,
) => {
  // 1. Carregar itens atuais da OC no banco
  const existingItems = await getOrdemCompraItens(ocId)
  const existingMap = new Map<string, OrdemCompraItem>()
  for (const it of existingItems) {
    existingMap.set(it.id, it)
  }

  // 2. Atualizar cabeçalho da OC
  // Usar null/'' explícito para campos que possam ter sido limpos
  const ocPayload = sanitizeOcPayload({
    supplier: data.supplier,
    supplier_id: data.supplier_id || null,
    expected_date: data.expected_date || null,
    delivery_terms: data.delivery_terms || null,
    payment_terms: data.payment_terms || null,
    delivery_type: data.delivery_type || 'Entrega',
    total: data.total,
  })

  // Se o usuário limpou supplier_id, expected_date, delivery_terms ou payment_terms:
  if (!data.supplier_id) (ocPayload as any).supplier_id = null
  if (!data.expected_date) (ocPayload as any).expected_date = null
  if (!data.delivery_terms) (ocPayload as any).delivery_terms = ''
  if (!data.payment_terms) (ocPayload as any).payment_terms = ''

  const updatedOc = await pb.collection('ordens_de_compra').update<OrdemCompra>(ocId, ocPayload)

  // 3. Processar itens: Criar novos, Atualizar existentes, Deletar removidos
  const submittedIds = new Set<string>()

  for (const item of data.itens) {
    const itemTotal = calculateOcItemTotal(item)

    if (item.id && existingMap.has(item.id)) {
      submittedIds.add(item.id)
      const prev = existingMap.get(item.id)!
      const itemUpdatePayload: Record<string, any> = {
        description: item.description.trim(),
        code: item.code?.trim() || '',
        quantity: item.quantity,
        unit_price: Number(item.unit_price) || 0,
        st_value: Number(item.st_value) || 0,
        ipi_value: Number(item.ipi_value) || 0,
        total: itemTotal,
      }
      if (item.material_shortage_id !== undefined) {
        itemUpdatePayload.material_shortage_id = item.material_shortage_id || null
      }

      await pb.collection('ordem_compra_itens').update(item.id, itemUpdatePayload)

      // Regra (3): Se tem material_shortage_id e a quantidade mudou, atualizar APENAS aquele material_shortage
      const shortageId = item.material_shortage_id || prev.material_shortage_id
      if (shortageId && prev.quantity !== item.quantity) {
        try {
          const shortage = await pb.collection('material_shortages').getOne<any>(shortageId)
          const nowStr = new Date().toLocaleDateString('pt-BR')
          const userLabel = userNameOrEmail || 'Usuário'
          const note = `Qtd ajustada por edição da OC ${updatedOc.oc_number} em ${nowStr} por ${userLabel}: ${prev.quantity} → ${item.quantity}`
          const curObs = shortage.observation || ''
          const newObs = curObs ? `${curObs} | ${note}` : note

          await pb.collection('material_shortages').update(shortageId, {
            quantity: item.quantity,
            observation: newObs,
          })
        } catch (shortageErr) {
          console.warn(`Não foi possível sincronizar material_shortage ${shortageId}:`, shortageErr)
        }
      }
    } else {
      // Item novo
      const itemPayload = sanitizeOcPayload({
        oc_id: ocId,
        description: item.description,
        code: item.code,
        quantity: item.quantity,
        unit_price: Number(item.unit_price) || 0,
        st_value: Number(item.st_value) || 0,
        ipi_value: Number(item.ipi_value) || 0,
        total: itemTotal,
        material_shortage_id: item.material_shortage_id,
      })
      const created = await pb.collection('ordem_compra_itens').create<OrdemCompraItem>(itemPayload)
      submittedIds.add(created.id)

      if (item.material_shortage_id) {
        try {
          const shortage = await pb
            .collection('material_shortages')
            .getOne<any>(item.material_shortage_id)
          if (shortage.quantity !== item.quantity) {
            const nowStr = new Date().toLocaleDateString('pt-BR')
            const userLabel = userNameOrEmail || 'Usuário'
            const note = `Qtd vinculada à OC ${updatedOc.oc_number} em ${nowStr} por ${userLabel}: ${shortage.quantity} → ${item.quantity}`
            const curObs = shortage.observation || ''
            const newObs = curObs ? `${curObs} | ${note}` : note
            await pb.collection('material_shortages').update(item.material_shortage_id, {
              quantity: item.quantity,
              observation: newObs,
            })
          }
        } catch (shortageErr) {
          console.warn(
            `Não foi possível sincronizar material_shortage novo ${item.material_shortage_id}:`,
            shortageErr,
          )
        }
      }
    }
  }

  // Deletar itens que não estão mais presentes
  for (const [id] of existingMap) {
    if (!submittedIds.has(id)) {
      await pb.collection('ordem_compra_itens').delete(id)
    }
  }

  return updatedOc
}

export const deleteOrdemCompra = async (id: string) => {
  const itens = await getOrdemCompraItens(id)
  for (const item of itens) {
    await pb.collection('ordem_compra_itens').delete(item.id)
  }
  await pb.collection('ordens_de_compra').delete(id)
}

/**
 * Retorna todos os itens de OC vinculados a OCs com status != 'Cancelada'
 * com expand: 'oc_id,oc_id.supplier_id'
 */
export async function getActiveOrdemCompraItens(): Promise<OrdemCompraItem[]> {
  try {
    const items = await pb.collection('ordem_compra_itens').getFullList<OrdemCompraItem>({
      filter: `oc_id.status != "Cancelada"`,
      expand: 'oc_id,oc_id.supplier_id,material_shortage_id,material_shortage_id.order_id',
      sort: 'created',
    })
    return items
  } catch (err) {
    console.warn('Erro ao carregar itens de OCs ativas:', err)
    return []
  }
}
