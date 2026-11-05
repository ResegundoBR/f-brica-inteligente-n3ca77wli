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

const FIELD_LABEL_MAP: Record<string, string> = {
  supplier: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  oc_number: 'Número da OC',
  total: 'Valor Total',
  unit_price: 'Preço Unitário',
  quantity: 'Quantidade',
  code: 'Código',
  description: 'Descrição',
  order_id: 'OP vinculada',
}

const ERROR_MESSAGE_TRANSLATIONS: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  'Value cannot be blank.': 'Obrigatório',
  'Must be a valid datetime.': 'Data inválida',
  'Must be a valid number.': 'Número inválido',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallback = 'Verifique os dados informados.',
): string {
  if (!error || typeof error !== 'object') {
    return typeof error === 'string' && error.trim() ? error : fallback
  }

  // PocketBase ClientResponseError ou mock com response.data
  const anyErr = error as {
    response?: { message?: string; data?: Record<string, unknown> }
    message?: string
  }

  const data = anyErr.response?.data
  if (data && typeof data === 'object') {
    const fieldDetails: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      if (!detail) continue
      const label = FIELD_LABEL_MAP[field] || field
      let reason = 'Inválido'
      if (typeof detail === 'object') {
        const code = (detail as { code?: string }).code
        const msg = (detail as { message?: string }).message
        if (code && ERROR_MESSAGE_TRANSLATIONS[code]) {
          reason = ERROR_MESSAGE_TRANSLATIONS[code]
        } else if (msg && ERROR_MESSAGE_TRANSLATIONS[msg]) {
          reason = ERROR_MESSAGE_TRANSLATIONS[msg]
        } else if (msg) {
          reason = msg
        }
      } else if (typeof detail === 'string') {
        reason = ERROR_MESSAGE_TRANSLATIONS[detail] || detail
      }
      fieldDetails.push(`${label}: ${reason}`)
    }
    if (fieldDetails.length > 0) {
      return fieldDetails.join(', ')
    }
  }

  const baseMessage = anyErr.response?.message || anyErr.message
  if (baseMessage && typeof baseMessage === 'string' && baseMessage.trim()) {
    return baseMessage
  }

  return fallback
}
