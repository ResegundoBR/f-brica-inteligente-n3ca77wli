import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!error || typeof error !== 'object') return {}
  const res = (error as { response?: { data?: unknown } }).response
  const data = res?.data
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
  delivery_terms: 'Condição de Frete',
  payment_terms: 'Condição de Pagamento',
  delivery_type: 'Tipo de Entrega',
  total: 'Valor Total',
  itens: 'Itens da OC',
  oc_number: 'Número da OC',
  notes: 'Observações',
  discount: 'Desconto',
  shipping_cost: 'Frete',
  order_id: 'OP',
  order_number: 'Número do Pedido',
  category: 'Categoria',
  category_id: 'Categoria',
  unit_cost: 'Custo Unitário',
  quantity: 'Quantidade',
  description: 'Descrição',
}

const ERROR_CODE_LABELS: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_not_empty: 'Não pode ser vazio',
  validation_invalid_date: 'Data inválida',
  validation_invalid_datetime: 'Data/hora inválida',
  validation_invalid_number: 'Número inválido',
  validation_min_number: 'Valor abaixo do mínimo',
  validation_max_number: 'Valor acima do máximo',
  validation_unique: 'Já existe registro com este valor',
}

export function formatDetailedErrorMessage(error: unknown, fallback?: string): string {
  if (!error) return fallback || 'Erro inesperado.'

  // Tenta extrair resposta com data (seja ClientResponseError ou mock)
  const errObj = error as {
    response?: {
      message?: string
      data?: Record<string, { code?: string; message?: string }>
    }
    message?: string
  }

  const data = errObj.response?.data
  if (data && typeof data === 'object') {
    const fieldDetails: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      if (!detail || typeof detail !== 'object') continue
      const fieldLabel = FIELD_LABELS[field] || field
      const codeMessage = detail.code ? ERROR_CODE_LABELS[detail.code] : undefined
      const msg = codeMessage || detail.message || 'Inválido'
      fieldDetails.push(`${fieldLabel}: ${msg}`)
    }
    if (fieldDetails.length > 0) {
      return fieldDetails.join(' | ')
    }
  }

  if (errObj.response?.message) {
    return errObj.response.message
  }

  if (errObj.message) {
    return errObj.message
  }

  return fallback || 'Erro ao processar requisição.'
}
