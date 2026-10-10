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
  oc_number: 'Número da OC',
  total: 'Valor Total',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  code: 'Código',
  description: 'Descrição',
  order_id: 'Ordem de Produção',
}

const ERROR_CODE_LABELS_PT: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_min_value: 'Valor abaixo do mínimo permitido',
  validation_not_unique: 'Já cadastrado',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error || typeof error !== 'object') {
    return fallbackMessage || 'Ocorreu um erro inesperado.'
  }

  const errObj = error as {
    response?: { message?: string; data?: Record<string, { code?: string; message?: string }> }
    message?: string
  }
  const data = errObj.response?.data

  if (data && typeof data === 'object') {
    const fieldDetails: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      if (detail && typeof detail === 'object') {
        const label = FIELD_LABELS_PT[field] || field
        const translatedMsg =
          (detail.code && ERROR_CODE_LABELS_PT[detail.code]) || detail.message || 'Inválido'
        fieldDetails.push(`${label}: ${translatedMsg}`)
      }
    }
    if (fieldDetails.length > 0) {
      return fieldDetails.join(' | ')
    }
  }

  return (
    errObj.response?.message ||
    errObj.message ||
    fallbackMessage ||
    'Ocorreu um erro ao processar a requisição.'
  )
}
