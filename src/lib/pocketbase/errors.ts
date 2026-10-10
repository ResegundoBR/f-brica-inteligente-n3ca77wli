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
  total: 'Valor Total',
  payment_terms: 'Condições de Pagamento',
  delivery_terms: 'Prazo de Entrega',
  delivery_type: 'Tipo de Frete',
  oc_number: 'Número da OC',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  code: 'Código',
  description: 'Descrição',
}

const MESSAGE_TRANSLATIONS_PT: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  'Value cannot be blank.': 'Obrigatório',
  'Must be a valid datetime.': 'Data inválida',
  'Cannot be blank': 'Obrigatório',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error || typeof error !== 'object') {
    return fallbackMessage || 'Ocorreu um erro inesperado.'
  }

  const errObj = error as Record<string, any>
  const response = errObj.response || errObj
  const data = response?.data

  if (data && typeof data === 'object' && Object.keys(data).length > 0) {
    const fieldLines: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const fieldLabel = FIELD_LABELS_PT[field] || field
      let msg = ''
      if (typeof detail === 'object' && detail !== null) {
        const d = detail as Record<string, any>
        msg =
          MESSAGE_TRANSLATIONS_PT[d.code] ||
          MESSAGE_TRANSLATIONS_PT[d.message] ||
          d.message ||
          'Inválido'
      } else if (typeof detail === 'string') {
        msg = MESSAGE_TRANSLATIONS_PT[detail] || detail
      }
      fieldLines.push(`${fieldLabel}: ${msg}`)
    }
    if (fieldLines.length > 0) {
      return fieldLines.join(' | ')
    }
  }

  const baseMsg = response?.message || errObj.message
  if (baseMsg && typeof baseMsg === 'string' && baseMsg.trim() !== '') {
    return baseMsg
  }

  return fallbackMessage || 'Ocorreu um erro inesperado.'
}
