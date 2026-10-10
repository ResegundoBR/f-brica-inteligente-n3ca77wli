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

const FIELD_LABELS: Record<string, string> = {
  expected_date: 'Previsão de Entrega',
  supplier: 'Fornecedor',
  oc_number: 'Número da OC',
  total: 'Total',
  status: 'Status',
  payment_terms: 'Condições de Pagamento',
  delivery_terms: 'Condições de Entrega',
  delivery_type: 'Tipo de Entrega',
}

const ERROR_TRANSLATIONS: Record<string, string> = {
  validation_invalid_date: 'Data inválida',
  validation_required: 'Obrigatório',
  validation_not_unique: 'Já cadastrado',
}

export function formatDetailedErrorMessage(error: unknown, fallback = 'Erro na operação'): string {
  if (!error) return fallback
  const errObj = error as {
    response?: { message?: string; data?: Record<string, any> }
    message?: string
  }
  const data = errObj.response?.data
  if (data && typeof data === 'object' && Object.keys(data).length > 0) {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const fieldLabel = FIELD_LABELS[field] || field
      let msg = ''
      if (detail && typeof detail === 'object') {
        const code = detail.code
        msg = (code && ERROR_TRANSLATIONS[code]) || detail.message || 'Inválido'
      } else if (typeof detail === 'string') {
        msg = detail
      }
      parts.push(`${fieldLabel}: ${msg}`)
    }
    if (parts.length > 0) return parts.join(' | ')
  }

  if (errObj.response?.message) return errObj.response.message
  if (errObj.message) return errObj.message
  return fallback
}
