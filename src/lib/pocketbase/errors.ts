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

// NÃO REMOVER formatDetailedErrorMessage: usado por Suprimentos (ordens-compra, SmartReceiveDialog,
// EntradaIntegralOcModal etc.) e pelo teste src/services/ordens-compra.test.ts. Já foi apagada por
// engano 3 vezes e o build/teste quebrou cada vez. Aceita Record (mock simples) ou ClientResponseError.
const FIELD_LABELS: Record<string, string> = {
  expected_date: 'Previsão de Entrega',
  'data.delivery_forecast': 'Previsão de Entrega',
  delivery_forecast: 'Previsão de Entrega',
  supplier: 'Fornecedor',
}

// NÃO REMOVER (ver comentário acima).
function friendlyFieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field]
  const dotted = field.replace(/\./g, '.')
  if (FIELD_LABELS[dotted]) return FIELD_LABELS[dotted]
  return field
}

// NÃO REMOVER (ver comentário acima).
function friendlyFieldMessage(field: string, message: string): string {
  const lower = (message || '').toLowerCase()
  if (field === 'expected_date' || /delivery_forecast/.test(field)) {
    // 'Must be a valid datetime.' não contém 'invalid' — casa por 'valid' (mas não 'blank')
    if (/invalid|valid/.test(lower) && !/blank|required|empty/.test(lower)) return 'Data inválida'
    if (lower.includes('blank') || lower.includes('required')) return 'Obrigatório'
  }
  if (lower.includes('blank') || lower.includes('required') || lower.includes('empty')) {
    return 'Obrigatório'
  }
  if (lower.includes('invalid')) return 'Valor inválido'
  return message
}

// NÃO REMOVER (ver comentário acima).
export function formatDetailedErrorMessage(error: unknown, fallback?: string): string {
  if (!error || typeof error !== 'object') return fallback || 'Ocorreu um erro inesperado.'
  const response = (error as { response?: unknown }).response
  const data =
    response && typeof response === 'object'
      ? (response as { data?: unknown }).data
      : (error as { data?: unknown }).data
  if (!data || typeof data !== 'object') return fallback || 'Ocorreu um erro inesperado.'

  const parts: string[] = []
  for (const [field, detail] of Object.entries(data as Record<string, unknown>)) {
    if (detail && typeof detail === 'object' && 'message' in (detail as Record<string, unknown>)) {
      const rawMessage = String((detail as { message: unknown }).message ?? '')
      const label = friendlyFieldLabel(field)
      const message = friendlyFieldMessage(field, rawMessage)
      parts.push(`${label}: ${message}`)
    }
  }
  return parts.length > 0 ? parts.join(' ') : fallback || 'Ocorreu um erro inesperado.'
}
