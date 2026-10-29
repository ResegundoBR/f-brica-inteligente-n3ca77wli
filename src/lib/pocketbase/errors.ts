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

const FIELD_LABELS_PT: Record<string, string> = {
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  items: 'Itens',
  status: 'Status',
  code: 'Código',
  description: 'Descrição',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  total: 'Total',
}

const ERROR_MESSAGES_PT: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_not_unique: 'Já cadastrado',
  validation_min_value: 'Valor abaixo do mínimo permitido',
  validation_max_value: 'Valor acima do máximo permitido',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error) return fallbackMessage || 'Erro inesperado'

  if (
    error instanceof ClientResponseError ||
    (typeof error === 'object' && error !== null && 'response' in error)
  ) {
    const resp = (
      error as { response?: { data?: Record<string, unknown>; message?: string }; message?: string }
    ).response
    const data = resp?.data
    if (data && typeof data === 'object') {
      const parts: string[] = []
      for (const [field, detail] of Object.entries(data)) {
        const fieldLabel = FIELD_LABELS_PT[field] || field
        let msg = ''
        if (detail && typeof detail === 'object') {
          const detailObj = detail as { code?: string; message?: string }
          if (detailObj.code && ERROR_MESSAGES_PT[detailObj.code]) {
            msg = ERROR_MESSAGES_PT[detailObj.code]
          } else if (typeof detailObj.message === 'string') {
            msg = detailObj.message
          }
        } else if (typeof detail === 'string') {
          msg = detail
        }
        if (msg) {
          parts.push(`${fieldLabel}: ${msg}`)
        }
      }
      if (parts.length > 0) {
        return parts.join(' | ')
      }
    }
    if (resp?.message) return resp.message
    if ((error as { message?: string }).message) return (error as { message?: string }).message!
  }

  if (error instanceof Error) {
    return error.message
  }

  return fallbackMessage || 'Erro inesperado'
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred.'
  }
  const msgs = Object.values(extractFieldErrors(error))
  return msgs.length > 0 ? msgs.join(' ') : error.message || 'An unexpected error occurred.'
}
