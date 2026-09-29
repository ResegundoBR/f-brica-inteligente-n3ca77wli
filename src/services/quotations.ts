import pb from '@/lib/pocketbase/client'
import { Quotation } from '@/types'

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
export const advanceGroupToCompra = async (
  itemIds: string[],
  fallbackQuotation?: Quotation | null,
) => {
  for (const id of itemIds) {
    let quotationToUse = fallbackQuotation || null
    if (!quotationToUse) {
      try {
        quotationToUse = await pb
          .collection('quotations')
          .getFirstListItem<Quotation>(`material_shortage_id = "${id}" && selected = true`)
      } catch {
        // Sem cotação individual selecionada
      }
    }

    if (quotationToUse) {
      const expectedDate =
        quotationToUse.delivery_days && quotationToUse.delivery_days > 0
          ? new Date(Date.now() + quotationToUse.delivery_days * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0]
          : undefined
      await pb.collection('material_shortages').update(id, {
        status: 'Compra',
        supplier: quotationToUse.supplier,
        unit_price: quotationToUse.price,
        purchase_date: new Date().toISOString().split('T')[0],
        ...(expectedDate && { expected_date: expectedDate }),
      })
    } else {
      await pb.collection('material_shortages').update(id, {
        status: 'Compra',
        purchase_date: new Date().toISOString().split('T')[0],
      })
    }
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
  surplusShortageId?: string
}

/**
 * Avança o lote de OPs selecionadas para Compras mantendo as quantidades originais intactas.
 * Se a quantidade real informada for maior que a solicitada (ex.: 19 vs 10 un), registra o excedente (ex.: 9 un)
 * como "Compra para estoque" do componente — registro próprio sem vínculo a OP (order_id: null/undefined),
 * com fornecedor, data, quem comprou e preço proporcional da cotação selecionada.
 * Na etapa de recebimento, essa solicitação de estoque geral é recebida normalmente ou distribuída,
 * ingressando no saldo disponível de estoque (inventory) e visível a reservas/estoque mínimo.
 * Quando a quantidade real = solicitada, nenhum excedente é gerado.
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

  // 1. Avançar todas as solicitações selecionadas mantendo quantidades originais intactas
  await advanceGroupToCompra(itemIds, selectedQuotation)

  // 2. Calcular excedente de compra
  const surplus = Math.max(0, Number(actualPurchaseQty || 0) - Number(requestedBatchQty || 0))

  let surplusShortageId: string | undefined = undefined

  // 3. Se houver excedente (> 0), registrar a "Compra para estoque"
  if (surplus > 0) {
    const today = new Date().toISOString().split('T')[0]
    const currentUserId = pb.authStore.record?.id || undefined

    const expectedDate =
      selectedQuotation?.delivery_days && selectedQuotation.delivery_days > 0
        ? new Date(Date.now() + selectedQuotation.delivery_days * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0]
        : undefined

    const unitPrice =
      selectedQuotation?.price && selectedQuotation.price > 0 ? selectedQuotation.price : undefined

    const shortagePayload: Record<string, any> = {
      description: componentDescription,
      code: componentCode ? componentCode.trim() : undefined,
      quantity: surplus,
      sector: sector || 'Suprimentos',
      status: 'Compra',
      priority: 'Sem pressa',
      request_type: 'Materiais',
      purchase_date: today,
      supplier: selectedQuotation?.supplier || undefined,
      unit_price: unitPrice,
      requested_by: currentUserId,
      observation: `Compra para estoque (excedente de lote consolidado: ${actualPurchaseQty} un compradas − ${requestedBatchQty} un solicitadas)`,
    }

    if (expectedDate) {
      shortagePayload.expected_date = expectedDate
    }

    try {
      const created = await pb.collection('material_shortages').create(shortagePayload)
      surplusShortageId = created.id
    } catch (err) {
      console.error('Erro ao registrar excedente como compra para estoque:', err)
      throw err
    }
  }

  return {
    advancedCount: itemIds.length,
    surplusQty: surplus,
    surplusShortageId,
  }
}

export const sendDirectToCompra = (
  shortageId: string,
  data?: { supplier?: string; unit_price?: number; expected_date?: string },
) => pb.collection('material_shortages').update(shortageId, { status: 'Compra', ...data })

export const updateShortageItem = (
  shortageId: string,
  data: { description?: string; quantity?: number },
) => pb.collection('material_shortages').update(shortageId, data)
