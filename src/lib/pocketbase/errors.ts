import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

export const DEFAULT_FIELD_LABELS: Record<string, string> = {
  expected_date: 'Previsão de Entrega',
  'data.delivery_forecast': 'Previsão de Entrega',
  delivery_forecast: 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  oc_number: 'Número da OC',
  total: 'Valor Total',
  payment_terms: 'Condição de Pagamento',
  delivery_terms: 'Termos de Entrega',
  delivery_type: 'Tipo de Entrega',
  status: 'Status',
}

const COMMON_ERROR_TRANSLATIONS: Array<[RegExp, string]> = [
  [/Must be a valid datetime/i, 'Data inválida'],
  [/Value cannot be blank/i, 'Obrigatório'],
  [/Cannot be blank/i, 'Obrigatório'],
  [/Is required/i, 'Obrigatório'],
  [/Must be numeric/i, 'Deve ser numérico'],
  [/Must be greater than/i, 'Valor abaixo do mínimo'],
  [/Must be unique/i, 'Já cadastrado'],
]

function translateValidationMessage(msg: string): string {
  for (const [pattern, translation] of COMMON_ERROR_TRANSLATIONS) {
    if (pattern.test(msg)) {
      return translation
    }
  }
  return msg
}

export function extractFieldErrors(error: unknown): FieldErrors {
  const errObj = error as { response?: { data?: Record<string, unknown> } } | null
  const data = errObj?.response?.data
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
    } else if (typeof detail === 'string') {
      errors[field] = detail
    }
  }
  return errors
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallbackOrCustomLabels?: string | Record<string, string>,
): string {
  const customLabels: Record<string, string> =
    typeof fallbackOrCustomLabels === 'object' && fallbackOrCustomLabels !== null
      ? fallbackOrCustomLabels
      : {}
  const fallbackMessage: string =
    typeof fallbackOrCustomLabels === 'string'
      ? fallbackOrCustomLabels
      : 'Verifique os dados informados.'

  const fieldErrors = extractFieldErrors(error)
  const entries = Object.entries(fieldErrors)

  if (entries.length > 0) {
    const lines = entries.map(([field, rawMsg]) => {
      const label = customLabels[field] || DEFAULT_FIELD_LABELS[field] || field
      const translated = translateValidationMessage(rawMsg)
      return `${label}: ${translated}`
    })
    return lines.join('; ')
  }

  if (error instanceof ClientResponseError) {
    return error.message || fallbackMessage
  }

  const maybeMsg =
    (error as { response?: { message?: string }; message?: string })?.response?.message ||
    (error as { message?: string })?.message

  if (maybeMsg && typeof maybeMsg === 'string') {
    return maybeMsg
  }

  return fallbackMessage
}

export function getErrorMessage(error: unknown): string {
  const fieldErrors = extractFieldErrors(error)
  const msgs = Object.values(fieldErrors)
  if (msgs.length > 0) {
    return msgs.join(' ')
  }
  if (error instanceof ClientResponseError) {
    return error.message || 'An unexpected error occurred.'
  }
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}
