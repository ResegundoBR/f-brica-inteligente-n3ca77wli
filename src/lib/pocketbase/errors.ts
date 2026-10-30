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
  total: 'Valor Total',
  payment_terms: 'Condições de Pagamento',
  delivery_terms: 'Condições de Entrega',
  delivery_type: 'Tipo de Entrega',
  oc_number: 'Número da OC',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  const errObj = error as any
  const data =
    errObj?.response?.data || (errObj instanceof ClientResponseError ? errObj.response?.data : null)

  if (data && typeof data === 'object') {
    const details: string[] = []
    for (const [field, val] of Object.entries(data)) {
      const label = FIELD_LABELS_PT[field] || field
      const valObj = val as any
      const code = valObj?.code || ''
      let msg = valObj?.message || ''

      if (code === 'validation_invalid_date' || /datetime/i.test(msg)) {
        msg = 'Data inválida'
      } else if (code === 'validation_required' || /cannot be blank/i.test(msg)) {
        msg = 'Obrigatório'
      }

      details.push(`${label}: ${msg}`)
    }
    if (details.length > 0) {
      return details.join(' | ')
    }
  }

  const baseMsg =
    errObj?.response?.message || errObj?.message || fallbackMessage || 'Erro inesperado.'
  return fallbackMessage ? `${fallbackMessage}: ${baseMsg}` : baseMsg
}
