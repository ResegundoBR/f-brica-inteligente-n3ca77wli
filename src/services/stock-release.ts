import pb from '@/lib/pocketbase/client'
import { MaterialShortage } from '@/types'
import { createMovement } from '@/services/inventory'
import {
  getStockAvailabilityForCodes,
  ComponentStockAvailability,
  normalizeCode,
} from '@/services/material-reservations'

export interface ReleaseFromStockResult {
  success: boolean
  shortageId: string
  code: string
  quantity: number
  movementId?: string
  error?: string
}

export interface BatchReleaseResult {
  totalRequested: number
  totalReleased: number
  successCount: number
  failCount: number
  results: ReleaseFromStockResult[]
}

/**
 * Libera uma solicitação individual diretamente do estoque:
 * 1. Confere se o saldo disponível cobre a quantidade do registro
 * 2. Cria movimentação de Saída no inventário via createMovement
 * 3. Marca status = 'Liberado_Estoque' com observação de auditoria
 */
export async function releaseShortageFromStock(
  shortage: MaterialShortage,
  userName?: string,
): Promise<ReleaseFromStockResult> {
  const normCode = normalizeCode(shortage.code)
  if (!normCode) {
    throw new Error('A solicitação não possui código de material válido para baixa de estoque.')
  }

  const requestedQty = Number(shortage.quantity) || 0
  if (requestedQty <= 0) {
    throw new Error('A quantidade solicitada deve ser maior que zero.')
  }

  // 1. Obter disponibilidade atualizada
  const availabilityMap = await getStockAvailabilityForCodes([normCode])
  const stockInfo = availabilityMap.get(normCode)

  if (!stockInfo || !stockInfo.inventoryId) {
    throw new Error(
      `Item de estoque não encontrado para o código ${shortage.code || shortage.description}. Cadastre o saldo no almoxarifado antes de liberar.`,
    )
  }

  if (stockInfo.availableStock < requestedQty - 0.0001) {
    throw new Error(
      `Saldo livre insuficiente (${stockInfo.availableStock} ${stockInfo.unit}) para cobrir a solicitação de ${requestedQty} un (Reservado: ${stockInfo.reservedStock} un).`,
    )
  }

  const opLabel = shortage.expand?.order_id?.op_number
    ? `OP ${shortage.expand.order_id.op_number}`
    : shortage.expand?.order_id?.order_number
      ? `Pedido ${shortage.expand.order_id.order_number}`
      : 'Geral'

  const userIdentifier =
    userName ||
    (pb.authStore.record as any)?.name ||
    (pb.authStore.record as any)?.email ||
    'Usuário'
  const todayFormatted = new Date().toLocaleDateString('pt-BR')

  const reason = `Liberado do Estoque para ${opLabel} (Solicitação ${shortage.id}) por ${userIdentifier}`

  // 2. Criar movimentação de saída
  const movement = await createMovement({
    inventory_id: stockInfo.inventoryId,
    quantity: requestedQty,
    type: 'Saída',
    reason,
    order_id: shortage.order_id || undefined,
    exit_date: new Date().toISOString(),
  })

  // 3. Atualizar status para Liberado_Estoque com observação de auditoria
  const auditNote = `Liberado do Estoque por ${userIdentifier} em ${todayFormatted}`
  const currentObs = shortage.observation || ''
  const finalObs = currentObs ? `${currentObs} | ${auditNote}` : auditNote

  await pb.collection('material_shortages').update(shortage.id, {
    status: 'Liberado_Estoque',
    observation: finalObs,
  })

  return {
    success: true,
    shortageId: shortage.id,
    code: shortage.code,
    quantity: requestedQty,
    movementId: movement.id,
  }
}

/**
 * Libera um grupo/lote de solicitações do mesmo código (ou seleção múltipla):
 * - Confere se o saldo disponível total cobre as solicitações
 * - Processa cada solicitação criando as movimentações e atualizando status
 * - Se o saldo livre cobrir apenas parcialmente, libera as que couberem em ordem cronológica
 *   e deixa as demais intactas na Fila de Entrada com aviso claro.
 */
export async function releaseGroupFromStock(
  shortages: MaterialShortage[],
  userName?: string,
): Promise<BatchReleaseResult> {
  const result: BatchReleaseResult = {
    totalRequested: 0,
    totalReleased: 0,
    successCount: 0,
    failCount: 0,
    results: [],
  }

  if (shortages.length === 0) return result

  // Agrupar por código normalizado
  const codeGroups = new Map<string, MaterialShortage[]>()
  for (const s of shortages) {
    const code = normalizeCode(s.code)
    if (!code) continue
    const list = codeGroups.get(code) || []
    list.push(s)
    codeGroups.set(code, list)
  }

  // Buscar disponibilidades
  const codes = Array.from(codeGroups.keys())
  const availMap = await getStockAvailabilityForCodes(codes)

  for (const [code, items] of codeGroups.entries()) {
    const stockInfo = availMap.get(code)
    let available = stockInfo?.availableStock || 0
    const invId = stockInfo?.inventoryId

    for (const item of items) {
      const qty = Number(item.quantity) || 0
      result.totalRequested += qty

      if (!invId || available < qty - 0.0001) {
        result.failCount++
        result.results.push({
          success: false,
          shortageId: item.id,
          code: item.code,
          quantity: qty,
          error: !invId
            ? 'Item sem cadastro no almoxarifado'
            : `Saldo insuficiente (livre: ${available.toFixed(1)})`,
        })
        continue
      }

      try {
        const singleRes = await releaseShortageFromStock(item, userName)
        available -= qty
        result.totalReleased += qty
        result.successCount++
        result.results.push(singleRes)
      } catch (err: any) {
        result.failCount++
        result.results.push({
          success: false,
          shortageId: item.id,
          code: item.code,
          quantity: qty,
          error: err.message || 'Erro ao liberar',
        })
      }
    }
  }

  return result
}
