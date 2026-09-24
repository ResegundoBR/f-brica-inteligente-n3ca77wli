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

export interface UpsertMaterialShortageInput {
  order_id?: string | null
  code?: string | null
  description: string
  quantity: number
  sector: string
  status?: string
  request_type?: string
  priority?: string
  requested_by?: string | null
  observation?: string
  unit_price?: number
  expected_date?: string
  [key: string]: unknown
}

export interface UpsertMaterialShortageResult {
  record: MaterialShortage
  isNew: boolean
}

/**
 * Status considerados "EM ABERTO" para efeito de verificação de duplicidade:
 * Pendente, Cotação, Compra
 */
export const OPEN_SHORTAGE_STATUS_FILTER =
  "status = 'Pendente' || status = 'Cotação' || status = 'Compra'"

/**
 * Salva ou atualiza uma solicitação em `material_shortages` prevenindo duplicações.
 *
 * Trava anti-duplicidade:
 * Antes de criar novo registro, busca registro EM ABERTO (status Pendente/Cotação/Compra) com:
 * 1) mesmo código E mesmo order_id; ou
 * 2) código + descrição + sector quando NÃO houver order_id.
 *
 * Se existir: ATUALIZA aquele registro em vez de criar novo:
 * - Quantidade nova SUBSTITUI a anterior.
 * - Observação acumula 'Re-sinalizado em [data] por [usuário]: Q anterior → Q nova'.
 */
export async function upsertMaterialShortage(
  input: UpsertMaterialShortageInput,
  userNameOrEmail?: string,
): Promise<UpsertMaterialShortageResult> {
  const cleanCode = (input.code || '').trim()
  const cleanDesc = (input.description || '').trim()
  const cleanSector = (input.sector || '').trim()
  const orderId = input.order_id && input.order_id !== 'none' ? input.order_id : null
  const newQty = Number(input.quantity) || 0

  // 1. Montar filtro para buscar registro em aberto
  let searchFilter = ''
  if (orderId && cleanCode) {
    // Mesmo código E mesmo order_id
    searchFilter = `(${OPEN_SHORTAGE_STATUS_FILTER}) && order_id = '${orderId}' && code = '${cleanCode.replace(/'/g, "\\'")}'`
  } else if (!orderId && cleanCode && cleanDesc && cleanSector) {
    // Código + descrição + sector sem order_id
    searchFilter = `(${OPEN_SHORTAGE_STATUS_FILTER}) && (order_id = '' || order_id = null) && code = '${cleanCode.replace(/'/g, "\\'")}' && sector = '${cleanSector.replace(/'/g, "\\'")}'`
  }

  let existingRecord: MaterialShortage | null = null

  if (searchFilter) {
    try {
      const results = await pb.collection('material_shortages').getList<MaterialShortage>(1, 1, {
        filter: searchFilter,
        sort: 'created', // Mantém o mais antigo como registro principal
      })
      if (results.items.length > 0) {
        existingRecord = results.items[0]
      }
    } catch (err) {
      console.warn('Erro ao buscar duplicatas em material_shortages:', err)
    }
  }

  // Se não achou por código estrito sem order_id, tenta descrição idêntica + setor
  if (!existingRecord && !orderId && cleanDesc && cleanSector) {
    try {
      const descFilter = `(${OPEN_SHORTAGE_STATUS_FILTER}) && (order_id = '' || order_id = null) && sector = '${cleanSector.replace(/'/g, "\\'")}' && description = '${cleanDesc.replace(/'/g, "\\'")}'`
      const results = await pb.collection('material_shortages').getList<MaterialShortage>(1, 1, {
        filter: descFilter,
        sort: 'created',
      })
      if (results.items.length > 0) {
        existingRecord = results.items[0]
      }
    } catch {
      // Ignora erro de busca
    }
  }

  // 2. Se encontrou registro existente em aberto: ATUALIZAR
  if (existingRecord) {
    const prevQty = existingRecord.quantity ?? 0
    const nowStr = new Date().toLocaleDateString('pt-BR')
    const userLabel = userNameOrEmail || 'Usuário'
    const note = `Re-sinalizado em ${nowStr} por ${userLabel}: ${prevQty} → ${newQty}`

    const currentObs = existingRecord.observation || ''
    const newObs = currentObs ? `${currentObs} | ${note}` : note

    const updatePayload: Record<string, unknown> = {
      quantity: newQty,
      observation: newObs,
      sector: cleanSector || existingRecord.sector,
    }

    if (input.priority) updatePayload.priority = input.priority
    if (input.request_type) updatePayload.request_type = input.request_type
    if (input.unit_price !== undefined) updatePayload.unit_price = input.unit_price
    if (input.requested_by) updatePayload.requested_by = input.requested_by

    const updated = await pb
      .collection('material_shortages')
      .update<MaterialShortage>(existingRecord.id, updatePayload)

    return { record: updated, isNew: false }
  }

  // 3. Caso contrário: CRIAR novo registro
  const createPayload: Record<string, unknown> = {
    code: cleanCode,
    description: cleanDesc,
    quantity: newQty,
    sector: cleanSector || 'Suprimentos',
    status: input.status || 'Pendente',
    request_type: input.request_type || 'Materiais',
    priority: input.priority || 'Sem pressa',
    requested_by: input.requested_by || null,
    observation: input.observation || '',
  }

  if (orderId) {
    createPayload.order_id = orderId
  }
  if (input.unit_price !== undefined) {
    createPayload.unit_price = input.unit_price
  }
  if (input.expected_date) {
    createPayload.expected_date = input.expected_date
  }

  const created = await pb.collection('material_shortages').create<MaterialShortage>(createPayload)

  return { record: created, isNew: true }
}
