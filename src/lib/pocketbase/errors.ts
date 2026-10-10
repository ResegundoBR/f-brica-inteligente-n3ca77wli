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
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  total: 'Total',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  description: 'Descrição',
  code: 'Código',
}

const ERROR_TRANSLATIONS: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_not_unique: 'Já existe um registro com este valor',
  validation_min_value: 'Valor abaixo do permitido',
  validation_max_value: 'Valor acima do permitido',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallbackMessage = 'Verifique os dados informados.',
): string {
  if (!error || typeof error !== 'object') {
    return fallbackMessage
  }

  const errObj = error as Record<string, any>
  const responseData = errObj.response?.data

  if (responseData && typeof responseData === 'object' && Object.keys(responseData).length > 0) {
    const errorParts: string[] = []
    for (const [field, detail] of Object.entries(responseData)) {
      const fieldLabel = FIELD_LABELS_PT[field] || field
      let translatedError = ''

      if (detail && typeof detail === 'object') {
        const code = (detail as any).code
        const msg = (detail as any).message
        if (code && ERROR_TRANSLATIONS[code]) {
          translatedError = ERROR_TRANSLATIONS[code]
        } else if (msg) {
          translatedError = String(msg)
        }
      } else if (typeof detail === 'string') {
        translatedError = detail
      }

      if (translatedError) {
        errorParts.push(`${fieldLabel}: ${translatedError}`)
      } else {
        errorParts.push(fieldLabel)
      }
    }

    if (errorParts.length > 0) {
      return errorParts.join(', ')
    }
  }

  if (errObj.message && typeof errObj.message === 'string') {
    return errObj.message
  }

  return fallbackMessage
}
