import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

export function extractFieldErrors(error: unknown): FieldErrors {
  const data =
    error instanceof ClientResponseError ? error.response?.data : (error as any)?.response?.data
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

const DEFAULT_FIELD_LABELS: Record<string, string> = {
  expected_date: 'Previsão de Entrega',
  'data.delivery_forecast': 'Previsão de Entrega',
  delivery_forecast: 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  oc_number: 'Número da OC',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  total: 'Valor Total',
  payment_terms: 'Condição de Pagamento',
  delivery_terms: 'Frete / Prazo',
  delivery_type: 'Tipo de Entrega',
  description: 'Descrição',
  code: 'Código',
}

const TRANSLATED_FIELD_MESSAGES: Record<string, string> = {
  'Must be a valid datetime.': 'Data inválida',
  'Must be a valid date.': 'Data inválida',
  'Value cannot be blank.': 'Obrigatório',
  'Cannot be blank.': 'Obrigatório',
  'Failed to create record.': 'Falha ao salvar registro',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallbackOrLabels?: string | Record<string, string>,
): string {
  const customLabels =
    typeof fallbackOrLabels === 'object' && fallbackOrLabels !== null ? fallbackOrLabels : {}
  const fallback =
    typeof fallbackOrLabels === 'string' ? fallbackOrLabels : 'Verifique os dados informados.'

  const fieldLabels: Record<string, string> = {
    ...DEFAULT_FIELD_LABELS,
    ...customLabels,
  }

  const rawData =
    error instanceof ClientResponseError ? error.response?.data : (error as any)?.response?.data

  if (rawData && typeof rawData === 'object') {
    const lines: string[] = []
    for (const [field, detail] of Object.entries(rawData)) {
      const label = fieldLabels[field] || field
      let msg = ''
      if (typeof detail === 'string') {
        msg = detail
      } else if (detail && typeof detail === 'object' && 'message' in detail) {
        msg = String((detail as any).message || '')
      }
      if (msg) {
        const friendlyMsg = TRANSLATED_FIELD_MESSAGES[msg] || msg
        lines.push(`${label}: ${friendlyMsg}`)
      }
    }
    if (lines.length > 0) {
      return lines.join('; ')
    }
  }

  return getErrorMessage(error) || fallback
}
