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
  expected_date: 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  order_id: 'Ordem de Produção',
  unit_price: 'Preço Unitário',
  quantity: 'Quantidade',
  total_value: 'Valor Total',
  payment_terms: 'Condições de Pagamento',
  delivery_terms: 'Condições de Entrega',
  freight: 'Frete',
  status: 'Status',
}

const MESSAGE_TRANSLATION_MAP: Record<string, string> = {
  'Must be a valid datetime.': 'Data inválida',
  'Value cannot be blank.': 'Obrigatório',
  'The value is required.': 'Obrigatório',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallbackMessage = 'Erro na operação.',
): string {
  if (!error) return fallbackMessage
  const errAny = error as {
    response?: {
      message?: string
      data?: Record<string, { code?: string; message?: string } | string>
    }
    message?: string
  }

  const data = errAny?.response?.data
  if (data && typeof data === 'object') {
    const details: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const fieldLabel = FIELD_LABEL_MAP[field] || field
      let rawMsg = ''
      if (typeof detail === 'string') {
        rawMsg = detail
      } else if (detail && typeof detail === 'object' && detail.message) {
        rawMsg = detail.message
      }
      const friendlyMsg = MESSAGE_TRANSLATION_MAP[rawMsg] || rawMsg || 'inválido'
      details.push(`${fieldLabel}: ${friendlyMsg}`)
    }
    if (details.length > 0) {
      return details.join('. ')
    }
  }

  return errAny?.response?.message || errAny?.message || fallbackMessage
}
