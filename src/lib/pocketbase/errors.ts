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
  supplier: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  delivery_terms: 'Prazo de Entrega',
  payment_terms: 'Condição de Pagamento',
  delivery_type: 'Tipo de Frete/Entrega',
  total: 'Valor Total',
  unit_price: 'Valor Unitário',
  quantity: 'Quantidade',
  description: 'Descrição',
  code: 'Código',
}

const ERROR_MESSAGE_TRANSLATIONS: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  'Must be a valid datetime.': 'Data inválida',
  'Value cannot be blank.': 'Obrigatório',
  'Cannot be blank': 'Obrigatório',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error || typeof error !== 'object') {
    return fallbackMessage || 'Ocorreu um erro inesperado.'
  }

  const errObj = error as Record<string, any>
  const data = errObj.response?.data || errObj.data

  if (data && typeof data === 'object') {
    const fieldDetails: string[] = []

    for (const [field, detail] of Object.entries(data)) {
      const fieldName = FIELD_LABELS[field] || field
      let msg = ''

      if (detail && typeof detail === 'object') {
        const d = detail as Record<string, any>
        if (d.code && ERROR_MESSAGE_TRANSLATIONS[d.code]) {
          msg = ERROR_MESSAGE_TRANSLATIONS[d.code]
        } else if (d.message && ERROR_MESSAGE_TRANSLATIONS[d.message]) {
          msg = ERROR_MESSAGE_TRANSLATIONS[d.message]
        } else if (d.message) {
          msg = String(d.message)
        }
      } else if (typeof detail === 'string') {
        msg = ERROR_MESSAGE_TRANSLATIONS[detail] || detail
      }

      if (msg) {
        fieldDetails.push(`${fieldName}: ${msg}`)
      }
    }

    if (fieldDetails.length > 0) {
      return fieldDetails.join(' | ')
    }
  }

  if (errObj.response?.message && typeof errObj.response.message === 'string') {
    return errObj.response.message
  }

  if (errObj.message && typeof errObj.message === 'string') {
    return errObj.message
  }

  return fallbackMessage || 'Ocorreu um erro inesperado.'
}
