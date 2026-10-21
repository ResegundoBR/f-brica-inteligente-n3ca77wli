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

const FIELD_LABELS: Record<string, string> = {
  oc_number: 'Número da OC',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  delivery_type: 'Tipo de Entrega',
  payment_terms: 'Condição de Pagamento',
  delivery_terms: 'Prazo de Entrega',
  total: 'Valor Total',
  items: 'Itens',
  status: 'Status',
  observation: 'Observação',
}

const ERROR_MESSAGE_TRANSLATIONS: Record<string, string> = {
  'Must be a valid datetime.': 'Data inválida',
  'Value cannot be blank.': 'Obrigatório',
  'Cannot be blank': 'Obrigatório',
  'Value must be unique.': 'Já cadastrado',
  'Failed to create record.': 'Falha ao salvar',
  'Failed to update record.': 'Falha ao atualizar',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallbackMessage = 'Verifique os dados informados.',
): string {
  if (!error) return fallbackMessage

  const errObj = error as any
  const data =
    errObj?.response?.data || (error instanceof ClientResponseError ? error.response?.data : null)

  if (data && typeof data === 'object') {
    const details: string[] = []
    for (const [field, val] of Object.entries(data)) {
      if (val && typeof val === 'object') {
        const rawMsg = (val as any).message || (val as any).code || ''
        const translatedMsg = ERROR_MESSAGE_TRANSLATIONS[rawMsg] || rawMsg
        const fieldLabel = FIELD_LABELS[field] || field
        details.push(`${fieldLabel}: ${translatedMsg}`)
      } else if (typeof val === 'string') {
        const fieldLabel = FIELD_LABELS[field] || field
        details.push(`${fieldLabel}: ${ERROR_MESSAGE_TRANSLATIONS[val] || val}`)
      }
    }
    if (details.length > 0) {
      return details.join(' | ')
    }
  }

  if (errObj?.response?.message) {
    return errObj.response.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage
}
