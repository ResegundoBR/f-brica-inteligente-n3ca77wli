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
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  status: 'Status',
  total: 'Valor Total',
  oc_number: 'Número da OC',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  code: 'Código',
  description: 'Descrição',
}

const ERROR_CODES_PT: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_invalid_email: 'E-mail inválido',
  validation_min_value: 'Valor abaixo do mínimo',
  validation_max_value: 'Valor acima do máximo',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error || typeof error !== 'object') {
    return 'Erro inesperado ao processar solicitação.'
  }

  const errObj = error as {
    response?: { message?: string; data?: Record<string, unknown> }
    message?: string
  }
  const data = errObj.response?.data

  if (data && typeof data === 'object') {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const fieldLabel = FIELD_LABELS_PT[field] || field
      if (detail && typeof detail === 'object') {
        const d = detail as { code?: string; message?: string }
        const translatedMsg = (d.code && ERROR_CODES_PT[d.code]) || d.message || 'Inválido'
        parts.push(`${fieldLabel}: ${translatedMsg}`)
      } else if (typeof detail === 'string') {
        parts.push(`${fieldLabel}: ${detail}`)
      }
    }
    if (parts.length > 0) {
      return parts.join('. ')
    }
  }

  if (errObj.response?.message) {
    return errObj.response.message
  }

  if (errObj.message) {
    return errObj.message
  }

  return fallbackMessage || 'Erro inesperado ao processar solicitação.'
}
