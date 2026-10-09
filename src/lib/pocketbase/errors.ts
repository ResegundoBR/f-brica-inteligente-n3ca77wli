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
  unit_price: 'Preço Unitário',
  quantity: 'Quantidade',
  code: 'Código',
  description: 'Descrição',
  status: 'Status',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Frete',
  freight_value: 'Valor do Frete',
}

const ERROR_MESSAGE_TRANSLATIONS: Record<string, string> = {
  'Must be a valid datetime.': 'Data inválida',
  'Value cannot be blank.': 'Obrigatório',
  'Cannot be blank.': 'Obrigatório',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallbackMessage = 'Verifique os dados informados.',
): string {
  if (!error || typeof error !== 'object') return fallbackMessage

  const errObj = error as {
    response?: {
      message?: string
      data?: Record<string, { code?: string; message?: string } | string>
    }
    data?: Record<string, { code?: string; message?: string } | string>
    message?: string
  }

  const fieldData = errObj.response?.data || errObj.data
  if (fieldData && typeof fieldData === 'object' && Object.keys(fieldData).length > 0) {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(fieldData)) {
      const label = FIELD_LABELS[field] || field
      let msg = ''
      if (typeof detail === 'string') {
        msg = detail
      } else if (detail && typeof detail === 'object' && detail.message) {
        msg = detail.message
      }
      const translatedMsg = ERROR_MESSAGE_TRANSLATIONS[msg] || msg || 'Inválido'
      parts.push(`${label}: ${translatedMsg}`)
    }
    if (parts.length > 0) {
      return parts.join('; ')
    }
  }

  return errObj.response?.message || errObj.message || fallbackMessage
}
