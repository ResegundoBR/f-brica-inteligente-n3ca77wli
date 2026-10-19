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
  supplier: 'Fornecedor',
  oc_number: 'Número da OC',
  expected_date: 'Previsão de Entrega',
  delivery_type: 'Tipo de Entrega',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  total: 'Total',
  code: 'Código',
  description: 'Descrição',
}

function translateValidationMessage(code?: string, rawMsg?: string): string {
  if (code === 'validation_required' || rawMsg?.toLowerCase().includes('cannot be blank')) {
    return 'Obrigatório'
  }
  if (
    code === 'validation_invalid_date' ||
    rawMsg?.toLowerCase().includes('valid date') ||
    rawMsg?.toLowerCase().includes('valid datetime')
  ) {
    return 'Data inválida'
  }
  if (code === 'validation_not_unique' || rawMsg?.toLowerCase().includes('already exists')) {
    return 'Já cadastrado'
  }
  return rawMsg || 'Inválido'
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error) return fallbackMessage || 'Erro inesperado.'
  if (typeof error === 'string') return error

  // Se tem payload padrão PocketBase (ClientResponseError ou objeto mock/serializado)
  const errObj = error as {
    response?: { message?: string; data?: Record<string, unknown> }
    data?: Record<string, unknown>
    message?: string
  }
  const rawData = errObj?.response?.data || errObj?.data
  if (rawData && typeof rawData === 'object' && Object.keys(rawData).length > 0) {
    const fieldDetails: string[] = []
    for (const [field, detail] of Object.entries(rawData)) {
      const label = FIELD_LABELS[field] || field
      let translated = 'Inválido'
      if (detail && typeof detail === 'object') {
        const d = detail as { code?: string; message?: string }
        translated = translateValidationMessage(d.code, d.message)
      } else if (typeof detail === 'string') {
        translated = translateValidationMessage(undefined, detail)
      }
      fieldDetails.push(`${label}: ${translated}`)
    }
    if (fieldDetails.length > 0) {
      return fieldDetails.join(' | ')
    }
  }

  return getErrorMessage(error) || fallbackMessage || 'Erro inesperado.'
}
