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
  supplier_id: 'Fornecedor',
  delivery_type: 'Tipo de Entrega',
  payment_terms: 'Condição de Pagamento',
  delivery_terms: 'Condições de Entrega',
  code: 'Código',
  description: 'Descrição',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  total: 'Total',
}

export function formatDetailedErrorMessage(error: unknown, fallback?: string): string {
  if (!error || typeof error !== 'object') {
    return fallback || 'Ocorreu um erro inesperado.'
  }

  const errObj = error as any
  const responseData = errObj?.response?.data || errObj?.data

  if (responseData && typeof responseData === 'object') {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(responseData)) {
      if (!detail || typeof detail !== 'object') continue
      const d = detail as any
      const label = FIELD_LABELS[field] || field
      let msg = d.message || ''

      if (d.code === 'validation_invalid_date' || /valid datetime/i.test(msg)) {
        msg = 'Data inválida'
      } else if (d.code === 'validation_required' || /cannot be blank/i.test(msg)) {
        msg = 'Obrigatório'
      }

      parts.push(`${label}: ${msg}`)
    }

    if (parts.length > 0) {
      return parts.join(' | ')
    }
  }

  const mainMsg = errObj?.response?.message || errObj?.message
  return mainMsg || fallback || 'Ocorreu um erro inesperado.'
}
