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
  order_id: 'Ordem de Produção',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  payment_terms: 'Condição de Pagamento',
  delivery_type: 'Tipo de Frete',
  status: 'Status',
}

const ERROR_MESSAGE_TRANSLATIONS: Record<string, string> = {
  'Must be a valid datetime.': 'Data inválida',
  'Value cannot be blank.': 'Obrigatório',
  'Cannot be blank': 'Obrigatório',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error) return fallbackMessage || 'Ocorreu um erro inesperado.'

  const respData =
    (error as any)?.response?.data ||
    (error instanceof ClientResponseError ? error.response?.data : null)

  if (respData && typeof respData === 'object') {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(respData)) {
      const label = FIELD_LABELS_PT[field] || field
      const rawMsg =
        detail && typeof detail === 'object' && 'message' in detail
          ? String((detail as any).message)
          : String(detail)
      const friendlyMsg = ERROR_MESSAGE_TRANSLATIONS[rawMsg] || rawMsg
      parts.push(`${label}: ${friendlyMsg}`)
    }
    if (parts.length > 0) {
      return parts.join(' | ')
    }
  }

  const baseMsg =
    (error as any)?.response?.message || (error instanceof Error ? error.message : String(error))

  return baseMsg || fallbackMessage || 'Ocorreu um erro inesperado.'
}
