import pb from '@/lib/pocketbase/client'
import type {
  RetroactiveWithdrawal,
  RetroactiveWithdrawalStatus,
  RetroactiveBomItem,
  PcpOrder,
  PcpOrderMaterial,
  InventoryMovement,
  Inventory,
} from '@/types'
import { createMovement } from './inventory'

/** Janela de elegibilidade de OPs encerradas em dias (configurável como constante) */
export const RETROACTIVE_WITHDRAWAL_WINDOW_DAYS = 30

export interface CreateRetroactiveWithdrawalInput {
  order_id: string
  order_number: string
  material_code?: string
  material_description: string
  unit?: string
  quantity: number
  reason: string
  inventory_id?: string
}

/**
 * Busca OPs concluídas/encerradas nos últimos X dias (default: 30 dias).
 * Utiliza o campo `finished_at` ou `updated` caso `finished_at` esteja vazio.
 */
export async function getClosedOrdersWithinWindow(
  windowDays = RETROACTIVE_WITHDRAWAL_WINDOW_DAYS,
): Promise<PcpOrder[]> {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  // Buscar todas as OPs com status Concluído
  const records = await pb.collection('pcp_orders').getFullList<PcpOrder>({
    filter: `status = "Concluído"`,
    sort: '-finished_at',
    expand: 'client_id,product_id',
  })

  // Filtra OPs cuja data de conclusão (finished_at ou updated) seja mais recente que o cutoff
  return records.filter((op) => {
    const finishedDate = op.finished_at || op.updated || op.created
    return finishedDate >= cutoff
  })
}

/**
 * Normaliza uma chave de código ou descrição para casamento entre listas.
 */
export function normalizeMaterialKey(code?: string, description?: string): string {
  if (code && code.trim()) {
    return code.trim().toLowerCase()
  }
  return (description || '').trim().toLowerCase()
}

/**
 * Pré-carrega a BOM da OP (coleção pcp_order_materials),
 * calculando a quantidade da engenharia, o que já foi baixado (movimentações do estoque tipo 'Saída' vinculadas à OP)
 * e o teto sugerido = max(0, engenharia - já baixado).
 */
export async function getOpBomWithWithdrawalComparison(
  orderId: string,
): Promise<RetroactiveBomItem[]> {
  // 1. Materiais da OP na BOM
  const [materials, movements, inventoryList] = await Promise.all([
    pb.collection('pcp_order_materials').getFullList<PcpOrderMaterial>({
      filter: `order_id = "${orderId}"`,
      sort: 'sector,description',
    }),
    pb.collection('inventory_movements').getFullList<InventoryMovement>({
      filter: `order_id = "${orderId}" && type = "Saída"`,
      expand: 'inventory_id',
    }),
    pb.collection('inventory').getFullList<Inventory>({
      sort: 'description',
    }),
  ])

  // Mapear estoque por código e por descrição limpa para resolução rápida de inventory_id
  const inventoryByCode = new Map<string, Inventory>()
  const inventoryByDesc = new Map<string, Inventory>()
  for (const inv of inventoryList) {
    if (inv.code && inv.code.trim()) {
      inventoryByCode.set(inv.code.trim().toLowerCase(), inv)
    }
    if (inv.description && inv.description.trim()) {
      inventoryByDesc.set(inv.description.trim().toLowerCase(), inv)
    }
  }

  // 2. Totalizar o que já foi baixado por componente nessa OP
  // Movimentos de estoque tipo 'Saída' vinculados a esta OP
  const withdrawnByCode = new Map<string, number>()
  const withdrawnByDesc = new Map<string, number>()
  for (const mov of movements) {
    const qty = Number(mov.quantity) || 0
    const inv = mov.expand?.inventory_id as Inventory | undefined
    const invCode = inv?.code?.trim().toLowerCase()
    const invDesc = inv?.description?.trim().toLowerCase()

    if (invCode) {
      withdrawnByCode.set(invCode, (withdrawnByCode.get(invCode) || 0) + qty)
    }
    if (invDesc) {
      withdrawnByDesc.set(invDesc, (withdrawnByDesc.get(invDesc) || 0) + qty)
    }
  }

  // 3. Consolidar materiais da BOM (agrupando se o mesmo código/desc aparecer mais de uma vez)
  const consolidated = new Map<string, RetroactiveBomItem>()

  for (const mat of materials) {
    const code = (mat.code || '').trim()
    const desc = (mat.description || '').trim()
    const key = normalizeMaterialKey(code, desc)
    const qty = Number(mat.quantity) || 0
    const unit = mat.unit || 'un'

    // Localizar item no estoque
    const invItem =
      (code && inventoryByCode.get(code.toLowerCase())) || inventoryByDesc.get(desc.toLowerCase())

    if (consolidated.has(key)) {
      const existing = consolidated.get(key)!
      existing.engineeringQty += qty
      if (!existing.inventoryId && invItem?.id) {
        existing.inventoryId = invItem.id
      }
    } else {
      // Calcular quanto já foi baixado para este item
      const withdrawn =
        (code && withdrawnByCode.get(code.toLowerCase())) ??
        withdrawnByDesc.get(desc.toLowerCase()) ??
        0

      consolidated.set(key, {
        code,
        description: desc,
        unit,
        engineeringQty: qty,
        alreadyWithdrawnQty: withdrawn,
        suggestedMaxQty: Math.max(0, qty - withdrawn),
        inventoryId: invItem?.id,
      })
    }
  }

  // Atualizar o suggestedMaxQty após a soma completa das quantidades de engenharia
  const result: RetroactiveBomItem[] = []
  for (const item of consolidated.values()) {
    item.suggestedMaxQty = Math.max(0, item.engineeringQty - item.alreadyWithdrawnQty)
    result.push(item)
  }

  return result
}

/**
 * Cria uma solicitação de baixa retroativa com status 'Pendente'.
 */
export async function createRetroactiveWithdrawalRequest(
  data: CreateRetroactiveWithdrawalInput,
  requestedByUserId: string,
): Promise<RetroactiveWithdrawal> {
  if (!data.order_id) {
    throw new Error('A Ordem de Produção é obrigatória.')
  }
  if (!data.material_description || !data.material_description.trim()) {
    throw new Error('A descrição do material é obrigatória.')
  }
  if (!data.quantity || data.quantity <= 0) {
    throw new Error('A quantidade solicitada deve ser maior que zero.')
  }
  if (!data.reason || !data.reason.trim()) {
    throw new Error('O motivo da baixa retroativa é obrigatório.')
  }

  return pb.collection('pcp_retroactive_withdrawals').create<RetroactiveWithdrawal>({
    order_id: data.order_id,
    order_number: data.order_number,
    material_code: data.material_code || '',
    material_description: data.material_description.trim(),
    unit: data.unit || 'un',
    quantity: Number(data.quantity),
    reason: data.reason.trim(),
    requested_by: requestedByUserId,
    status: 'Pendente',
    inventory_id: data.inventory_id || undefined,
  })
}

/**
 * Busca todas as solicitações de baixa retroativa feitas por um operador.
 */
export async function getOperatorRetroactiveWithdrawals(
  userId: string,
): Promise<RetroactiveWithdrawal[]> {
  return pb.collection('pcp_retroactive_withdrawals').getFullList<RetroactiveWithdrawal>({
    filter: `requested_by = "${userId}"`,
    sort: '-created',
    expand: 'order_id,reviewed_by,inventory_id',
  })
}

/**
 * Busca todas as solicitações de baixa retroativa para a fila do PCP (todas ou filtradas por status).
 */
export async function getAllRetroactiveWithdrawals(
  statusFilter?: RetroactiveWithdrawalStatus,
): Promise<RetroactiveWithdrawal[]> {
  const filter = statusFilter ? `status = "${statusFilter}"` : ''
  return pb.collection('pcp_retroactive_withdrawals').getFullList<RetroactiveWithdrawal>({
    filter: filter || undefined,
    sort: '-created',
    expand: 'order_id,requested_by,reviewed_by,inventory_id,withdrawal_id',
  })
}

/**
 * Conta solicitações pendentes para exibição de badge.
 */
export async function countPendingRetroactiveWithdrawals(): Promise<number> {
  const result = await pb.collection('pcp_retroactive_withdrawals').getList(1, 1, {
    filter: `status = "Pendente"`,
  })
  return result.totalItems
}

/**
 * Resolve o item de estoque correspondente a partir do código ou descrição,
 * se a solicitação ainda não tiver `inventory_id`.
 */
export async function resolveInventoryItemForWithdrawal(
  code?: string,
  description?: string,
): Promise<Inventory | null> {
  if (code && code.trim()) {
    try {
      return await pb.collection('inventory').getFirstListItem<Inventory>(`code = "${code.trim()}"`)
    } catch {
      /* ignore */
    }
  }
  if (description && description.trim()) {
    try {
      return await pb
        .collection('inventory')
        .getFirstListItem<Inventory>(`description ~ "${description.trim()}"`)
    } catch {
      /* ignore */
    }
  }
  return null
}

/**
 * Aprova uma solicitação de baixa retroativa:
 * 1. Verifica se usuário é gestor do PCP
 * 2. Localiza o item no estoque (inventory)
 * 3. Cria a movimentação de saída vinculada à OP com a mecânica do StockWithdrawalModal:
 *    reason: "Baixa retroativa · aprovada por [gestor] — OP [op_number] / Pedido [order_number] — Motivo: [motivo]"
 * 4. Atualiza a solicitação para 'Aprovada' com reviewed_by, reviewed_at, withdrawal_id, inventory_id
 */
export async function approveRetroactiveWithdrawal(params: {
  withdrawalId: string
  reviewedByUserId: string
  reviewerName: string
  reviewNote?: string
}): Promise<RetroactiveWithdrawal> {
  const request = await pb
    .collection('pcp_retroactive_withdrawals')
    .getOne<RetroactiveWithdrawal>(params.withdrawalId, {
      expand: 'order_id',
    })

  if (request.status !== 'Pendente') {
    throw new Error(`Esta solicitação já foi ${request.status.toLowerCase()}.`)
  }

  // Localizar item do estoque se não estiver associado
  let inventoryId = request.inventory_id
  if (!inventoryId) {
    const resolved = await resolveInventoryItemForWithdrawal(
      request.material_code,
      request.material_description,
    )
    if (!resolved) {
      throw new Error(
        `Componente "${request.material_description}" não foi localizado no estoque. Cadastre-o no estoque antes de aprovar.`,
      )
    }
    inventoryId = resolved.id
  }

  const orderNumber = request.order_number || (request.expand?.order_id as any)?.order_number || '-'
  const opNumber = (request.expand?.order_id as any)?.op_number || '-'
  const exitDate = new Date().toISOString()
  const reviewerLabel = params.reviewerName || 'Gestor PCP'

  const movementReason = `Baixa retroativa · aprovada por ${reviewerLabel} — Pedido ${orderNumber} / OP ${opNumber} (Motivo: ${request.reason})`

  // Registrar movimentação de saída no estoque com a mesma mecânica de createMovement
  const movement = await createMovement({
    inventory_id: inventoryId,
    quantity: request.quantity,
    type: 'Saída',
    reason: movementReason,
    order_id: request.order_id,
    exit_date: exitDate,
  })

  // Atualizar a solicitação
  const updated = await pb
    .collection('pcp_retroactive_withdrawals')
    .update<RetroactiveWithdrawal>(request.id, {
      status: 'Aprovada',
      reviewed_by: params.reviewedByUserId,
      reviewed_at: exitDate,
      review_note: params.reviewNote?.trim() || undefined,
      withdrawal_id: movement.id,
      inventory_id: inventoryId,
    })

  return updated
}

/**
 * Rejeita uma solicitação de baixa retroativa:
 * - Exige motivo de rejeição (obrigatório)
 * - Atualiza status para 'Rejeitada'
 * - NÃO gera movimentação de estoque
 */
export async function rejectRetroactiveWithdrawal(params: {
  withdrawalId: string
  reviewedByUserId: string
  reviewNote: string
}): Promise<RetroactiveWithdrawal> {
  if (!params.reviewNote || !params.reviewNote.trim()) {
    throw new Error('O motivo da rejeição é obrigatório.')
  }

  const request = await pb
    .collection('pcp_retroactive_withdrawals')
    .getOne<RetroactiveWithdrawal>(params.withdrawalId)

  if (request.status !== 'Pendente') {
    throw new Error(`Esta solicitação já foi ${request.status.toLowerCase()}.`)
  }

  const now = new Date().toISOString()
  const updated = await pb
    .collection('pcp_retroactive_withdrawals')
    .update<RetroactiveWithdrawal>(request.id, {
      status: 'Rejeitada',
      reviewed_by: params.reviewedByUserId,
      reviewed_at: now,
      review_note: params.reviewNote.trim(),
    })

  return updated
}
