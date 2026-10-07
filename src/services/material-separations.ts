import pb from '@/lib/pocketbase/client'
import { notifyPcpManagers } from '@/services/notifications'
import {
  releaseAllSeparationReservations,
  syncSeparationReservations,
  normalizeCode,
} from './material-reservations'
import { MaterialReservation } from '@/types'
import { upsertMaterialShortage } from './material-shortages'
import { isFabricatedCode } from './pcp-separation-sectors'

export { isFabricatedCode } from './pcp-separation-sectors'

export type SeparationStatus = 'Pendente' | 'Em_Separacao' | 'Concluida' | 'Cancelada'

export type SeparationItemStatus =
  | 'pendente'
  | 'separado'
  | 'falta'
  | 'parcial'
  | 'substituido'
  | 'ja_separado'

/**
 * Determina se um item de separação está "Pendente" / "Não Separado".
 * Definição (Reginaldo): item SEM NENHUMA ação do operador — não Separado, não Falta, não Parcial, não Troca/Substituído, não Já Separado.
 * Itens marcados com Falta já passaram pela separação e foram para Solicitações — portanto NÃO são pendentes.
 * Itens marcados como 'ja_separado' já foram resolvidos anteriormente — portanto NÃO são pendentes.
 */
export function isSeparationItemPending(
  item: Pick<SeparationItem, 'status'> | { status?: string | null } | null | undefined,
): boolean {
  if (!item) return false
  const s = item.status
  if (!s || s === 'pendente') return true
  // Se tiver qualquer ação registrada ('separado', 'falta', 'parcial', 'substituido', 'ja_separado'), NÃO é pendente
  return false
}

export interface SeparationItem {
  id: string // unique item id within the separation round
  code: string
  description: string
  total_quantity: number
  unit: string
  cut_measurement?: string | null
  op_numbers: string[]
  order_ids: string[]
  status?: SeparationItemStatus
  marked_at?: string
  marked_by?: string
  notes?: string
  // Falta Parcial
  separated_quantity?: number
  shortage_quantity?: number
  // Troca / Substituição
  is_substitution?: boolean
  replaced_by_code?: string
  replaced_by_description?: string
  original_item_id?: string
}

export interface MaterialSeparation {
  id: string
  title?: string
  status: SeparationStatus
  date?: string
  op_numbers: string[]
  order_ids: string[]
  items: SeparationItem[]
  separated_items?: SeparationItem[]
  shortage_items?: SeparationItem[]
  separated_count: number
  shortage_count: number
  total_items_count: number
  created_by?: string
  finished_by?: string
  finished_at?: string
  programacao_id?: string
  notes?: string
  created: string
  updated: string
  expand?: {
    created_by?: { id: string; name?: string; email?: string }
    finished_by?: { id: string; name?: string; email?: string }
    programacao_id?: { id: string; name: string; seq_number: number; status: string }
  }
}

export interface CreateSeparationInput {
  title?: string
  date?: string
  op_numbers: string[]
  order_ids: string[]
  items: SeparationItem[]
  programacao_id?: string
  notes?: string
}

export async function getSeparations(filter?: string): Promise<MaterialSeparation[]> {
  try {
    const records = await pb.collection('material_separations').getFullList<MaterialSeparation>({
      filter: filter || '',
      sort: '-created',
      expand: 'created_by,finished_by,programacao_id',
    })
    return records
  } catch (err) {
    console.error('Erro ao listar separações:', err)
    return []
  }
}

export async function getSeparationById(id: string): Promise<MaterialSeparation | null> {
  try {
    const record = await pb.collection('material_separations').getOne<MaterialSeparation>(id, {
      expand: 'created_by,finished_by,programacao_id',
    })
    return record
  } catch (err) {
    console.error('Erro ao buscar separação:', err)
    return null
  }
}

export async function createSeparation(input: CreateSeparationInput): Promise<MaterialSeparation> {
  const currentUserId = pb.authStore.record?.id
  const payload = {
    title:
      input.title ||
      `Separação ${input.op_numbers.length} OPs - ${new Date().toLocaleDateString('pt-BR')}`,
    status: 'Pendente' as SeparationStatus,
    date: input.date || new Date().toISOString(),
    op_numbers: input.op_numbers,
    order_ids: input.order_ids,
    items: input.items.map((item) => ({
      ...item,
      status: item.status || 'pendente',
    })),
    separated_items: [],
    shortage_items: [],
    separated_count: 0,
    shortage_count: 0,
    total_items_count: input.items.length,
    created_by: currentUserId || null,
    programacao_id: input.programacao_id || null,
    notes: input.notes || '',
  }

  const record = await pb.collection('material_separations').create<MaterialSeparation>(payload)
  return record
}

export async function updateSeparationItems(
  separationId: string,
  items: SeparationItem[],
  status?: SeparationStatus,
): Promise<MaterialSeparation> {
  const separated = items.filter((i) => i.status === 'separado' || i.status === 'parcial')
  const shortages = items.filter(
    (i) => i.status === 'falta' || (i.status === 'parcial' && (i.shortage_quantity ?? 0) > 0),
  )

  const payload: Record<string, unknown> = {
    items,
    separated_count: items.filter((i) => i.status === 'separado' || i.status === 'parcial').length,
    shortage_count: items.filter(
      (i) => i.status === 'falta' || (i.status === 'parcial' && (i.shortage_quantity ?? 0) > 0),
    ).length,
    separated_items: separated,
    shortage_items: shortages,
  }

  if (status) {
    payload.status = status
  }

  const record = await pb
    .collection('material_separations')
    .update<MaterialSeparation>(separationId, payload)

  // Sincronizar reservas da rodada em aberto
  try {
    if (status === 'Cancelada') {
      await releaseAllSeparationReservations(separationId)
    } else {
      await syncSeparationReservations(separationId, items)
    }
  } catch (resErr) {
    console.error('Erro ao sincronizar reservas da separação:', resErr)
  }

  return record
}

/**
 * Cria ou atualiza solicitação de falta em material_shortages no ato da marcação
 * de Falta Total ou Falta Parcial pelo operador.
 * Utiliza upsertMaterialShortage para manter anti-duplicidade estrita.
 */
export async function persistItemShortage(
  item: SeparationItem,
  operatorName?: string,
): Promise<void> {
  if (isFabricatedCode(item.code)) return
  if (item.status !== 'falta' && item.status !== 'parcial') return

  const currentUserId = pb.authStore.record?.id
  const primaryOrderId = item.order_ids?.[0] || null
  const primaryOp =
    item.op_numbers?.[0] || (item.op_numbers?.length ? item.op_numbers.join(', ') : 'Separação')
  const opsLabel =
    item.op_numbers?.length > 1
      ? ` (OPs: ${item.op_numbers.join(', ')})`
      : primaryOp
        ? ` (OP: ${primaryOp})`
        : ''

  const userDisplayName =
    operatorName || pb.authStore.record?.name || pb.authStore.record?.email || 'Separação'

  if (item.status === 'falta') {
    const observation =
      `Falta gerada automaticamente na Separação do Operador${opsLabel}. Qtd: ${item.total_quantity} ${item.unit || 'UN'}.${item.cut_measurement ? ` Medida de corte: ${item.cut_measurement}.` : ''} ${item.notes || ''}`.trim()

    const shortagePayload = {
      code: item.code || '',
      description: `${item.description || 'Material sem descrição'}${opsLabel}`,
      quantity: Number(item.total_quantity) || 1,
      sector: 'Suprimentos',
      status: 'Pendente',
      request_type: 'Materiais',
      priority: 'Urgente',
      requested_by: currentUserId || null,
      observation: observation,
      order_id: primaryOrderId || null,
    }

    await upsertMaterialShortage(shortagePayload, userDisplayName)
  } else if (item.status === 'parcial') {
    const diff = Number(item.shortage_quantity) || 0
    if (diff <= 0) return

    const sepQty = item.separated_quantity ?? item.total_quantity - diff
    const observation =
      `Falta Parcial gerada na Separação do Operador${opsLabel}. Separados: ${sepQty}/${item.total_quantity} ${item.unit || 'UN'}. Faltam: ${diff} ${item.unit || 'UN'}.${item.cut_measurement ? ` Medida de corte: ${item.cut_measurement}.` : ''} ${item.notes || ''}`.trim()

    const shortagePayload = {
      code: item.code || '',
      description: `${item.description || 'Material sem descrição'}${opsLabel}`,
      quantity: diff,
      sector: 'Suprimentos',
      status: 'Pendente',
      request_type: 'Materiais',
      priority: 'Urgente',
      requested_by: currentUserId || null,
      observation: observation,
      order_id: primaryOrderId || null,
    }

    await upsertMaterialShortage(shortagePayload, userDisplayName)
  }
}

/**
 * Mescla de forma segura a lista local com a lista mais recente vinda do PocketBase,
 * protegendo itens que possam ter gravação local em andamento (inFlightItemIds).
 * Mantém todos os campos e a ordenação.
 */
export function mergeSeparationItems(
  localItems: SeparationItem[],
  remoteItems: SeparationItem[],
  inFlightItemIds: Set<string> = new Set(),
): SeparationItem[] {
  if (!remoteItems || remoteItems.length === 0) return localItems
  if (!localItems || localItems.length === 0) return remoteItems

  const remoteMap = new Map<string, SeparationItem>()
  for (const r of remoteItems) {
    if (r.id) remoteMap.set(r.id, r)
  }

  // Atualizar itens locais com valores remotos, exceto se estiver com gravação em curso localmente
  const updatedLocal = localItems.map((local) => {
    if (inFlightItemIds.has(local.id)) {
      return local
    }
    const remote = remoteMap.get(local.id)
    return remote || local
  })

  // Adicionar quaisquer novos itens criados remotamente (ex: substituições criadas por outro operador)
  const localIdSet = new Set(localItems.map((i) => i.id))
  for (const remote of remoteItems) {
    if (remote.id && !localIdSet.has(remote.id)) {
      // Se for item substituto, posicionar após o original se possível
      if (remote.original_item_id) {
        const origIdx = updatedLocal.findIndex((i) => i.id === remote.original_item_id)
        if (origIdx >= 0) {
          updatedLocal.splice(origIdx + 1, 0, remote)
          continue
        }
      }
      updatedLocal.push(remote)
    }
  }

  return updatedLocal
}

export interface FinalizeSeparationResult {
  separation: MaterialSeparation
  shortagesCreatedCount: number
  movementsCreatedCount: number
}

/**
 * Finaliza a rodada de separação:
 * - Grava os itens marcados como 'separado' em separated_items (kit separado da rodada)
 * - Converte as reservas ativas dos itens separados em baixa definitiva (inventory_movements type 'Saída', reason 'Separação — Programação #XX', decremento no inventory.quantity)
 * - Assegura idempotência por rodada: verifica se a baixa já foi realizada anteriormente para esta rodada
 * - Para cada item marcado como 'falta', cria automaticamente um registro em material_shortages
 * - Libera quaisquer outras reservas pendentes
 * - Atualiza o status da rodada para 'Concluida' com finished_by e finished_at
 */
export async function finalizeSeparation(
  separationId: string,
  items: SeparationItem[],
): Promise<FinalizeSeparationResult> {
  const currentUserId = pb.authStore.record?.id
  const separated = items.filter((i) => i.status === 'separado')
  const parciais = items.filter((i) => i.status === 'parcial')
  const shortages = items.filter((i) => i.status === 'falta')

  // Buscar dados da rodada para obter programacao_id / nome
  let separationRecord: MaterialSeparation | null = null
  try {
    separationRecord = await pb
      .collection('material_separations')
      .getOne<MaterialSeparation>(separationId, {
        expand: 'programacao_id,created_by',
      })
  } catch (_) {
    // ignorar erro caso não encontre
  }

  const progSeq = separationRecord?.expand?.programacao_id?.seq_number
  const progName =
    separationRecord?.expand?.programacao_id?.name ||
    (progSeq ? `Programação #${progSeq}` : null) ||
    separationRecord?.title ||
    `Rodada ${separationId.slice(0, 6)}`

  const movementReason = `Separação — ${progName}`

  // 1. CONVERTER RESERVAS EM BAIXA DEFINITIVA (Idempotente por rodada)
  // Verificar movimentos já existentes para esta separação para evitar duplicidade
  let movementsCreatedCount = 0
  try {
    // Buscar todas as reservas ativas desta rodada
    const reservations = await pb
      .collection('material_reservations')
      .getFullList<MaterialReservation>({
        filter: `separation_id = "${separationId}" && status = "Ativa"`,
      })

    // Agrupar itens separados por código normalizado
    // Se não tiver reserva gravada ainda para algum item 'separado', garante a inclusão
    const separatedByCode = new Map<
      string,
      { code: string; description: string; qty: number; orderId?: string }
    >()
    for (const item of separated) {
      if (isFabricatedCode(item.code)) continue
      const codeNorm = normalizeCode(item.code)
      if (!codeNorm) continue
      const existing = separatedByCode.get(codeNorm)
      const qty = Number(item.total_quantity) || 0
      if (qty <= 0) continue
      if (existing) {
        existing.qty += qty
      } else {
        separatedByCode.set(codeNorm, {
          code: item.code,
          description: item.description,
          qty,
          orderId: item.order_ids?.[0],
        })
      }
    }

    // Incluir também os parciais (apenas a parcela separated_quantity)
    for (const item of parciais) {
      if (isFabricatedCode(item.code)) continue
      const codeNorm = normalizeCode(item.code)
      if (!codeNorm) continue
      const qty =
        item.separated_quantity !== undefined
          ? Number(item.separated_quantity) || 0
          : Number(item.total_quantity) || 0
      if (qty <= 0) continue
      const existing = separatedByCode.get(codeNorm)
      if (existing) {
        existing.qty += qty
      } else {
        separatedByCode.set(codeNorm, {
          code: item.code,
          description: item.description,
          qty,
          orderId: item.order_ids?.[0],
        })
      }
    }

    // Carregar inventário para vincular e decrementar quantity
    const inventoryList = await pb.collection('inventory').getFullList({
      sort: 'code',
    })
    const invByCode = new Map<string, any>()
    for (const inv of inventoryList) {
      const codeNorm = normalizeCode(inv.code)
      if (codeNorm) {
        invByCode.set(codeNorm, inv)
      }
    }

    // Verificar se já houve baixas registradas para este motivo e separação
    // Reason contém `[Sep:${separationId}]` como marcador seguro de idempotência
    const idempotencyTag = `[Sep:${separationId}]`
    const existingMovements = await pb.collection('inventory_movements').getFullList({
      filter: `reason ~ "${idempotencyTag}"`,
    })
    const alreadyDecrementedCodes = new Set(
      existingMovements.map((m: any) => normalizeCode(m.expand?.inventory_id?.code || '')),
    )

    for (const [codeNorm, itemData] of separatedByCode.entries()) {
      const inv = invByCode.get(codeNorm)
      if (!inv) continue

      // Se já registrou saída para esta rodada e código, pular para manter idempotência
      if (alreadyDecrementedCodes.has(codeNorm)) {
        continue
      }

      const qty = itemData.qty
      if (qty <= 0) continue

      const currentQty = Number(inv.quantity) || 0
      const newQty = Math.max(0, currentQty - qty)

      // Registrar movimento de saída
      await pb.collection('inventory_movements').create({
        inventory_id: inv.id,
        user_id: currentUserId || null,
        quantity: qty,
        type: 'Saída',
        reason: `${movementReason} ${idempotencyTag}`,
        order_id: itemData.orderId || null,
        exit_date: new Date().toISOString(),
        balance_after: newQty,
      })
      movementsCreatedCount += 1

      // Atualizar estoque total (quantity) no inventory
      await pb.collection('inventory').update(inv.id, {
        quantity: newQty,
      })
    }

    // Atualizar status das reservas da rodada para 'Baixada'
    for (const res of reservations) {
      await pb.collection('material_reservations').update(res.id, {
        status: 'Baixada',
      })
    }
  } catch (movErr) {
    console.error('Erro ao realizar baixa definitiva de estoque na separação:', movErr)
  }

  // Criar faltas no material_shortages para cada item marcado como falta
  // Respeitando exatamente o schema de material_shortages:
  // code, description, quantity, sector, status, order_id, request_type, priority, requested_by, observation
  // Obs.: itens substituídos (status === 'substituido') NÃO geram falta!
  let shortagesCreatedCount = 0

  // 1) Faltas totais
  for (const item of shortages) {
    if (item.status === 'substituido') continue
    if (isFabricatedCode(item.code)) continue
    try {
      const primaryOrderId = item.order_ids?.[0] || null
      const primaryOp =
        item.op_numbers?.[0] || (item.op_numbers?.length ? item.op_numbers.join(', ') : 'Separação')
      const opsLabel =
        item.op_numbers?.length > 1
          ? ` (OPs: ${item.op_numbers.join(', ')})`
          : primaryOp
            ? ` (OP: ${primaryOp})`
            : ''

      const observation =
        `Falta gerada automaticamente na Separação do Operador${opsLabel}. Qtd: ${item.total_quantity} ${item.unit || 'UN'}.${item.cut_measurement ? ` Medida de corte: ${item.cut_measurement}.` : ''} ${item.notes || ''}`.trim()

      const shortagePayload = {
        code: item.code || '',
        description: `${item.description || 'Material sem descrição'}${opsLabel}`,
        quantity: Number(item.total_quantity) || 1,
        sector: 'Suprimentos',
        status: 'Pendente',
        request_type: 'Materiais',
        priority: 'Urgente',
        requested_by: currentUserId || null,
        observation: observation,
        order_id: primaryOrderId || null,
      }

      await upsertMaterialShortage(
        shortagePayload,
        pb.authStore.record?.name || pb.authStore.record?.email || 'Separação',
      )
      shortagesCreatedCount += 1
    } catch (err) {
      console.error('Erro ao gerar falta para item de separação:', item, err)
    }
  }

  // 2) Faltas parciais: APENAS a diferença (shortage_quantity)
  for (const item of parciais) {
    if (isFabricatedCode(item.code)) continue
    const diff = Number(item.shortage_quantity) || 0
    if (diff <= 0) continue
    try {
      const primaryOrderId = item.order_ids?.[0] || null
      const primaryOp =
        item.op_numbers?.[0] || (item.op_numbers?.length ? item.op_numbers.join(', ') : 'Separação')
      const opsLabel =
        item.op_numbers?.length > 1
          ? ` (OPs: ${item.op_numbers.join(', ')})`
          : primaryOp
            ? ` (OP: ${primaryOp})`
            : ''

      const sepQty = item.separated_quantity ?? item.total_quantity - diff
      const observation =
        `Falta Parcial gerada na Separação do Operador${opsLabel}. Separados: ${sepQty}/${item.total_quantity} ${item.unit || 'UN'}. Faltam: ${diff} ${item.unit || 'UN'}.${item.cut_measurement ? ` Medida de corte: ${item.cut_measurement}.` : ''} ${item.notes || ''}`.trim()

      const shortagePayload = {
        code: item.code || '',
        description: `${item.description || 'Material sem descrição'}${opsLabel}`,
        quantity: diff,
        sector: 'Suprimentos',
        status: 'Pendente',
        request_type: 'Materiais',
        priority: 'Urgente',
        requested_by: currentUserId || null,
        observation: observation,
        order_id: primaryOrderId || null,
      }

      await upsertMaterialShortage(
        shortagePayload,
        pb.authStore.record?.name || pb.authStore.record?.email || 'Separação',
      )
      shortagesCreatedCount += 1
    } catch (err) {
      console.error('Erro ao gerar falta parcial para item de separação:', item, err)
    }
  }

  // Atualizar rodada para Concluída
  const allSeparatedRecords = [...separated, ...parciais]
  const allShortageRecords = [
    ...shortages,
    ...parciais.filter((p) => (p.shortage_quantity ?? 0) > 0),
  ]

  const payload = {
    status: 'Concluida' as SeparationStatus,
    items,
    separated_items: allSeparatedRecords,
    shortage_items: allShortageRecords,
    separated_count: allSeparatedRecords.length,
    shortage_count: allShortageRecords.length,
    finished_by: currentUserId || null,
    finished_at: new Date().toISOString(),
  }

  const updatedSeparation = await pb
    .collection('material_separations')
    .update<MaterialSeparation>(separationId, payload, {
      expand: 'programacao_id,created_by,finished_by',
    })

  // (3) NOTIFICAÇÃO AO GESTOR quando o operador finalizar a rodada de separação
  // Notifica os gestores com o nome da Programação, operador e resumo
  try {
    const progName =
      updatedSeparation.expand?.programacao_id?.name ||
      updatedSeparation.title ||
      'Programação de Separação'
    const operatorName =
      pb.authStore.record?.name ||
      updatedSeparation.expand?.finished_by?.name ||
      'Operador da Fábrica'

    const message = `Rodada da ${progName} finalizada por ${operatorName}: ${separated.length} itens separados, ${shortages.length} faltas enviadas para suprimentos.`

    await notifyPcpManagers({
      message,
      actionUrl: '/pcp/programacao',
    })
  } catch (notifErr) {
    console.warn('Erro ao disparar notificação aos gestores:', notifErr)
  }

  return {
    separation: updatedSeparation,
    shortagesCreatedCount,
    movementsCreatedCount,
  }
}

export interface ReopenSeparationOptions {
  reason?: string
}

/**
 * Reabre uma rodada de separação com status 'Concluida':
 * - Altera status de volta para 'Em_Separacao'
 * - Preserva TODAS as marcações já gravadas (items, separated_items, shortage_items, contadores)
 * - Limpa finished_at e finished_by
 * - Sincroniza reservas de material para os itens marcados como separados/parciais
 * - Registra log de auditoria em pcp_order_logs para todas as OPs envolvidas (quem reabriu e quando)
 */
export async function reopenSeparation(
  separationId: string,
  options?: ReopenSeparationOptions,
): Promise<MaterialSeparation> {
  const currentUserId = pb.authStore.record?.id
  const managerName = pb.authStore.record?.name || pb.authStore.record?.email || 'Gestor do PCP'

  // 1. Carregar a rodada atual
  const existing = await pb
    .collection('material_separations')
    .getOne<MaterialSeparation>(separationId, {
      expand: 'programacao_id,created_by,finished_by',
    })

  if (!existing) {
    throw new Error('Rodada de separação não encontrada.')
  }

  const items = existing.items || []
  const separatedCount =
    existing.separated_count ??
    items.filter((i) => i.status === 'separado' || i.status === 'parcial').length
  const shortageCount =
    existing.shortage_count ??
    items.filter(
      (i) => i.status === 'falta' || (i.status === 'parcial' && (i.shortage_quantity ?? 0) > 0),
    ).length

  // 2. Atualizar a rodada para 'Em_Separacao' preservando todas as marcações
  const payload = {
    status: 'Em_Separacao' as SeparationStatus,
    finished_at: null,
    finished_by: null,
  }

  const updatedSeparation = await pb
    .collection('material_separations')
    .update<MaterialSeparation>(separationId, payload, {
      expand: 'programacao_id,created_by,finished_by',
    })

  // 3. Sincronizar reservas no estoque (garante que itens já separados fiquem com reserva Ativa)
  try {
    await syncSeparationReservations(separationId, items)
  } catch (resErr) {
    console.error('Erro ao sincronizar reservas na reabertura da separação:', resErr)
  }

  // 4. Registro de auditoria em pcp_order_logs (quem reabriu, quando e resumo preservado)
  const dateFormatted = new Date().toLocaleString('pt-BR')
  const progName =
    existing.expand?.programacao_id?.name || existing.title || `Rodada ${separationId.slice(0, 6)}`

  const targetOrderIds = Array.from(new Set((existing.order_ids || []).filter(Boolean)))
  if (targetOrderIds.length === 0 && existing.op_numbers && existing.op_numbers.length > 0) {
    try {
      const cleanOps = existing.op_numbers.map((o) => o.replace(/^OP\s*/i, '').trim())
      const filter = cleanOps.map((op) => `op_number = "${op}"`).join(' || ')
      if (filter) {
        const found = await pb.collection('pcp_orders').getFullList({
          filter,
          fields: 'id',
        })
        found.forEach((f: any) => targetOrderIds.push(f.id))
      }
    } catch (e) {
      console.warn('Erro ao resolver order_ids para auditoria de reabertura:', e)
    }
  }

  const auditDetails = [
    `Rodada de Separação reaberta por ${managerName} em ${dateFormatted}.`,
    `• Programação / Rodada: ${progName}`,
    `• Status alterado: Concluída → Em Separação`,
    `• Marcações preservadas: ${separatedCount} separados, ${shortageCount} faltas (total: ${items.length} itens).`,
    options?.reason ? `• Motivo: ${options.reason}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  for (const orderId of targetOrderIds) {
    try {
      await pb.collection('pcp_order_logs').create({
        order_id: orderId,
        user_id: currentUserId || null,
        stage: 'Separação',
        action: 'Separação - Rodada Reaberta',
        details: auditDetails,
      })
    } catch (logErr) {
      console.error(`Erro ao gravar log de auditoria da reabertura para OP ${orderId}:`, logErr)
    }
  }

  return updatedSeparation
}
