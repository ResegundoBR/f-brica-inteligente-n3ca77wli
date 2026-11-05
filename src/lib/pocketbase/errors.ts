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
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  total: 'Valor Total',
  oc_number: 'Número da OC',
}

const ERROR_CODE_LABELS: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_not_unique: 'Já cadastrado',
  validation_min_numeric_value: 'Valor abaixo do mínimo',
  validation_max_numeric_value: 'Valor acima do máximo',
}

export function formatDetailedErrorMessage(error: unknown, fallback = 'Erro na operação'): string {
  if (!error) return fallback

  const resp =
    (error as any)?.response || (error instanceof ClientResponseError ? error.response : null)

  const data = resp?.data
  if (data && typeof data === 'object') {
    const lines: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const fieldLabel = FIELD_LABELS[field] || field
      let msg = ''
      if (detail && typeof detail === 'object') {
        const code = (detail as any).code
        if (code && ERROR_CODE_LABELS[code]) {
          msg = ERROR_CODE_LABELS[code]
        } else if (typeof (detail as any).message === 'string') {
          msg = (detail as any).message
        }
      } else if (typeof detail === 'string') {
        msg = detail
      }
      if (msg) {
        lines.push(`${fieldLabel}: ${msg}`)
      }
    }
    if (lines.length > 0) {
      return lines.join(' · ')
    }
  }

  if (resp?.message && typeof resp.message === 'string') {
    return resp.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}
