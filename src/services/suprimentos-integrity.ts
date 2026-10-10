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
