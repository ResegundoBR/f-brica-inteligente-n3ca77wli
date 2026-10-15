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
  total: 'Total',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  delivery_type: 'Tipo de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_terms: 'Condições de Entrega',
  status: 'Status',
  code: 'Código',
  description: 'Descrição',
}

const ERROR_MESSAGE_TRANSLATIONS: Record<string, string> = {
  'Must be a valid datetime.': 'Data inválida',
  'Value cannot be blank.': 'Obrigatório',
  'Must be a number.': 'Deve ser um número',
  'Must not be empty.': 'Não pode ficar vazio',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallback = 'Erro desconhecido.',
): string {
  if (!error) return fallback

  const rawData =
    (error as any)?.response?.data ||
    (error as any)?.data ||
    ((error as any) instanceof ClientResponseError
      ? (error as ClientResponseError).response?.data
      : null)

  if (rawData && typeof rawData === 'object' && Object.keys(rawData).length > 0) {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(rawData)) {
      const label = FIELD_LABELS_PT[field] || field
      let msg = ''
      if (typeof detail === 'string') {
        msg = detail
      } else if (detail && typeof detail === 'object') {
        const rawMsg = (detail as any).message || (detail as any).code || ''
        msg = ERROR_MESSAGE_TRANSLATIONS[rawMsg] || rawMsg
      }
      parts.push(`${label}: ${msg || 'Inválido'}`)
    }
    if (parts.length > 0) {
      return parts.join(' | ')
    }
  }

  if (error instanceof ClientResponseError) {
    return error.message || fallback
  }

  if (error instanceof Error) {
    return error.message || fallback
  }

  if (typeof error === 'string') {
    return error
  }

  return fallback
}
