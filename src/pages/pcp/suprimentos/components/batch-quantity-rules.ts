import { MaterialShortage } from '@/types'

export interface BatchMatesResolution {
  isBatch: boolean
  batchId?: string
  allBatchItems: MaterialShortage[]
  opItems: MaterialShortage[]
  surplusItem?: MaterialShortage
  parent?: MaterialShortage
  totalOpDemand: number
  totalReceived: number
  currentBatchTotal: number
}

/**
 * Identifica e organiza os membros de um lote a partir de um item e do pool de shortages.
 */
export function resolveBatchMembers(
  item: MaterialShortage | null,
  allShortages: MaterialShortage[] = [],
): BatchMatesResolution {
  if (!item) {
    return {
      isBatch: false,
      allBatchItems: [],
      opItems: [],
      totalOpDemand: 0,
      totalReceived: 0,
      currentBatchTotal: 0,
    }
  }

  const batchId = item.batch_id || item.batch_info?.batch_id
  const subIds = item.batch_info?.sub_shortage_ids || []
  const isBatch = Boolean(batchId || subIds.length > 0)

  if (!isBatch) {
    const received = Number(item.received_quantity) || 0
    const qty = Number(item.quantity) || 0
    return {
      isBatch: false,
      allBatchItems: [item],
      opItems: item.order_id ? [item] : [],
      surplusItem: !item.order_id ? item : undefined,
      parent: item,
      totalOpDemand: item.order_id ? qty : 0,
      totalReceived: received,
      currentBatchTotal: qty,
    }
  }

  // Coleta todos os itens do lote no pool (ou pelo menos o item atual)
  const itemsMap = new Map<string, MaterialShortage>()
  itemsMap.set(item.id, item)

  for (const s of allShortages) {
    if (batchId && (s.batch_id === batchId || s.batch_info?.batch_id === batchId)) {
      itemsMap.set(s.id, s)
    } else if (subIds.includes(s.id)) {
      itemsMap.set(s.id, s)
    }
  }

  // Filtra pelo mesmo código (se houver), ou pela descrição compatível para evitar contaminação
  const targetCode = item.code?.trim().toLowerCase()
  let list = Array.from(itemsMap.values())
  if (targetCode) {
    list = list.filter((it) => !it.code || it.code.trim().toLowerCase() === targetCode)
  }

  const parent = list.find((it) => it.batch_info?.is_batch_parent) || item

  // Localiza excedente oficial
  const surplusCandidates = list.filter(
    (it) =>
      !it.order_id &&
      (it.observation?.includes('Compra para estoque') ||
        it.id === parent.batch_info?.surplus_shortage_id),
  )
  const surplusItem =
    surplusCandidates.find((it) => it.id === parent.batch_info?.surplus_shortage_id) ||
    surplusCandidates[surplusCandidates.length - 1]

  const opItems = list.filter((it) => it.id !== surplusItem?.id && Boolean(it.order_id))

  const totalOpDemand =
    parent.batch_info?.requested_total != null
      ? Number(parent.batch_info.requested_total)
      : opItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0)

  const surplusQty = surplusItem
    ? Number(surplusItem.quantity) || 0
    : Number(parent.batch_info?.surplus_quantity) || 0

  const currentBatchTotal =
    parent.batch_info?.actual_quantity != null
      ? Number(parent.batch_info.actual_quantity)
      : opItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0) + surplusQty

  const totalReceived = list.reduce((acc, it) => acc + (Number(it.received_quantity) || 0), 0)

  return {
    isBatch: true,
    batchId,
    allBatchItems: list,
    opItems,
    surplusItem,
    parent,
    totalOpDemand,
    totalReceived,
    currentBatchTotal,
  }
}

export interface BatchQuantityPlanItem {
  id: string
  isOp: boolean
  opLabel?: string
  previousQty: number
  newQty: number
  isDirectTarget: boolean
  isChanged: boolean
}

export interface BatchQuantityPlan {
  totalNewQuantity: number
  totalOpDemand: number
  totalAlreadyReceived: number
  itemMinReceived: number
  surplusQty: number
  residualQty: number
  isBelowReceived: boolean
  isAboveSensibleDemand: boolean
  validationError?: string
  needsOpConfirmation: boolean
  affectedOpMembers: Array<{
    id: string
    opLabel: string
    oldQty: number
    newQty: number
  }>
  itemsToUpdate: BatchQuantityPlanItem[]
}

/**
 * Calcula o plano de redistribuição da quantidade ao salvar uma alteração no modal de Compra.
 * Regra:
 * (1) em linha de lote, editar quantidade NÃO infla a falta de uma única OP. Ajusta o total de forma coerente,
 * mantendo as quantidades dos demais membros intactas, e aloca no excedente se for aumento de compra além da demanda das OPs.
 * Se a edição alterar o valor de um registro de OP, sinaliza needsOpConfirmation com o nome da OP e valores.
 * (2) Valida limites: novo valor não pode ser menor que o já recebido, nem exceder o que faz sentido para a demanda.
 */
export function calculateBatchQuantityPlan(params: {
  item: MaterialShortage
  targetNewQuantity: number
  allShortages?: MaterialShortage[]
}): BatchQuantityPlan {
  const { item, targetNewQuantity, allShortages = [] } = params
  const batchInfo = resolveBatchMembers(item, allShortages)

  const targetQty = Math.max(0, Number(targetNewQuantity) || 0)
  const itemReceived = Number(item.received_quantity) || 0
  const totalReceived = batchInfo.totalReceived

  // Limite inferior 1: não pode ser menor que o recebido
  const minRequired = batchInfo.isBatch ? Math.max(itemReceived, totalReceived) : itemReceived
  const isBelowReceived = targetQty < minRequired

  // Demanda de referência das OPs
  const opDemand = batchInfo.isBatch
    ? batchInfo.totalOpDemand
    : item.order_id
      ? Number(item.quantity) || 0
      : 0

  // Teto de demanda sensata: no contexto de compra industrial, comprar mais que 5x a demanda total das OPs
  // ou 5000 unidades a mais sem justificativa excede o que faz sentido para a demanda
  const sensibleDemandCeiling = Math.max(opDemand * 5, opDemand + 1000, 100)
  const isAboveSensibleDemand = opDemand > 0 && targetQty > sensibleDemandCeiling

  let validationError: string | undefined = undefined
  if (isBelowReceived) {
    validationError = `A quantidade final (${targetQty} un) não pode ser menor que o total já recebido deste registro/lote (${minRequired} un).`
  } else if (isAboveSensibleDemand) {
    validationError = `A quantidade informada (${targetQty} un) excede amplamente o que faz sentido para a demanda do lote (${opDemand} un solicitadas pelas OPs). Verifique o valor digitado.`
  }

  // Caso não seja lote: edição direta no item único
  if (!batchInfo.isBatch) {
    const isOp = Boolean(item.order_id)
    const opLabel =
      item.expand?.order_id?.op_number ||
      item.expand?.order_id?.order_number ||
      (isOp ? 'OP vinculada' : undefined)
    const prevQty = Number(item.quantity) || 0
    const changed = targetQty !== prevQty
    const needsConfirm = isOp && changed

    return {
      totalNewQuantity: targetQty,
      totalOpDemand: isOp ? targetQty : 0,
      totalAlreadyReceived: itemReceived,
      itemMinReceived: itemReceived,
      surplusQty: isOp ? 0 : targetQty,
      residualQty: 0,
      isBelowReceived,
      isAboveSensibleDemand,
      validationError,
      needsOpConfirmation: needsConfirm,
      affectedOpMembers:
        needsConfirm && opLabel
          ? [{ id: item.id, opLabel, oldQty: prevQty, newQty: targetQty }]
          : [],
      itemsToUpdate: [
        {
          id: item.id,
          isOp,
          opLabel,
          previousQty: prevQty,
          newQty: targetQty,
          isDirectTarget: true,
          isChanged: changed,
        },
      ],
    }
  }

  // --- Caso pertença a um lote ---
  const isItemAnOp = Boolean(item.order_id)
  const currentSurplusItem = batchInfo.surplusItem
  const opMembers = batchInfo.opItems

  const itemsToUpdate: BatchQuantityPlanItem[] = []
  const affectedOpMembers: Array<{
    id: string
    opLabel: string
    oldQty: number
    newQty: number
  }> = []

  let surplusQty = 0
  let residualQty = 0

  if (isItemAnOp) {
    // Caso 1: Usuário abriu um registro que pertence a uma OP específica
    // A edição desse item deve:
    // a) Atualizar este item para targetQty (exige confirmação explícita da OP)
    // b) Manter intactos os outros membros de OP
    // c) Recalcular o excedente do lote se houver surplusItem existente
    const prevQty = Number(item.quantity) || 0
    const opLabel =
      item.expand?.order_id?.op_number ||
      item.expand?.order_id?.order_number ||
      `OP (ID ${item.id.slice(0, 6)})`

    if (targetQty !== prevQty) {
      affectedOpMembers.push({
        id: item.id,
        opLabel,
        oldQty: prevQty,
        newQty: targetQty,
      })
    }

    itemsToUpdate.push({
      id: item.id,
      isOp: true,
      opLabel,
      previousQty: prevQty,
      newQty: targetQty,
      isDirectTarget: true,
      isChanged: targetQty !== prevQty,
    })

    // Membros de outras OPs permanecem com suas quantidades intactas
    for (const otherOp of opMembers) {
      if (otherOp.id === item.id) continue
      const oQty = Number(otherOp.quantity) || 0
      itemsToUpdate.push({
        id: otherOp.id,
        isOp: true,
        opLabel:
          otherOp.expand?.order_id?.op_number ||
          otherOp.expand?.order_id?.order_number ||
          'OP vinculada',
        previousQty: oQty,
        newQty: oQty,
        isDirectTarget: false,
        isChanged: false,
      })
    }

    // Se existe registro de excedente, mantém seu valor ou recalcula
    if (currentSurplusItem) {
      const sQty = Number(currentSurplusItem.quantity) || 0
      surplusQty = sQty
      itemsToUpdate.push({
        id: currentSurplusItem.id,
        isOp: false,
        previousQty: sQty,
        newQty: sQty,
        isDirectTarget: false,
        isChanged: false,
      })
    }

    const newTotalBatch = itemsToUpdate.reduce((sum, it) => sum + it.newQty, 0)

    return {
      totalNewQuantity: newTotalBatch,
      totalOpDemand: opDemand,
      totalAlreadyReceived: totalReceived,
      itemMinReceived: itemReceived,
      surplusQty,
      residualQty,
      isBelowReceived,
      isAboveSensibleDemand,
      validationError,
      needsOpConfirmation: affectedOpMembers.length > 0,
      affectedOpMembers,
      itemsToUpdate,
    }
  }

  // Caso 2: Usuário abriu o representante do lote (ou linha de excedente de estoque sem OP)
  // O valor digitado (ex.: 50 un) representa a QUANTIDADE TOTAL DE COMPRA DO LOTE!
  // NÃO pode inflar um membro de OP específico (o bug da OP 488 de 4 para 50).
  // As OPs permanecem com suas demandas intactas! O excedente absorve a diferença (50 − 21 = 29 para estoque).
  const sumOtherOps = opMembers.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0)

  // As OPs NUNCA têm suas faltas alteradas aqui
  for (const opItem of opMembers) {
    const oQty = Number(opItem.quantity) || 0
    itemsToUpdate.push({
      id: opItem.id,
      isOp: true,
      opLabel:
        opItem.expand?.order_id?.op_number ||
        opItem.expand?.order_id?.order_number ||
        'OP vinculada',
      previousQty: oQty,
      newQty: oQty,
      isDirectTarget: false,
      isChanged: false,
    })
  }

  if (targetQty >= sumOtherOps) {
    // Aumento ou compra com excedente:
    // O total atende 100% das OPs; o restante é excedente para estoque
    surplusQty = targetQty - sumOtherOps
    residualQty = 0

    // Se o item editado é o registro de estoque: atualiza ele diretamente
    if (currentSurplusItem) {
      const prevSurplus = Number(currentSurplusItem.quantity) || 0
      itemsToUpdate.push({
        id: currentSurplusItem.id,
        isOp: false,
        previousQty: prevSurplus,
        newQty: surplusQty,
        isDirectTarget: currentSurplusItem.id === item.id,
        isChanged: prevSurplus !== surplusQty,
      })
    } else if (!item.order_id) {
      // O próprio item é sem OP
      const prevQty = Number(item.quantity) || 0
      itemsToUpdate.push({
        id: item.id,
        isOp: false,
        previousQty: prevQty,
        newQty: surplusQty,
        isDirectTarget: true,
        isChanged: prevQty !== surplusQty,
      })
    }
  } else {
    // Compra menor que a demanda das OPs: saldo residual para Cotações (regra 0.0.398)
    surplusQty = 0
    residualQty = sumOtherOps - targetQty
  }

  return {
    totalNewQuantity: targetQty,
    totalOpDemand: sumOtherOps,
    totalAlreadyReceived: totalReceived,
    itemMinReceived: itemReceived,
    surplusQty,
    residualQty,
    isBelowReceived,
    isAboveSensibleDemand,
    validationError,
    needsOpConfirmation: affectedOpMembers.length > 0,
    affectedOpMembers,
    itemsToUpdate,
  }
}
