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
  expected_date: 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  total: 'Total',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  code: 'Código',
  description: 'Descrição',
}

const ERROR_MESSAGE_TRANSLATIONS: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_not_unique: 'Já existe um registro com este valor',
  'Value cannot be blank.': 'Obrigatório',
  'Must be a valid datetime.': 'Data inválida',
}

export function formatDetailedErrorMessage(error: unknown, fallback?: string): string {
  if (!error) return fallback || 'Erro desconhecido'

  // PocketBase ClientResponseError ou objeto similar
  const errObj = error as any
  const responseData =
    errObj?.response?.data || (typeof errObj?.data === 'object' ? errObj.data : null)

  if (responseData && typeof responseData === 'object' && Object.keys(responseData).length > 0) {
    const fieldDetails: string[] = []

    for (const [field, detail] of Object.entries(responseData)) {
      const fieldLabel = FIELD_LABELS[field] || field
      let msg = ''

      if (detail && typeof detail === 'object') {
        const d = detail as { code?: string; message?: string }
        if (d.code && ERROR_MESSAGE_TRANSLATIONS[d.code]) {
          msg = ERROR_MESSAGE_TRANSLATIONS[d.code]
        } else if (d.message && ERROR_MESSAGE_TRANSLATIONS[d.message]) {
          msg = ERROR_MESSAGE_TRANSLATIONS[d.message]
        } else {
          msg = d.message || d.code || 'Valor inválido'
        }
      } else if (typeof detail === 'string') {
        msg = ERROR_MESSAGE_TRANSLATIONS[detail] || detail
      }

      fieldDetails.push(`${fieldLabel}: ${msg}`)
    }

    if (fieldDetails.length > 0) {
      return fieldDetails.join(' | ')
    }
  }

  const rawMessage = errObj?.response?.message || errObj?.message
  if (rawMessage && typeof rawMessage === 'string') {
    return rawMessage
  }

  return fallback || 'Erro ao processar requisição.'
}
