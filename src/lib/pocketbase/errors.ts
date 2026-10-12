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
  oc_number: 'Número da OC',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  total: 'Total',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  code: 'Código',
  description: 'Descrição',
}

const MESSAGE_TRANSLATIONS: Record<string, string> = {
  'Must be a valid datetime.': 'Data inválida',
  'Value cannot be blank.': 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_required: 'Obrigatório',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallback = 'Falha ao processar solicitação.',
): string {
  if (!error || typeof error !== 'object') return fallback

  const response = (error as { response?: { message?: string; data?: Record<string, unknown> } })
    .response
  const data = response?.data

  if (data && typeof data === 'object' && Object.keys(data).length > 0) {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const fieldName = FIELD_LABELS[field] || field
      let msg = ''

      if (detail && typeof detail === 'object') {
        const d = detail as { message?: string; code?: string }
        if (d.message && MESSAGE_TRANSLATIONS[d.message]) {
          msg = MESSAGE_TRANSLATIONS[d.message]
        } else if (d.code && MESSAGE_TRANSLATIONS[d.code]) {
          msg = MESSAGE_TRANSLATIONS[d.code]
        } else if (d.message) {
          msg = d.message
        }
      } else if (typeof detail === 'string') {
        msg = MESSAGE_TRANSLATIONS[detail] || detail
      }

      if (msg) {
        parts.push(`${fieldName}: ${msg}`)
      } else {
        parts.push(`${fieldName} inválido`)
      }
    }

    if (parts.length > 0) {
      return parts.join(' | ')
    }
  }

  if (response?.message) return response.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}
