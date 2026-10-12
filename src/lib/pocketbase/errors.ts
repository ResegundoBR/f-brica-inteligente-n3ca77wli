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
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  total_amount: 'Valor Total',
  status: 'Status',
  code: 'Código',
  description: 'Descrição',
  order_number: 'Número da OC',
}

const ERROR_TRANSLATIONS_PT: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  'Must be a valid datetime.': 'Data inválida',
  'Value cannot be blank.': 'Obrigatório',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error || typeof error !== 'object') {
    return fallbackMessage || 'Ocorreu um erro inesperado.'
  }

  // PocketBase ClientResponseError ou objeto mock similar
  const errObj = error as {
    response?: {
      message?: string
      data?: Record<string, { code?: string; message?: string } | string>
    }
    message?: string
  }

  const data = errObj.response?.data
  if (data && typeof data === 'object') {
    const fieldDetails: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const fieldLabel = FIELD_LABELS_PT[field] || field
      let reason = 'Inválido'

      if (detail && typeof detail === 'object') {
        const code = detail.code || ''
        const rawMsg = detail.message || ''
        if (ERROR_TRANSLATIONS_PT[code]) {
          reason = ERROR_TRANSLATIONS_PT[code]
        } else if (ERROR_TRANSLATIONS_PT[rawMsg]) {
          reason = ERROR_TRANSLATIONS_PT[rawMsg]
        } else if (rawMsg) {
          reason = rawMsg
        }
      } else if (typeof detail === 'string') {
        reason = ERROR_TRANSLATIONS_PT[detail] || detail
      }

      fieldDetails.push(`${fieldLabel}: ${reason}`)
    }

    if (fieldDetails.length > 0) {
      return fieldDetails.join(' | ')
    }
  }

  if (errObj.response?.message) {
    return errObj.response.message
  }

  if (errObj.message) {
    return errObj.message
  }

  return fallbackMessage || 'Ocorreu um erro inesperado.'
}
