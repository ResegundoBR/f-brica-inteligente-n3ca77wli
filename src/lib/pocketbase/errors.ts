import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

/** Rótulos legíveis (pt-BR) para os campos validados pelo PocketBase. */
const FIELD_LABELS: Record<string, string> = {
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  delivery_type: 'Tipo de Entrega',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  status: 'Status',
  description: 'Descrição',
  code: 'Código',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  st_value: 'Valor de Substituição Tributária',
  ipi_value: 'Valor de IPI',
  total_value: 'Valor Total',
  oc_number: 'Número da OC',
  user_id: 'Usuário',
  category: 'Categoria',
  order_id: 'OP',
  sale_price: 'Valor de Venda',
  labor_hour_rate: 'Taxa de Hora',
}

/** Mensagens legíveis (pt-BR) para os códigos de validação do PocketBase. */
const CODE_MESSAGES: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_not_unique: 'Valor já utilizado',
  validation_length_out_of_range: 'Tamanho fora do permitido',
  validation_out_of_range: 'Valor fora do intervalo permitido',
  validation_min: 'Valor abaixo do mínimo permitido',
  validation_max: 'Valor acima do máximo permitido',
  validation_invalid_value: 'Valor inválido',
  validation_invalid_format: 'Formato inválido',
  validation_invalid_url: 'URL inválida',
  validation_invalid_email: 'E-mail inválido',
  validation_missing_values: 'Valores obrigatórios ausentes',
}

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

/**
 * Formata um erro do PocketBase em uma mensagem detalhada e legível em português,
 * mapeando os campos e códigos de validação para rótulos amigáveis.
 * Ex.: "Previsão de Entrega: Data inválida; Fornecedor: Obrigatório".
 */
export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  const response =
    error instanceof ClientResponseError
      ? error.response
      : error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { message?: string; data?: Record<string, unknown> } }).response
        : undefined

  const data = response?.data
  const parts: string[] = []

  if (data && typeof data === 'object') {
    for (const [field, detail] of Object.entries(data)) {
      if (!detail || typeof detail !== 'object') continue
      const { code, message } = detail as { code?: string; message?: string }
      const label = FIELD_LABELS[field] || field
      const friendly =
        (code && CODE_MESSAGES[code]) ||
        (typeof message === 'string' && message ? message : undefined) ||
        'Valor inválido'
      parts.push(`${label}: ${friendly}`)
    }
  }

  if (parts.length > 0) return parts.join('; ')

  if (response && typeof response.message === 'string' && response.message) {
    return response.message
  }
  if (fallbackMessage && typeof fallbackMessage === 'string' && fallbackMessage) {
    return fallbackMessage
  }
  return getErrorMessage(error)
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred.'
  }
  const msgs = Object.values(extractFieldErrors(error))
  return msgs.length > 0 ? msgs.join(' ') : error.message || 'An unexpected error occurred.'
}
