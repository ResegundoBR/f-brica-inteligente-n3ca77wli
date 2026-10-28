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
  expected_date: 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  delivery_type: 'Tipo de Entrega',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  total: 'Total',
  unit_price: 'Preço Unitário',
  quantity: 'Quantidade',
  items: 'Itens',
  order_id: 'Ordem de Produção',
  status: 'Status',
  code: 'Código',
  description: 'Descrição',
  notes: 'Observações',
}

const MESSAGE_TRANSLATIONS: Record<string, string> = {
  'must be a valid datetime.': 'Data inválida',
  'value cannot be blank.': 'Obrigatório',
  'cannot be blank': 'Obrigatório',
  'invalid date': 'Data inválida',
  'must be a number': 'Deve ser um número',
  'must be greater than 0': 'Deve ser maior que 0',
}

export function formatDetailedErrorMessage(error: unknown, fallback?: string): string {
  if (typeof error === 'string') return error
  const fieldErrors = extractFieldErrors(error)
  const entries = Object.entries(fieldErrors)
  if (entries.length > 0) {
    return entries
      .map(([field, msg]) => {
        const label = FIELD_LABELS[field] || field
        const lowerMsg = (msg || '').toLowerCase()
        const translated = MESSAGE_TRANSLATIONS[lowerMsg] || msg
        return `${label}: ${translated}`
      })
      .join(', ')
  }
  if (error instanceof ClientResponseError) {
    if (error.response?.message) return error.response.message
    if (error.message) return error.message
  }
  if (error instanceof Error) return error.message
  return fallback || 'Ocorreu um erro inesperado.'
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred.'
  }
  const msgs = Object.values(extractFieldErrors(error))
  return msgs.length > 0 ? msgs.join(' ') : error.message || 'An unexpected error occurred.'
}
