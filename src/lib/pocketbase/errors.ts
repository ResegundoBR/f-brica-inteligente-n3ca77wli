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

const FIELD_LABELS_PT: Record<string, string> = {
  expected_date: 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  delivery_terms: 'Frete / Condições de Entrega',
  status: 'Status',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
}

const ERROR_MESSAGES_PT: Record<string, string> = {
  validation_invalid_date: 'Data inválida',
  validation_required: 'Obrigatório',
  validation_missing_required_field: 'Obrigatório',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallbackMessage = 'Verifique os dados informados.',
): string {
  if (!error || typeof error !== 'object') {
    return fallbackMessage
  }

  const errObj = error as Record<string, any>
  const response =
    errObj.response || (errObj instanceof ClientResponseError ? errObj.response : null)
  const data = response?.data

  if (data && typeof data === 'object') {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const fieldLabel = FIELD_LABELS_PT[field] || field
      let msg = ''
      if (typeof detail === 'string') {
        msg = detail
      } else if (detail && typeof detail === 'object') {
        const d = detail as Record<string, any>
        if (d.code && ERROR_MESSAGES_PT[d.code]) {
          msg = ERROR_MESSAGES_PT[d.code]
        } else if (d.message) {
          msg = String(d.message)
        }
      }
      if (msg) {
        parts.push(`${fieldLabel}: ${msg}`)
      }
    }
    if (parts.length > 0) {
      return parts.join(', ')
    }
  }

  if (response?.message) {
    return String(response.message)
  }

  if (errObj.message && typeof errObj.message === 'string') {
    return errObj.message
  }

  return fallbackMessage
}
