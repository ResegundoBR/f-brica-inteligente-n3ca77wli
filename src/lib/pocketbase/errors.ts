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
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  delivery_terms: 'Condições de Entrega',
  status: 'Status',
  total_amount: 'Valor Total',
  payment_terms: 'Condições de Pagamento',
  notes: 'Observações',
  order_number: 'Número da OC',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallback = 'Erro ao processar a requisição',
): string {
  if (!error) return fallback

  const errObj = error as any
  const responseData =
    errObj?.response?.data || (error instanceof ClientResponseError ? error.response?.data : null)

  if (responseData && typeof responseData === 'object' && Object.keys(responseData).length > 0) {
    const lines: string[] = []
    for (const [key, val] of Object.entries(responseData)) {
      const fieldName = FIELD_LABELS_PT[key] || key
      let msg = 'Inválido'
      if (typeof val === 'string') {
        msg = val
      } else if (val && typeof val === 'object') {
        const v = val as { message?: string; code?: string }
        if (v.code === 'validation_required' || (v.message && /blank|required/i.test(v.message))) {
          msg = 'Obrigatório'
        } else if (v.code === 'validation_invalid_date' || (v.message && /date/i.test(v.message))) {
          msg = 'Data inválida'
        } else if (v.message) {
          msg = v.message
        }
      }
      lines.push(`${fieldName}: ${msg}`)
    }
    if (lines.length > 0) {
      return lines.join('; ')
    }
  }

  if (errObj?.response?.message) {
    return errObj.response.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}
