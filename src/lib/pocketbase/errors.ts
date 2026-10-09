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
  supplier_id: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  total: 'Total',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  description: 'Descrição',
  code: 'Código',
}

export function formatDetailedErrorMessage(error: unknown, fallback = 'Erro na operação.'): string {
  if (!error) return fallback

  const anyErr = error as any
  const responseData =
    anyErr?.response?.data || (anyErr instanceof ClientResponseError ? anyErr.response?.data : null)

  if (responseData && typeof responseData === 'object') {
    const parts: string[] = []
    for (const [key, val] of Object.entries(responseData)) {
      const label = FIELD_LABEL_MAP[key] || key
      let msg = 'Inválido'
      if (typeof val === 'object' && val !== null) {
        const v = val as { code?: string; message?: string }
        if (
          v.code === 'validation_invalid_date' ||
          v.message?.toLowerCase().includes('datetime') ||
          v.message?.toLowerCase().includes('date')
        ) {
          msg = 'Data inválida'
        } else if (
          v.code === 'validation_required' ||
          v.message?.toLowerCase().includes('cannot be blank') ||
          v.message?.toLowerCase().includes('required')
        ) {
          msg = 'Obrigatório'
        } else if (v.message) {
          msg = v.message
        }
      } else if (typeof val === 'string') {
        msg = val
      }
      parts.push(`${label}: ${msg}`)
    }
    if (parts.length > 0) {
      return parts.join('; ')
    }
  }

  if (anyErr?.response?.message) return anyErr.response.message
  if (anyErr?.message) return anyErr.message
  return fallback
}
