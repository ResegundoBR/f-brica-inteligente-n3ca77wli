import pb from '@/lib/pocketbase/client'
import { Quotation, MaterialShortage } from '@/types'
import { upsertMaterialShortage } from './material-shortages'

export const getQuotations = () =>
  pb
    .collection('quotations')
    .getFullList<Quotation>({ sort: '-created', expand: 'material_shortage_id,quoted_by' })

export const getQuotationsByShortage = (shortageId: string) =>
  pb.collection('quotations').getFullList<Quotation>({
    filter: `material_shortage_id = "${shortageId}"`,
    sort: 'price',
    expand: 'quoted_by',
  })

export const createQuotation = (data: {
  material_shortage_id: string
  supplier: string
  price: number
  delivery_days?: number
  st_value?: number
  ipi_value?: number
  quoted_by?: string
}) => {
  const currentUserId = pb.authStore.record?.id
  return pb.collection('quotations').create({
    ...data,
    quoted_by: data.quoted_by || currentUserId || undefined,
    selected: false,
  })
}

export const selectQuotation = async (
  quotationId: string,
  shortageId: string,
  extraShortageIds?: string[],
) => {
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

  const idsToUpdate = Array.from(new Set([shortageId, ...(extraShortageIds || [])]))
  for (const sid of idsToUpdate) {
    await pb.collection('material_shortages').update(sid, {
      supplier: selected.supplier,
      unit_price: selected.price,
      ...(expectedDate && { expected_date: expectedDate }),
    })
  }

  return selected
}

export const deleteQuotation = (id: string) => pb.collection('quotations').delete(id)

export const advanceToCompra = async (shortageId: string) => {
  let selectedQuotation: Quotation | null = null
  try {
    selectedQuotation = await pb
      .collection('quotations')
      .getFirstListItem<Quotation>(`material_shortage_id = "${shortageId}" && selected = true`)
  } catch {
    // No selected quotation found — proceed with status-only update
  }

  if (selectedQuotation) {
    const expectedDate =
      selectedQuotation.delivery_days && selectedQuotation.delivery_days > 0
        ? new Date(Date.now() + selectedQuotation.delivery_days * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0]
        : undefined
    await pb.collection('material_shortages').update(shortageId, {
      status: 'Compra',
      supplier: selectedQuotation.supplier,
      unit_price: selectedQuotation.price,
      purchase_date: new Date().toISOString().split('T')[0],
      ...(expectedDate && { expected_date: expectedDate }),
    })
  } else {
    await pb.collection('material_shortages').update(shortageId, {
      status: 'Compra',
      purchase_date: new Date().toISOString().split('T')[0],
    })
  }
}

/**
 * Conclui a cotação e avança um grupo consolidado para Compras.
 * Aplica os dados da cotação vencedora (fornecedor, preço unitário, prazo/data prevista)
 * a todos os material_shortage individuais do grupo, preservando o rastreio por OP.
 */
/**
 * Conclui a cotação e avança um grupo consolidado para Compras.
 * Aplica os dados da cotação vencedora (fornecedor, preço unitário, prazo/data prevista)
 * a todos os material_shortage individuais do grupo, preservando o rastreio por OP.
 * Quando associado a um lote (batchId), vincula cada registro com seu batch_id.
 */
export const advanceGroupToCompra = async (
  itemIds: string[],
  fallbackQuotation?: Quotation | null,
  batchId?: string,
) => {
  // Se não foi passada cotação explícita, procura primeiro em qualquer item do grupo por uma cotação selecionada
  let resolvedQuotation = fallbackQuotation || null
  if (!resolvedQuotation) {
    for (const id of itemIds) {
      try {
        const found = await pb
          .collection('quotations')
          .getFirstListItem<Quotation>(`material_shortage_id = "${id}" && selected = true`)
        if (found) {
          resolvedQuotation = found
          break
        }
      } catch {
        // Continua procurando
      }
    }
  }

  for (const id of itemIds) {
    let quotationToUse = resolvedQuotation
    if (!quotationToUse) {
      try {
        quotationToUse = await pb
          .collection('quotations')
          .getFirstListItem<Quotation>(`material_shortage_id = "${id}"`)
      } catch {
        // Sem cotação
      }
    }

    const payload: Record<string, any> = {
      status: 'Compra',
      purchase_date: new Date().toISOString().split('T')[0],
    }

    if (batchId) {
      payload.batch_id = batchId
    }

    if (quotationToUse) {
      const expectedDate =
        quotationToUse.delivery_days && quotationToUse.delivery_days > 0
          ? new Date(Date.now() + quotationToUse.delivery_days * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0]
          : undefined

      payload.supplier = quotationToUse.supplier
      payload.unit_price = quotationToUse.price
      if (expectedDate) {
        payload.expected_date = expectedDate
      }
    }

    await pb.collection('material_shortages').update(id, payload)
  }
}

export interface GroupPurchaseWithSurplusParams {
  itemIds: string[]
  actualPurchaseQty: number
  requestedBatchQty: number
  componentCode?: string
  componentDescription: string
  selectedQuotation?: Quotation | null
  sector?: string
}

export interface GroupPurchaseWithSurplusResult {
  advancedCount: number
  surplusQty: number
  residualQty?: number
  surplusShortageId?: string
  batchId?: string
}

/**
 * Realiza split de uma solicitação de material_shortage quando a quantidade comprada for MENOR
 * que a solicitada:
 * - O registro DESMEMBRADO para compra avança com status 'Compra', quantidade comprada e dados da cotação.
 * - O registro ORIGINAL permanece em aberto com status 'Cotação', mantendo a quantidade original (ou saldo restante),
 *   saldo = solicitado − comprado, preservando exatamente order_id (OPs de origem), code, description,
 *   sector, priority, request_type, adicionando no histórico/observação:
 *   "Saldo residual de compra: X compradas de Y solicitadas em [data]".
 */
export const splitShortageForPartialPurchase = async (
  shortageId: string,
  purchasedQty: number,
  quotationToUse?: Quotation | null,
  batchId?: string,
): Promise<{ purchasedShortage: MaterialShortage; residualShortage: MaterialShortage }> => {
  const original = await pb.collection('material_shortages').getOne<MaterialShortage>(shortageId)
  const originalQty = Number(original.quantity) || 0
  const cleanPurchasedQty = Math.max(0, Number(purchasedQty) || 0)
  const residualQty = Math.max(0, originalQty - cleanPurchasedQty)
  const todayPt = new Date().toLocaleDateString('pt-BR')
  const todayIso = new Date().toISOString().split('T')[0]

  const expectedDate =
    quotationToUse?.delivery_days && quotationToUse.delivery_days > 0
      ? new Date(Date.now() + quotationToUse.delivery_days * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0]
      : original.expected_date

  // 1. Criar novo registro desmembrado para a COMPRA (avança para Compra)
  const purchasedPayload: Record<string, unknown> = {
    order_id: original.order_id || null,
    code: original.code,
    description: original.description,
    quantity: cleanPurchasedQty,
    sector: original.sector,
    status: 'Compra',
    request_type: original.request_type,
    priority: original.priority,
    requested_by: original.requested_by || null,
    supplier: quotationToUse?.supplier || original.supplier,
    unit_price: quotationToUse?.price ?? original.unit_price,
    purchase_date: todayIso,
    expected_date: expectedDate,
    observation: [
      original.observation,
      `Compra parcial de ${cleanPurchasedQty} un (de ${originalQty} un solicitadas) em ${todayPt}`,
    ]
      .filter(Boolean)
      .join(' | '),
  }

  if (batchId) {
    purchasedPayload.batch_id = batchId
  }

  const purchasedShortage = await pb
    .collection('material_shortages')
    .create<MaterialShortage>(purchasedPayload)

  // Se havia cotação selecionada no original, replicar cotação para o novo item comprado
  if (quotationToUse) {
    try {
      await pb.collection('quotations').create({
        material_shortage_id: purchasedShortage.id,
        supplier: quotationToUse.supplier,
        price: quotationToUse.price,
        delivery_days: quotationToUse.delivery_days,
        st_value: quotationToUse.st_value,
        ipi_value: quotationToUse.ipi_value,
        quoted_by: quotationToUse.quoted_by,
        selected: true,
      })
    } catch {
      // Ignora erro ao clonar cotação
    }
  }

  // 2. Atualizar registro ORIGINAL mantendo status 'Cotação' e saldo residual
  const residualNote = `Saldo residual de compra: ${cleanPurchasedQty} compradas de ${originalQty} solicitadas em ${todayPt}`
  const updatedObs = original.observation
    ? `${original.observation} | ${residualNote}`
    : residualNote

  const residualPayload: Record<string, unknown> = {
    status: 'Cotação',
    quantity: residualQty,
    observation: updatedObs,
  }

  const updatedOriginal = await pb
    .collection('material_shortages')
    .update<MaterialShortage>(shortageId, residualPayload)

  return {
    purchasedShortage,
    residualShortage: updatedOriginal,
  }
}

/**
 * Distribui uma compra parcial (purchasedTotal < requestedTotal) entre os itens do lote,
 * aplicando split proporcional ou sequencial:
 * - Registros com alocação > 0 são desmembrados (split) e avançados para 'Compra'.
 * - O saldo residual de cada registro permanece em aberto com status 'Cotação'.
 */
export const advanceGroupWithDeficitSplit = async (
  itemIds: string[],
  actualPurchaseQty: number,
  quotationToUse?: Quotation | null,
  batchId?: string,
): Promise<{ advancedCount: number; residualCount: number }> => {
  const shortages = await Promise.all(
    itemIds.map((id) => pb.collection('material_shortages').getOne<MaterialShortage>(id)),
  )

  let remainingToAllocate = actualPurchaseQty
  let advancedCount = 0
  let residualCount = 0

  for (const item of shortages) {
    const itemQty = Number(item.quantity) || 0
    if (remainingToAllocate <= 0) {
      // Todo o registro permanece em Cotação
      residualCount++
      continue
    }

    if (remainingToAllocate >= itemQty) {
      // Atende este item integralmente
      await advanceGroupToCompra([item.id], quotationToUse, batchId)
      remainingToAllocate -= itemQty
      advancedCount++
    } else {
      // Atende parcialmente: split do item
      const purchasedPortion = remainingToAllocate
      await splitShortageForPartialPurchase(item.id, purchasedPortion, quotationToUse, batchId)
      remainingToAllocate = 0
      advancedCount++
      residualCount++
    }
  }

  return { advancedCount, residualCount }
}

/**
 * Avança o lote de OPs selecionadas para Compras mantendo as quantidades originais intactas.
 * Cria ou vincula um identificador de lote (batch_id) compartilhado entre as OPs e o excedente.
 * Se a quantidade real informada for maior que a solicitada (ex.: 19 vs 10 un), registra o excedente (ex.: 9 un)
 * como "Compra para estoque" do componente — registro próprio sem vínculo a OP (order_id: null/undefined),
 * com fornecedor, data, quem comprou e preço proporcional da cotação selecionada.
 * Se a quantidade for MENOR que a solicitada, realiza SPLIT das solicitações mantendo o saldo residual
 * em aberto em 'Cotação'.
 * A cotação selecionada é replicada para TODAS as OPs do lote e para o excedente, sem restrições.
 */
export const advanceGroupToCompraWithSurplus = async ({
  itemIds,
  actualPurchaseQty,
  requestedBatchQty,
  componentCode,
  componentDescription,
  selectedQuotation,
  sector = 'Suprimentos',
}: GroupPurchaseWithSurplusParams): Promise<GroupPurchaseWithSurplusResult> => {
  if (itemIds.length === 0) {
    return { advancedCount: 0, surplusQty: 0 }
  }

  // 0. Verificar se os itens já pertencem a um lote existente (recompra)
  let resolvedBatchId: string | undefined = undefined
  try {
    const existingShortages = await Promise.all(
      itemIds.map((id) =>
        pb
          .collection('material_shortages')
          .getOne<MaterialShortage>(id)
          .catch(() => null),
      ),
    )
    const existingBatchId = existingShortages.find((s) => s && s.batch_id)?.batch_id
    if (existingBatchId) {
      resolvedBatchId = existingBatchId
    }
  } catch {
    // prossegue gerando novo se falhar
  }

  // Gera um batchId único para rastrear este lote consolidado na página Compras e Recebimento caso não exista
  const batchId =
    resolvedBatchId || `lote_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

  // 1. Resolver cotação selecionada para aplicar a todo o lote
  let quotationToUse = selectedQuotation || null
  if (!quotationToUse) {
    for (const id of itemIds) {
      try {
        const found = await pb
          .collection('quotations')
          .getFirstListItem<Quotation>(`material_shortage_id = "${id}" && selected = true`)
        if (found) {
          quotationToUse = found
          break
        }
      } catch {
        // Continua
      }
    }
  }

  // 2. SE COMPRA MENOR QUE O SOLICITADO: SPLIT mantendo saldo residual em Cotações
  const cleanActualQty = Number(actualPurchaseQty || 0)
  const cleanRequestedQty = Number(requestedBatchQty || 0)

  if (cleanActualQty < cleanRequestedQty && cleanActualQty > 0) {
    const splitRes = await advanceGroupWithDeficitSplit(
      itemIds,
      cleanActualQty,
      quotationToUse,
      batchId,
    )
    return {
      advancedCount: splitRes.advancedCount,
      surplusQty: 0,
      residualQty: cleanRequestedQty - cleanActualQty,
      batchId,
    }
  }

  // 3. Avançar todas as solicitações selecionadas mantendo quantidades originais intactas e atribuindo batch_id
  await advanceGroupToCompra(itemIds, quotationToUse, batchId)

  // 4. Calcular excedente de compra
  const surplus = Math.max(0, cleanActualQty - cleanRequestedQty)

  let surplusShortageId: string | undefined = undefined

  const today = new Date().toISOString().split('T')[0]
  const currentUserId = pb.authStore.record?.id || undefined

  const expectedDate =
    quotationToUse?.delivery_days && quotationToUse.delivery_days > 0
      ? new Date(Date.now() + quotationToUse.delivery_days * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0]
      : undefined

  const unitPrice =
    quotationToUse?.price && quotationToUse.price > 0 ? quotationToUse.price : undefined

  // 4. RECOMPRA SUBSTITUI / TRAVA ANTI-DUPLICIDADE:
  // Se já existirem registros de excedente para este lote ("Compra para estoque"),
  // cancelar os antigos excedentes redundantes (ou se surplus == 0, cancelar todos)
  try {
    const existingSurplusList = await pb
      .collection('material_shortages')
      .getFullList<MaterialShortage>({
        filter: `batch_id = "${batchId}" && (order_id = "" || order_id = null) && (status = "Compra" || status = "Pendente" || status = "Cotação")`,
      })
    for (const oldSurplus of existingSurplusList) {
      if (surplus === 0) {
        // Se a recompra é exata (sem excedente), cancela os excedentes antigos
        await pb.collection('material_shortages').update(oldSurplus.id, {
          status: 'Cancelado',
          observation:
            `${oldSurplus.observation || ''} | Cancelado por recompra do lote sem excedente`.trim(),
        })
      }
    }
  } catch (err) {
    console.warn('Erro ao verificar/limpar excedentes antigos de recompra:', err)
  }

  // 5. Se houver excedente (> 0), registrar ou atualizar a "Compra para estoque" usando a trava anti-duplicidade (upsertMaterialShortage)
  if (surplus > 0) {
    try {
      const upsertRes = await upsertMaterialShortage(
        {
          description: componentDescription,
          code: componentCode ? componentCode.trim() : undefined,
          quantity: surplus,
          sector: sector || 'Suprimentos',
          status: 'Compra',
          priority: 'Sem pressa',
          request_type: 'Materiais',
          purchase_date: today,
          supplier: quotationToUse?.supplier || undefined,
          unit_price: unitPrice,
          expected_date: expectedDate,
          requested_by: currentUserId,
          batch_id: batchId,
          observation: `Compra para estoque (excedente de lote consolidado: ${actualPurchaseQty} un compradas − ${requestedBatchQty} un solicitadas)`,
        },
        pb.authStore.record?.name || pb.authStore.record?.email || 'Sistema',
      )
      surplusShortageId = upsertRes.record.id

      // Se havia múltiplos excedentes antigos em aberto do mesmo lote, garante o cancelamento de qualquer outro
      try {
        const otherSurpluses = await pb
          .collection('material_shortages')
          .getFullList<MaterialShortage>({
            filter: `batch_id = "${batchId}" && (order_id = "" || order_id = null) && id != "${surplusShortageId}" && (status = "Compra" || status = "Pendente" || status = "Cotação")`,
          })
        for (const extra of otherSurpluses) {
          await pb.collection('material_shortages').update(extra.id, {
            status: 'Cancelado',
            observation:
              `${extra.observation || ''} | Cancelado por substituição em recompra de lote`.trim(),
          })
        }
      } catch {
        /* intentionally ignored */
      }
    } catch (err) {
      console.error('Erro ao registrar excedente como compra para estoque:', err)
      throw err
    }
  }

  // 6. Atualizar metadata batch_info na primeira solicitação (representante do lote)
  // para permitir reconstrução fiel da linha consolidada na tela de Compras
  try {
    const leadItemId = itemIds[0]
    await pb.collection('material_shortages').update(leadItemId, {
      batch_info: {
        is_batch_parent: true,
        actual_quantity: actualPurchaseQty,
        requested_total: requestedBatchQty,
        surplus_quantity: surplus,
        sub_shortage_ids: itemIds,
        surplus_shortage_id: surplusShortageId,
        selected_quotation_id: quotationToUse?.id,
        supplier: quotationToUse?.supplier,
        unit_price: quotationToUse?.price,
        delivery_days: quotationToUse?.delivery_days,
        expected_date: expectedDate,
      },
    })
  } catch (metaErr) {
    console.warn('Não foi possível gravar batch_info complementar no líder do lote:', metaErr)
  }

  return {
    advancedCount: itemIds.length,
    surplusQty: surplus,
    surplusShortageId,
    batchId,
  }
}

export const sendDirectToCompra = (
  shortageId: string,
  data?: { supplier?: string; unit_price?: number; expected_date?: string; purchase_date?: string },
) =>
  pb.collection('material_shortages').update(shortageId, {
    status: 'Compra',
    purchase_date: data?.purchase_date || new Date().toISOString().split('T')[0],
    ...data,
  })

export const updateShortageItem = (
  shortageId: string,
  data: { description?: string; quantity?: number },
) => pb.collection('material_shortages').update(shortageId, data)
