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
  oc_number: 'Número da OC',
  total: 'Valor Total',
  payment_terms: 'Condição de Pagamento',
  delivery_terms: 'Prazo de Entrega',
  delivery_type: 'Tipo de Entrega',
}

const CODE_MESSAGES: Record<string, string> = {
  validation_invalid_date: 'Data inválida',
  validation_required: 'Obrigatório',
  validation_not_unique: 'Já existe um registro com este valor',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  const errObj = error as any
  const data =
    errObj?.response?.data || (error instanceof ClientResponseError ? error.response?.data : null)

  if (data && typeof data === 'object') {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const fieldLabel = FIELD_LABELS[field] || field
      const code = (detail as any)?.code
      const msg = (detail as any)?.message
      const friendlyMsg = (code && CODE_MESSAGES[code]) || msg || 'Valor inválido'
      parts.push(`${fieldLabel}: ${friendlyMsg}`)
    }
    if (parts.length > 0) {
      return parts.join('\n')
    }
  }

  if (errObj?.response?.message) {
    return errObj.response.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage || 'Ocorreu um erro ao processar a requisição.'
}
