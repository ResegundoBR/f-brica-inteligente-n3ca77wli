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
  delivery_terms: 'Condições de Entrega',
  delivery_type: 'Tipo de Entrega',
  total: 'Total',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  description: 'Descrição',
  code: 'Código',
  status: 'Status',
}

const ERROR_MESSAGE_TRANSLATIONS: Record<string, string> = {
  'Must be a valid datetime.': 'Data inválida',
  'Value cannot be blank.': 'Obrigatório',
  'Cannot be blank': 'Obrigatório',
}

export function formatDetailedErrorMessage(error: unknown, fallback = 'Erro na operação'): string {
  if (!error || typeof error !== 'object') {
    return String(error || fallback)
  }

  const errObj = error as {
    response?: { message?: string; data?: Record<string, { code?: string; message?: string }> }
    message?: string
  }
  const data = errObj.response?.data

  if (data && typeof data === 'object' && Object.keys(data).length > 0) {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const fieldLabel = FIELD_LABELS_PT[field] || field
      const rawMsg = detail?.message || detail?.code || 'Inválido'
      const friendlyMsg = ERROR_MESSAGE_TRANSLATIONS[rawMsg] || rawMsg
      parts.push(`${fieldLabel}: ${friendlyMsg}`)
    }
    if (parts.length > 0) {
      return parts.join(' | ')
    }
  }

  return errObj.response?.message || errObj.message || fallback
}
