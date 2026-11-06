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

/**
 * Formata erros de validação do PocketBase em mensagem amigável em português,
 * traduzindo os nomes dos campos por meio de um mapa de labels (ex.:
 * { 'data.delivery_forecast': 'Previsão de Entrega' }).
 * Fallback para o mapa padrão de labels quando nenhum é fornecido.
 */
const DEFAULT_FIELD_LABELS: Record<string, string> = {
  oc_number: 'Número da OC',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  'data.delivery_forecast': 'Previsão de Entrega',
  'data.supplier': 'Fornecedor',
  payment_terms: 'Condições de Pagamento',
  delivery_terms: 'Condições de Entrega',
  delivery_type: 'Tipo de Entrega',
  total: 'Total',
  code: 'Código',
  description: 'Descrição',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
}

const FRIENDLY_MESSAGES: Array<{ pattern: RegExp; text: string }> = [
  { pattern: /required|cannot be blank|valor vazio/i, text: 'Obrigatório' },
  {
    pattern: /invalid datetime|invalid date|valid datetime|not a valid date/i,
    text: 'Data inválida',
  },
  { pattern: /invalid.*number|must be a( valid)? number/i, text: 'Número inválido' },
  { pattern: /invalid.*email/i, text: 'E-mail inválido' },
  { pattern: /must be greater/i, text: 'Valor muito baixo' },
  { pattern: /must be less/i, text: 'Valor muito alto' },
  { pattern: /length|too long|too short/i, text: 'Tamanho inválido' },
]

function fieldLabel(field: string, labels?: Record<string, string>): string {
  const custom = labels?.[field]
  if (custom) return custom
  const normalized = field.replace(/^[a-z_]+\./i, '')
  return DEFAULT_FIELD_LABELS[normalized] || DEFAULT_FIELD_LABELS[field] || normalized
}

function friendlyDetail(detail: unknown): string {
  const message =
    detail && typeof detail === 'object' && 'message' in detail
      ? String((detail as { message: unknown }).message)
      : String(detail ?? '')
  for (const { pattern, text } of FRIENDLY_MESSAGES) {
    if (pattern.test(message)) return text
  }
  return message
}

export function formatDetailedErrorMessage(
  error: unknown,
  fieldLabels?: Record<string, string> | string,
): string {
  // Suporta chamadas antigas no formato (erro, 'Mensagem de contexto'), em que o
  // segundo argumento é apenas texto de fallback — não um mapa de labels.
  const labels =
    fieldLabels && typeof fieldLabels === 'object'
      ? (fieldLabels as Record<string, string>)
      : undefined

  // Aceita tanto instâncias reais de ClientResponseError quanto objetos com a mesma
  // forma (response.data) — testes e wrappers podem produzir o segundo caso.
  const candidate = error as { response?: { data?: unknown; message?: string }; message?: string }
  const data = candidate?.response?.data
  if (data && typeof data === 'object') {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(data as Record<string, unknown>)) {
      const text = friendlyDetail(detail)
      if (text) parts.push(`${fieldLabel(field, labels)}: ${text}`)
    }
    if (parts.length > 0) return parts.join(' · ')
  }
  return (
    candidate?.message ||
    (error instanceof ClientResponseError ? error.message : undefined) ||
    (error instanceof Error ? error.message : undefined) ||
    'Erro inesperado.'
  )
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred.'
  }
  const msgs = Object.values(extractFieldErrors(error))
  return msgs.length > 0 ? msgs.join(' ') : error.message || 'An unexpected error occurred.'
}
