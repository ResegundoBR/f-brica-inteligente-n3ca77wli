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

const FIELD_LABELS: Record<string, string> = {
  supplier: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  oc_number: 'Número da OC',
  code: 'Código',
  description: 'Descrição',
  quantity: 'Quantidade',
  unit_price: 'Valor Unitário',
  total: 'Total',
  observation: 'Observação',
}

const ERROR_CODE_LABELS: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_is_email: 'E-mail inválido',
  validation_not_in: 'Valor não permitido',
  validation_length_out_of_range: 'Fora do intervalo permitido',
  validation_min_text_constraint: 'Texto muito curto',
  validation_max_text_constraint: 'Texto muito longo',
  validation_greater_than_required: 'Valor abaixo do mínimo',
  validation_less_than_required: 'Valor acima do máximo',
}

/**
 * Formata erros de validação do PocketBase em mensagem amigável em português,
 * campo por campo (ex.: "Previsão de Entrega: Data inválida — Fornecedor: Obrigatório").
 * Recebe um fallback para quando o erro não tem detalhe de campo útil.
 */
export function formatDetailedErrorMessage(
  error: unknown,
  fallback = 'Verifique os dados informados.',
): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : fallback
  }
  const data = error.response?.data as
    | Record<string, { code?: string; message?: string }>
    | undefined
  const parts: string[] = []
  if (data && typeof data === 'object') {
    for (const [field, detail] of Object.entries(data)) {
      if (detail && typeof detail === 'object') {
        const label = FIELD_LABELS[field] || field
        const friendly = ERROR_CODE_LABELS[detail.code || ''] || detail.message || fallback
        parts.push(`${label}: ${friendly}`)
      }
    }
  }
  if (parts.length === 0) return error.message || fallback
  return parts.join(' — ')
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred.'
  }
  const msgs = Object.values(extractFieldErrors(error))
  return msgs.length > 0 ? msgs.join(' ') : error.message || 'An unexpected error occurred.'
}
