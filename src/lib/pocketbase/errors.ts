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
  payment_terms: 'Condição de Pagamento',
  delivery_terms: 'Condições de Entrega',
  delivery_type: 'Tipo de Entrega',
  total: 'Valor Total',
  oc_number: 'Número da OC',
}

const CODE_MESSAGES_PT: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_invalid_email: 'E-mail inválido',
  validation_not_unique: 'Já cadastrado',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error || typeof error !== 'object') {
    return fallbackMessage || 'Ocorreu um erro inesperado.'
  }

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
      const label = FIELD_LABELS_PT[field] || field
      let detailMsg = ''
      if (detail && typeof detail === 'object') {
        const code = detail.code || ''
        detailMsg = CODE_MESSAGES_PT[code] || detail.message || 'Valor inválido'
      } else if (typeof detail === 'string') {
        detailMsg = detail
      }
      if (detailMsg) {
        fieldDetails.push(`${label}: ${detailMsg}`)
      }
    }
    if (fieldDetails.length > 0) {
      return fieldDetails.join('. ')
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
