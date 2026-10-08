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
  payment_terms: 'Condição de Pagamento',
  delivery_terms: 'Prazo de Entrega',
  delivery_type: 'Tipo de Entrega',
  nf: 'Nota Fiscal',
  transportadora: 'Transportadora',
  data_saida: 'Data de Saída',
  quantity: 'Quantidade',
  order_id: 'Ordem de Produção',
}

const ERROR_MESSAGE_TRANSLATIONS: Record<string, string> = {
  'Must be a valid datetime.': 'Data inválida',
  'Value cannot be blank.': 'Obrigatório',
  'Cannot be blank': 'Obrigatório',
  'is required': 'Obrigatório',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallbackMessage = 'Ocorreu um erro inesperado.',
): string {
  if (!error || typeof error !== 'object') return fallbackMessage

  const errObj = error as Record<string, any>
  const responseData =
    errObj.response?.data || (errObj.data && typeof errObj.data === 'object' ? errObj.data : null)

  if (responseData && typeof responseData === 'object') {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(responseData)) {
      const fieldName = FIELD_LABELS_PT[field] || field
      let msg = ''
      if (typeof detail === 'string') {
        msg = detail
      } else if (
        detail &&
        typeof detail === 'object' &&
        'message' in detail &&
        typeof (detail as any).message === 'string'
      ) {
        msg = (detail as any).message
      }
      const translated = ERROR_MESSAGE_TRANSLATIONS[msg] || msg || 'Inválido'
      parts.push(`${fieldName}: ${translated}`)
    }
    if (parts.length > 0) {
      return parts.join(' | ')
    }
  }

  if (errObj.response?.message && typeof errObj.response.message === 'string') {
    return errObj.response.message
  }

  if (errObj.message && typeof errObj.message === 'string') {
    return errObj.message
  }

  return fallbackMessage
}
