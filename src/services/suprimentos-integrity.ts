import pb from '@/lib/pocketbase/client'

export interface DivergenceItem {
  id: string
  category:
    | 'recebimento_acima_demanda'
    | 'saldo_estoque_incoerente'
    | 'balance_after_incoerente'
    | 'solicitacao_fantasma_op_encerrada'
    | 'compra_sem_oc_vinculada'
    | 'codigo_com_erro_digitacao'
    | 'codigo_com_espacos'
    | 'descricao_poluida'
    | string
  severity: 'alta' | 'media' | 'baixa'
  item_type: 'material_shortage' | 'inventory' | 'component' | string
  record_id: string
  code: string
  description: string
  problem: string
  suggestion: string
  detected_at: string
  details?: Record<string, unknown>
}

export interface IntegrityCheckResult {
  verified_at: string
  total_divergences: number
  high_severity_count: number
  divergences: DivergenceItem[]
}

/**
 * Busca o resultado do verificador permanente de integridade de Suprimentos
 */
export async function fetchSuprimentosIntegrityCheck(): Promise<IntegrityCheckResult> {
  const response = await pb.send<{ success: boolean; data: IntegrityCheckResult }>(
    '/backend/v1/suprimentos/integrity-check',
    {
      method: 'GET',
    },
  )

  return (
    response?.data || {
      verified_at: new Date().toISOString(),
      total_divergences: 0,
      high_severity_count: 0,
      divergences: [],
    }
  )
}

/**
 * Executa o cancelamento automático de solicitações pendentes vinculadas a OPs encerradas
 */
export async function triggerAutoCancelClosedOps(): Promise<{
  success: boolean
  cancelledCount: number
  message: string
}> {
  const res = await pb.send<{ success: boolean; cancelledCount: number; message: string }>(
    '/backend/v1/suprimentos/auto-cancel-closed-ops',
    {
      method: 'POST',
    },
  )

  return res || { success: false, cancelledCount: 0, message: '' }
}

export interface ResidualItem {
  id: string
  code: string
  description: string
  quantity: number
  received_quantity: number
  remaining_quantity: number
  status: string
  order_id?: string
  op_number?: string
  created: string
  updated: string
  days_inactive?: number
  type: 'recebido_parcial' | 'stale_cotacao_compra'
}

export interface ResidualReportResponse {
  success: boolean
  threshold_days: number
  partials_count: number
  stale_count: number
  total_residual: number
  partials: ResidualItem[]
  stale: ResidualItem[]
  error?: string
}

export interface CloseResidualResponse {
  success: boolean
  shortage_id: string
  new_status: string
  audit_note: string
  message: string
  error?: string
}

/**
 * Busca a lista de itens residuais: Recebido_Parcial com saldo remanescente
 * e solicitações paradas em Cotação/Compra há mais de X dias (padrão 30).
 */
export async function fetchResidualShortages(days = 30): Promise<ResidualReportResponse> {
  const res = await pb.send<ResidualReportResponse>(
    `/backend/v1/suprimentos/residual-items?days=${days}`,
    {
      method: 'GET',
    },
  )
  if (!res.success) {
    throw new Error(res.error || 'Falha ao carregar itens residuais.')
  }
  return res
}

/**
 * Encerra o saldo residual de uma solicitação com auditoria explícita:
 * - Se Recebido_Parcial: encerra como Recebido com 'Saldo residual encerrado manualmente por [usuário] em [data] (recebido X de Y)'
 * - Se Cotação/Compra: encerra como Cancelado com auditoria
 */
export async function closeResidualShortage(
  shortageId: string,
  reason?: string,
): Promise<CloseResidualResponse> {
  const res = await pb.send<CloseResidualResponse>(
    '/backend/v1/suprimentos/close-residual-shortage',
    {
      method: 'POST',
      body: {
        shortage_id: shortageId,
        reason: reason || '',
      },
    },
  )
  if (!res.success) {
    throw new Error(res.error || 'Falha ao encerrar saldo residual da solicitação.')
  }
  return res
}
