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
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  total_price: 'Preço Total',
  payment_terms: 'Condição de Pagamento',
  delivery_type: 'Tipo de Frete',
  status: 'Status',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error || typeof error !== 'object') {
    return fallbackMessage || 'Erro inesperado.'
  }

  const errObj = error as any
  const responseData =
    errObj?.response?.data || (error instanceof ClientResponseError ? error.response?.data : null)

  if (responseData && typeof responseData === 'object' && Object.keys(responseData).length > 0) {
    const details: string[] = []
    for (const [field, val] of Object.entries(responseData)) {
      const label = FIELD_LABEL_MAP[field] || field
      const rawMsg =
        val && typeof val === 'object' && 'message' in val
          ? String((val as any).message)
          : String(val || '')

      let friendlyMsg = rawMsg
      if (rawMsg.includes('valid datetime') || rawMsg.includes('invalid_date')) {
        friendlyMsg = 'Data inválida'
      } else if (rawMsg.includes('cannot be blank') || rawMsg.includes('required')) {
        friendlyMsg = 'Obrigatório'
      }

      details.push(`${label}: ${friendlyMsg}`)
    }
    if (details.length > 0) {
      return details.join(' | ')
    }
  }

  if (errObj.message) return errObj.message
  return fallbackMessage || 'Erro inesperado.'
}
