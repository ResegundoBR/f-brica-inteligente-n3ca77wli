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

// NÃO REMOVER formatDetailedErrorMessage abaixo — usado por ComprasPage,
// EditOrdemCompraModal, OrdemCompraModal e services/ordens-compra.test.ts
// (já foi apagado 3x manualmente e quebrou o build cada vez).

const FIELD_LABELS: Record<string, string> = {
  expected_date: 'Previsão de Entrega',
  'data.delivery_forecast': 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  delivery_terms: 'Condições de Entrega',
  oc_number: 'Número da OC',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  total: 'Total',
}

const CODE_MESSAGES: Record<string, string> = {
  required: 'Obrigatório',
  invalid: 'Valor inválido',
  invalid_date: 'Data inválida',
  invalid_value: 'Valor inválido',
  length_out_of_range: 'Valor fora do intervalo permitido',
  not_unique: 'Valor já existe',
  format: 'Formato inválido',
  missing_required_value: 'Obrigatório',
}

function friendlyCodeMessage(code: string, rawMessage?: unknown): string {
  const suffix = code.startsWith('validation_') ? code.slice('validation_'.length) : code
  const mapped = CODE_MESSAGES[suffix]
  if (mapped) return mapped
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage
  return 'Valor inválido'
}

/**
 * Formata um erro de validação do PocketBase em mensagem amigável em
 * português ("Previsão de Entrega: Data inválida; Fornecedor: Obrigatório").
 * `fallback` aceita uma string padrão OU um Record de campo → rótulo amigável
 * que substitui os rótulos padrão (FIELD_LABELS). Extrai os erros de qualquer
 * objeto que tenha `response.data` (ClientResponseError ou mock de teste).
 */
export function formatDetailedErrorMessage(
  error: unknown,
  fallback?: string | FieldErrors,
): string {
  const data: unknown =
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response
      ? (error.response as { data?: unknown }).data
      : undefined

  if (!data || typeof data !== 'object') {
    if (typeof fallback === 'string') return fallback
    return getErrorMessage(error)
  }

  const customLabels = typeof fallback === 'object' ? fallback : undefined
  const parts: string[] = []
  for (const [field, detail] of Object.entries(data as Record<string, unknown>)) {
    if (!detail || typeof detail !== 'object') continue
    const d = detail as { code?: unknown; message?: unknown }
    const label = customLabels?.[field] ?? FIELD_LABELS[field] ?? field
    const code = typeof d.code === 'string' ? d.code : ''
    const msg = friendlyCodeMessage(code, typeof d.message === 'string' ? d.message : undefined)
    parts.push(`${label}: ${msg}`)
  }
  if (parts.length === 0) {
    if (typeof fallback === 'string') return fallback
    return getErrorMessage(error)
  }
  return parts.join('; ')
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred.'
  }
  const msgs = Object.values(extractFieldErrors(error))
  return msgs.length > 0 ? msgs.join(' ') : error.message || 'An unexpected error occurred.'
}
