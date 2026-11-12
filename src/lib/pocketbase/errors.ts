import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

// ============================================================
// NÃO REMOVER `formatDetailedErrorMessage` — terceira vez que
// apagado em reescrita do arquivo (rodadas 2026-11-09 e 2026-11-12).
// Consumidores: src/pages/pcp/suprimentos/ComprasPage.tsx, EditOrdemCompraModal,
// EntradaIntegralOcModal, SmartReceiveDialog, OrdemCompraModal e o teste
// src/services/ordens-compra.test.ts (contrato exato abaixo).
// ============================================================
export function formatDetailedErrorMessage(
  error: unknown,
  labels?: string | Record<string, string>,
): string {
  const labelMap: Record<string, string> = {
    expected_date: 'Previsão de Entrega',
    'data.delivery_forecast': 'Previsão de Entrega',
    delivery_forecast: 'Previsão de Entrega',
    supplier: 'Fornecedor',
  }
  if (labels && typeof labels === 'string') {
    return labels
  }
  if (labels && typeof labels === 'object') {
    Object.assign(labelMap, labels)
  }

  let rawMessage = ''
  if (error instanceof ClientResponseError) {
    rawMessage = error.response?.message || error.message || ''
  } else if (error && typeof error === 'object' && 'response' in (error as Record<string, unknown>)) {
    const resp = (error as { response?: { message?: string } }).response
    rawMessage = resp?.message || ''
  } else if (error instanceof Error) {
    rawMessage = error.message
  }

  if (!rawMessage) {
    rawMessage = 'Não foi possível concluir a operação.'
  }

  // Traduções de mensagens cruas do PocketBase
  if (/Failed to create record/i.test(rawMessage)) rawMessage = 'Falha ao criar o registro.'
  else if (/Failed to update record/i.test(rawMessage)) rawMessage = 'Falha ao atualizar o registro.'
  else if (/Failed to delete record/i.test(rawMessage)) rawMessage = 'Falha ao excluir o registro.'

  const fieldErrors = extractFieldErrors(error)
  const fieldKeys = Object.keys(fieldErrors)
  if (fieldKeys.length === 0) {
    return rawMessage
  }

  const parts = fieldKeys.map((key) => {
    const friendlyLabel = labelMap[key] || key
    const msg = fieldErrors[key]
    const translated = /blank|required/i.test(msg)
      ? 'Obrigatório'
      : /invalid_date|valid date/i.test(msg)
        ? 'Data inválida'
        : msg
    return `${friendlyLabel}: ${translated}`
  })
  return parts.join(' ')
}

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!error || typeof error !== 'object') return {}
  const resp = (error as { response?: { data?: unknown } }).response
  const data = resp?.data
  if (!data || typeof data !== 'object') return {}
  const errors: FieldErrors = {}
  for (const [field, detail] of Object.entries(data)) {
    if (
      detail &&
      typeof detail === 'object' &&
      'message' in detail &&
      typeof (detail as { message: unknown }).message === 'string'
    ) {
      errors[field] = (detail as { message: string }).message
    }
  }
  return errors
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred.'
  }
  const msgs = Object.values(extractFieldErrors(error))
  return msgs.length > 0 ? msgs.join(' ') : (error.message || 'An unexpected error occurred.')
}
