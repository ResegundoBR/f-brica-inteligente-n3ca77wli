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
  delivery_terms: 'Prazo/Frete',
  delivery_type: 'Tipo de Entrega',
  status: 'Status',
}

const ERROR_CODES_PT: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_not_unique: 'Já cadastrado / duplicado',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallbackMessage = 'Verifique os dados informados.',
): string {
  if (!error || typeof error !== 'object') {
    return fallbackMessage
  }

  const errObj = error as any
  const data = errObj?.response?.data

  if (data && typeof data === 'object') {
    const details: string[] = []
    for (const [field, val] of Object.entries(data)) {
      const fieldObj = val as any
      const fieldLabel = FIELD_LABELS_PT[field] || field
      const code = fieldObj?.code
      const msg = fieldObj?.message

      let translated = ''
      if (code && ERROR_CODES_PT[code]) {
        translated = ERROR_CODES_PT[code]
      } else if (msg) {
        if (/must be a valid/i.test(msg)) translated = 'Data inválida'
        else if (/cannot be blank|required/i.test(msg)) translated = 'Obrigatório'
        else translated = msg
      }

      if (translated) {
        details.push(`${fieldLabel}: ${translated}`)
      }
    }

    if (details.length > 0) {
      return details.join('; ')
    }
  }

  if (errObj?.response?.message) {
    return errObj.response.message
  }

  if (errObj instanceof Error && errObj.message) {
    return errObj.message
  }

  return fallbackMessage
}
