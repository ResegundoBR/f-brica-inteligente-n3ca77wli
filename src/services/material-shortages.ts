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
 * Pendente, Cotação, Compra, Recebido_Parcial
 */
export const OPEN_SHORTAGE_STATUS_FILTER =
  "status = 'Pendente' || status = 'Cotação' || status = 'Compra' || status = 'Recebido_Parcial'"

/**
 * Trava anti-concorrência em memória (cache de promises in-flight).
 * Evita que chamadas paralelas client-side criem registros duplicados
 * dentro da mesma janela de milissegundos (~250ms).
 */
const inFlightUpserts = new Map<string, Promise<UpsertMaterialShortageResult>>()

/**
 * Salva ou atualiza uma solicitação em `material_shortages` prevenindo duplicações.
 *
 * Trava anti-duplicidade:
 * Antes de criar novo registro, busca registro EM ABERTO (status Pendente/Cotação/Compra) com:
 * 1) mesmo código E mesmo order_id; ou
 * 2) quando NÃO houver order_id: busca qualquer registro aberto do mesmo código independente
 *    de order_id (incluindo preenchido), ou código+descrição+setor.
 *
 * Se existir: ATUALIZA aquele registro em vez de criar novo:
 * - Quantidade nova SUBSTITUI a anterior (ou soma se accumulateQty).
 * - Observação acumula 'Re-sinalizado em [data] por [usuário]: Q anterior → Q nova'.
 * - Preserva/herda order_id, fornecedor, expected_date e enriquece description com (OPs: ...).
 */
export async function upsertMaterialShortage(
  input: UpsertMaterialShortageInput,
  userNameOrEmail?: string,
  options?: {
    accumulateQty?: boolean
    bypassCheck?: boolean
    bypassReason?: string
  },
): Promise<UpsertMaterialShortageResult> {
  const cleanCode = (input.code || '').trim()
  const orderId = input.order_id && input.order_id !== 'none' ? input.order_id : null
  const lockKey = `${cleanCode}:${orderId || 'no-order'}`

  // Trava anti-concorrência em memória para chamadas paralelas in-flight
  if (!options?.bypassCheck && lockKey !== ':no-order') {
    const pending = inFlightUpserts.get(lockKey)
    if (pending) {
      return pending
    }
  }

  const executionPromise = (async () => {
    return executeUpsertMaterialShortage(input, userNameOrEmail, options)
  })()

  if (!options?.bypassCheck && lockKey !== ':no-order') {
    inFlightUpserts.set(lockKey, executionPromise)
    executionPromise.finally(() => {
      inFlightUpserts.delete(lockKey)
    })
  }

  return executionPromise
}

async function executeUpsertMaterialShortage(
  input: UpsertMaterialShortageInput,
  userNameOrEmail?: string,
  options?: {
    accumulateQty?: boolean
    bypassCheck?: boolean
    bypassReason?: string
  },
): Promise<UpsertMaterialShortageResult> {
  const cleanCode = (input.code || '').trim()
  const cleanDesc = (input.description || '').trim()
  const cleanSector = (input.sector || '').trim()
  const orderId = input.order_id && input.order_id !== 'none' ? input.order_id : null
  const newQty = Number(input.quantity) || 0

  const batchId = (input.batch_id as string | undefined)?.trim() || null

  let existingRecord: MaterialShortage | null = null

  // 1. Montar filtro para buscar registro em aberto
  if (batchId && !orderId) {
    // Registro de excedente/estoque vinculado a um lote específico:
    // Garante que NUNCA nasçam dois registros de excedente para o mesmo lote
    const searchFilter = `(${OPEN_SHORTAGE_STATUS_FILTER}) && (order_id = '' || order_id = null) && batch_id = '${batchId.replace(/'/g, "\\'")}'`
    try {
      const results = await pb.collection('material_shortages').getList<MaterialShortage>(1, 1, {
        filter: searchFilter,
        sort: 'created',
        expand: 'order_id',
      })
      if (results.items.length > 0) {
        existingRecord = results.items[0]
      }
    } catch (err) {
      console.warn('Erro ao buscar duplicatas por batch_id em material_shortages:', err)
    }
  } else if (orderId && cleanCode) {
    // Mesmo código E mesmo order_id
    const searchFilter = `(${OPEN_SHORTAGE_STATUS_FILTER}) && order_id = '${orderId}' && code = '${cleanCode.replace(/'/g, "\\'")}'`
    try {
      const results = await pb.collection('material_shortages').getList<MaterialShortage>(1, 1, {
        filter: searchFilter,
        sort: 'created',
        expand: 'order_id',
      })
      if (results.items.length > 0) {
        existingRecord = results.items[0]
      }
    } catch (err) {
      console.warn('Erro ao buscar duplicatas por order_id em material_shortages:', err)
    }
  } else if (!orderId && cleanCode) {
    // ALTERAÇÃO 1 (a): Quando order_id vier vazio/nulo, buscar registro ABERTO
    // (não cancelado) do mesmo code INDEPENDENTE de order_id (qualquer valor, incluindo preenchido).
    try {
      const results = await pb.collection('material_shortages').getList<MaterialShortage>(1, 1, {
        filter: `(${OPEN_SHORTAGE_STATUS_FILTER}) && code = '${cleanCode.replace(/'/g, "\\'")}'`,
        sort: 'created',
        expand: 'order_id',
      })
      if (results.items.length > 0) {
        existingRecord = results.items[0]
      }
    } catch (err) {
      console.warn('Erro ao buscar duplicatas por code aberto em material_shortages:', err)
    }
  }

  // Se não achou por código estrito sem order_id, tenta descrição idêntica + setor
  if (!existingRecord && !orderId && cleanDesc && cleanSector) {
    try {
      const descFilter = `(${OPEN_SHORTAGE_STATUS_FILTER}) && sector = '${cleanSector.replace(/'/g, "\\'")}' && description = '${cleanDesc.replace(/'/g, "\\'")}'`
      const results = await pb.collection('material_shortages').getList<MaterialShortage>(1, 1, {
        filter: descFilter,
        sort: 'created',
        expand: 'order_id',
      })
      if (results.items.length > 0) {
        existingRecord = results.items[0]
      }
    } catch {
      // Ignora erro de busca
    }
  }

  // 2. Se encontrou registro existente em aberto: ATUALIZAR (a menos que bypassCheck seja true)
  if (existingRecord && !options?.bypassCheck) {
    const prevQty = existingRecord.quantity ?? 0
    const finalQty = options?.accumulateQty ? prevQty + newQty : newQty
    const nowStr = new Date().toLocaleDateString('pt-BR')
    const userLabel = userNameOrEmail || 'Usuário'
    const note = options?.accumulateQty
      ? `Vinculado/Somado em ${nowStr} por ${userLabel}: ${prevQty} + ${newQty} = ${finalQty}`
      : `Re-sinalizado em ${nowStr} por ${userLabel}: ${prevQty} → ${newQty}`

    const currentObs = existingRecord.observation || ''
    const newObs = currentObs ? `${currentObs} | ${note}` : note

    const updatePayload: Record<string, unknown> = {
      quantity: finalQty,
      observation: newObs,
      sector: cleanSector || existingRecord.sector,
    }

    // ALTERAÇÃO 1 (a): Preservar/herdar order_id existente se a chamada veio sem order_id
    const inheritedOrderId = existingRecord.order_id || null
    if (inheritedOrderId && !orderId) {
      updatePayload.order_id = inheritedOrderId
    }

    // Preservar/herdar expected_date se não veio no input
    if (input.expected_date !== undefined) {
      updatePayload.expected_date = input.expected_date
    } else if (existingRecord.expected_date) {
      updatePayload.expected_date = existingRecord.expected_date
    }

    // Preservar/herdar fornecedor se não veio no input
    if (input.supplier !== undefined) {
      updatePayload.supplier = input.supplier
    } else if (existingRecord.supplier) {
      updatePayload.supplier = existingRecord.supplier
    }

    // Enriquecer description com "(OPs: ...)" usando a OP herdada/existente, se ainda não tiver
    let finalDesc = cleanDesc || existingRecord.description || ''
    const effectiveOpNumber =
      existingRecord.expand?.order_id?.op_number ||
      existingRecord.expand?.order_id?.order_number ||
      ''
    if (effectiveOpNumber && !/\(OPs?:/i.test(finalDesc)) {
      finalDesc = `${finalDesc} (OPs: ${effectiveOpNumber})`.trim()
    }
    if (finalDesc && finalDesc !== existingRecord.description) {
      updatePayload.description = finalDesc
    }

    if (input.priority) updatePayload.priority = input.priority
    if (input.request_type) updatePayload.request_type = input.request_type
    if (input.unit_price !== undefined) updatePayload.unit_price = input.unit_price
    if (input.purchase_date !== undefined) updatePayload.purchase_date = input.purchase_date
    if (input.status) updatePayload.status = input.status
    if (input.batch_id !== undefined) updatePayload.batch_id = input.batch_id
    if (input.batch_info !== undefined) updatePayload.batch_info = input.batch_info
    if (input.requested_by) updatePayload.requested_by = input.requested_by

    const updated = await pb
      .collection('material_shortages')
      .update<MaterialShortage>(existingRecord.id, updatePayload)

    return { record: updated, isNew: false }
  }

  // 3. Caso contrário: CRIAR novo registro
  let initialObs = input.observation || ''
  if (options?.bypassCheck && options?.bypassReason) {
    const bypassNote = `Criado avulso com justificativa: ${options.bypassReason}`
    initialObs = initialObs ? `${initialObs} | ${bypassNote}` : bypassNote
  }

  const createPayload: Record<string, unknown> = {
    code: cleanCode,
    description: cleanDesc,
    quantity: newQty,
    sector: cleanSector || 'Suprimentos',
    status: input.status || 'Pendente',
    request_type: input.request_type || 'Materiais',
    priority: input.priority || 'Sem pressa',
    requested_by: input.requested_by || null,
    observation: initialObs,
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
  if (input.purchase_date) {
    createPayload.purchase_date = input.purchase_date
  }
  if (input.supplier) {
    createPayload.supplier = input.supplier
  }
  if (input.batch_id) {
    createPayload.batch_id = input.batch_id
  }
  if (input.batch_info) {
    createPayload.batch_info = input.batch_info
  }

  const created = await pb.collection('material_shortages').create<MaterialShortage>(createPayload)

  return { record: created, isNew: true }
}
