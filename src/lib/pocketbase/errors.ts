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
  delivery_terms: 'Prazo de Entrega',
  delivery_type: 'Tipo de Entrega',
  status: 'Status',
}

const ERROR_MESSAGE_TRANSLATIONS: Record<string, string> = {
  'Must be a valid datetime.': 'Data inválida',
  'Value cannot be blank.': 'Obrigatório',
  'Cannot be blank.': 'Obrigatório',
  'The value must be unique.': 'Já cadastrado',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallbackMessage: string = 'Ocorreu um erro ao processar a requisição.',
): string {
  if (!error || typeof error !== 'object') {
    return fallbackMessage
  }

  // Se tem error.response?.data com campos
  const data = (error as any).response?.data
  if (data && typeof data === 'object') {
    const fieldDetails: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      if (detail && typeof detail === 'object') {
        const rawMsg = (detail as any).message || ''
        const translatedMsg = ERROR_MESSAGE_TRANSLATIONS[rawMsg] || rawMsg || 'Inválido'
        const label = FIELD_LABELS_PT[field] || field
        fieldDetails.push(`${label}: ${translatedMsg}`)
      }
    }
    if (fieldDetails.length > 0) {
      return fieldDetails.join(' | ')
    }
  }

  const directMsg = (error as any).message || (error as any).response?.message
  if (typeof directMsg === 'string' && directMsg.trim().length > 0) {
    return directMsg
  }

  return fallbackMessage
}
