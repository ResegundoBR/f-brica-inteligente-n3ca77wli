import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ClientResponseError)) return {}
  const data = error.response?.data
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
  return msgs.length > 0 ? msgs.join(' ') : error.message || 'An unexpected error occurred.'
}

// NÃO REMOVER — usado por Suprimentos (ComprasPage, EditOrdemCompraModal, OrdemCompraModal)
// e por src/services/ordens-compra.test.ts. Já foi apagado 3x manualmente e 3x quebrou o build.
const FIELD_LABELS: Record<string, string> = {
  expected_date: 'Previsão de Entrega',
  delivery_forecast: 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  code: 'Código',
  description: 'Descrição',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  total: 'Total',
  oc_number: 'Número da OC',
}

function friendlyFieldMessage(message: string): string {
  if (/valid datetime|invalid date/i.test(message)) return 'Data inválida'
  if (/cannot be blank|required|empty/i.test(message)) return 'Obrigatório'
  return message
}

export function formatDetailedErrorMessage(error: unknown, fallback?: string): string {
  // Duck-typing: aceita ClientResponseError OU objeto com shape { response: { message, data } }
  const anyErr = error as { response?: { message?: string; data?: unknown }; message?: string }
  const data = anyErr?.response?.data
  const fieldErrors: FieldErrors = {}
  if (data && typeof data === 'object') {
    for (const [field, detail] of Object.entries(data as Record<string, unknown>)) {
      if (
        detail &&
        typeof detail === 'object' &&
        'message' in detail &&
        typeof (detail as { message: unknown }).message === 'string'
      ) {
        fieldErrors[field] = (detail as { message: string }).message
      }
    }
  }
  const entries = Object.entries(fieldErrors)
  if (entries.length > 0) {
    return entries
      .map(([field, msg]) => `${FIELD_LABELS[field] || field}: ${friendlyFieldMessage(msg)}`)
      .join(' ')
  }
  return anyErr?.message || fallback || 'An unexpected error occurred.'
}
