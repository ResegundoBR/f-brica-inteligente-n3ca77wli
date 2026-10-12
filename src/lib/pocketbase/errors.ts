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
  delivery_terms: 'Prazo de Entrega',
  delivery_type: 'Tipo de Frete/Entrega',
  oc_number: 'Número da OC',
  total: 'Valor Total',
  unit_price: 'Preço Unitário',
  quantity: 'Quantidade',
  description: 'Descrição',
  code: 'Código',
}

const ERROR_CODE_TRANSLATIONS: Record<string, string> = {
  validation_invalid_date: 'Data inválida',
  validation_required: 'Obrigatório',
  validation_not_unique: 'Já cadastrado',
  validation_min_text_constraint: 'Muito curto',
  validation_max_text_constraint: 'Muito longo',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error || typeof error !== 'object') {
    return fallbackMessage || 'Erro inesperado.'
  }

  const errObj = error as Record<string, any>
  const data = errObj.response?.data || errObj.data

  if (data && typeof data === 'object') {
    const lines: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const label = FIELD_LABELS_PT[field] || field
      let msg = ''
      if (detail && typeof detail === 'object') {
        const code = (detail as any).code
        const rawMsg = (detail as any).message || ''
        if (code && ERROR_CODE_TRANSLATIONS[code]) {
          msg = ERROR_CODE_TRANSLATIONS[code]
        } else if (
          rawMsg.toLowerCase().includes('cannot be blank') ||
          rawMsg.toLowerCase().includes('required')
        ) {
          msg = 'Obrigatório'
        } else if (
          rawMsg.toLowerCase().includes('invalid date') ||
          rawMsg.toLowerCase().includes('valid datetime')
        ) {
          msg = 'Data inválida'
        } else {
          msg = rawMsg || 'Inválido'
        }
      } else if (typeof detail === 'string') {
        msg = detail
      }
      lines.push(`${label}: ${msg}`)
    }
    if (lines.length > 0) {
      return lines.join(' • ')
    }
  }

  if (errObj.message && typeof errObj.message === 'string') {
    return errObj.message
  }

  return fallbackMessage || 'Erro inesperado.'
}
