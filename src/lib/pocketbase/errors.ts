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
  payment_terms: 'Condição de Pagamento',
  delivery_type: 'Tipo de Frete/Entrega',
  delivery_terms: 'Prazo de Entrega',
  oc_number: 'Número da OC',
  total: 'Valor Total',
  observations: 'Observações',
}

const ERROR_TRANSLATIONS_PT: Record<string, string> = {
  validation_invalid_date: 'Data inválida',
  validation_required: 'Obrigatório',
  validation_not_unique: 'Já cadastrado / duplicado',
}

export function formatDetailedErrorMessage(error: unknown, fallbackHeader?: string): string {
  const errObj = error as any
  const data =
    errObj?.response?.data || (error instanceof ClientResponseError ? error.response?.data : null)

  if (data && typeof data === 'object' && Object.keys(data).length > 0) {
    const details: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const fieldLabel = FIELD_LABELS_PT[field] || field
      let msg = ''
      if (detail && typeof detail === 'object') {
        const d = detail as any
        msg = ERROR_TRANSLATIONS_PT[d.code] || d.message || 'Inválido'
      } else if (typeof detail === 'string') {
        msg = detail
      }
      if (msg) {
        details.push(`${fieldLabel}: ${msg}`)
      }
    }
    if (details.length > 0) {
      const header = fallbackHeader ? `${fallbackHeader} - ` : ''
      return `${header}${details.join(', ')}`
    }
  }

  return getErrorMessage(error)
}
