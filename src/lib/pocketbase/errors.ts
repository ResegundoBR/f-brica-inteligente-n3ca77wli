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
  total: 'Total',
  description: 'Descrição',
  code: 'Código',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
}

const ERROR_CODE_LABELS: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_min_numeric: 'Valor muito baixo',
  validation_max_numeric: 'Valor muito alto',
}

export function formatDetailedErrorMessage(error: unknown, fallback?: string): string {
  if (!error || typeof error !== 'object') {
    return fallback || 'Verifique os dados informados.'
  }

  // Suporte tanto a ClientResponseError quanto a mocks de teste
  const responseData =
    (error as ClientResponseError).response?.data ||
    (error as { response?: { data?: Record<string, unknown> } }).response?.data

  if (responseData && typeof responseData === 'object') {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(responseData)) {
      const fieldLabel = FIELD_LABELS[field] || field
      if (detail && typeof detail === 'object') {
        const code = (detail as { code?: string }).code
        const msg = (detail as { message?: string }).message
        const friendlyMsg = (code && ERROR_CODE_LABELS[code]) || msg || 'Inválido'
        parts.push(`${fieldLabel}: ${friendlyMsg}`)
      } else if (typeof detail === 'string') {
        parts.push(`${fieldLabel}: ${detail}`)
      }
    }

    if (parts.length > 0) {
      return parts.join(' | ')
    }
  }

  const generalMsg =
    (error as ClientResponseError).message ||
    (error as { response?: { message?: string } }).response?.message ||
    (error instanceof Error ? error.message : undefined)

  return generalMsg || fallback || 'Verifique os dados informados.'
}
