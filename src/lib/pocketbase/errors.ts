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
  delivery_type: 'Tipo de Entrega',
  payment_terms: 'Condições de Pagamento',
  oc_number: 'Número da OC',
  total: 'Total',
  status: 'Status',
}

const ERROR_MESSAGES_PT: Record<string, string> = {
  validation_invalid_date: 'Data inválida',
  validation_required: 'Obrigatório',
  validation_not_unique: 'Já existe um registro com este valor',
}

export function formatDetailedErrorMessage(error: unknown, fallback = 'Erro na operação'): string {
  if (
    !(error instanceof ClientResponseError) &&
    !(error && typeof error === 'object' && 'response' in error)
  ) {
    return error instanceof Error ? error.message : fallback
  }

  const pbErr = error as { response?: { message?: string; data?: Record<string, any> } }
  const data = pbErr.response?.data
  if (data && typeof data === 'object' && Object.keys(data).length > 0) {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const fieldLabel = FIELD_LABELS_PT[field] || field
      let msg = ''
      if (detail && typeof detail === 'object') {
        const code = (detail as { code?: string }).code
        const rawMsg = (detail as { message?: string }).message
        if (code && ERROR_MESSAGES_PT[code]) {
          msg = ERROR_MESSAGES_PT[code]
        } else if (rawMsg) {
          msg = rawMsg
        }
      } else if (typeof detail === 'string') {
        msg = detail
      }
      parts.push(`${fieldLabel}: ${msg || 'Inválido'}`)
    }
    if (parts.length > 0) {
      return parts.join(', ')
    }
  }

  return pbErr.response?.message || (error instanceof Error ? error.message : fallback)
}
