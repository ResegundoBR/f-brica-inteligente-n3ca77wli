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
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  oc_number: 'Número da OC',
  total: 'Total',
  description: 'Descrição',
  code: 'Código',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
}

const ERROR_MESSAGE_TRANSLATIONS: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  'Value cannot be blank.': 'Obrigatório',
  'Must be a valid datetime.': 'Data inválida',
}

export function formatDetailedErrorMessage(error: unknown, fallback = 'Erro na operação.'): string {
  if (!error || typeof error !== 'object') {
    return typeof error === 'string' && error.trim() ? error : fallback
  }

  const errObj = error as any
  const data = errObj.response?.data

  if (data && typeof data === 'object') {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const fieldLabel = FIELD_LABELS_PT[field] || field
      let reason = 'Inválido'
      if (detail && typeof detail === 'object') {
        const code = (detail as any).code
        const msg = (detail as any).message
        if (code && ERROR_MESSAGE_TRANSLATIONS[code]) {
          reason = ERROR_MESSAGE_TRANSLATIONS[code]
        } else if (msg && ERROR_MESSAGE_TRANSLATIONS[msg]) {
          reason = ERROR_MESSAGE_TRANSLATIONS[msg]
        } else if (msg) {
          reason = String(msg)
        }
      } else if (typeof detail === 'string') {
        reason = ERROR_MESSAGE_TRANSLATIONS[detail] || detail
      }
      parts.push(`${fieldLabel}: ${reason}`)
    }
    if (parts.length > 0) {
      return parts.join('; ')
    }
  }

  if (errObj.message && typeof errObj.message === 'string') {
    return errObj.message
  }

  return fallback
}
