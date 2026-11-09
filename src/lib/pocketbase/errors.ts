import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

function getResponseData(error: unknown): unknown {
  // Suporta ClientResponseError real e mocks de teste ({ response: { data: ... } }).
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: unknown }).response
    if (response && typeof response === 'object' && 'data' in response) {
      return (response as { data?: unknown }).data
    }
  }
  return undefined
}

function getBaseMessage(error: unknown): string | undefined {
  if (error instanceof ClientResponseError) return error.message
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: unknown }).response
    if (response && typeof response === 'object' && 'message' in response) {
      const m = (response as { message?: unknown }).message
      if (typeof m === 'string') return m
    }
  }
  return undefined
}

export function extractFieldErrors(error: unknown): FieldErrors {
  const data = getResponseData(error)
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
  if (error instanceof ClientResponseError) {
    const msgs = Object.values(extractFieldErrors(error))
    if (msgs.length > 0) return msgs.join(' ')
    return error.message || 'An unexpected error occurred.'
  }
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

const DEFAULT_FIELD_LABELS: FieldErrors = {
  expected_date: 'Previsão de Entrega',
  'data.delivery_forecast': 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  oc_number: 'Nº da OC',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  total: 'Total',
  quantity: 'Quantidade',
  unit_price: 'Valor Unitário',
  description: 'Descrição',
}

const MESSAGE_TRANSLATIONS: [RegExp, string][] = [
  [/must be a valid datetime/i, 'Data inválida'],
  [/invalid date/i, 'Data inválida'],
  [/cannot be blank|value is required|missing required/i, 'Obrigatório'],
  [/must be a valid email/i, 'E-mail inválido'],
  [/expected number/i, 'Deve ser um número'],
  [/expected integer/i, 'Deve ser um número inteiro'],
  [/value must be greater/i, 'Valor deve ser maior'],
  [/value must be less/i, 'Valor deve ser menor'],
]

function translateFieldMessage(message: string): string {
  for (const [pattern, translated] of MESSAGE_TRANSLATIONS) {
    if (pattern.test(message)) return translated
  }
  return message
}

/**
 * Formata um erro do PocketBase em uma mensagem amigável em português.
 * O 2º argumento é opcional: um prefixo textual (ex.: título do toast)
 * OU um mapa de labels adicional para sobrescrever/complementar os padrões.
 */
export function formatDetailedErrorMessage(
  error: unknown,
  prefix?: string | Record<string, string>,
): string {
  const extraLabels = prefix && typeof prefix === 'object' ? prefix : undefined
  const labels = { ...DEFAULT_FIELD_LABELS, ...(extraLabels ?? {}) }
  const header = typeof prefix === 'string' && prefix.trim() ? prefix.trim() : undefined

  const fieldErrors = extractFieldErrors(error)
  const details: string[] = Object.entries(fieldErrors).map(([field, message]) => {
    const label = labels[field] ?? field
    return `${label}: ${translateFieldMessage(message)}`
  })

  const baseMessage = getBaseMessage(error)
  const parts = details.length > 0 ? details : baseMessage ? [baseMessage] : []
  if (parts.length === 0) {
    return header ?? 'Ocorreu um erro inesperado.'
  }
  return header ? `${header}: ${parts.join(' | ')}` : parts.join(' | ')
}
