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
  delivery_type: 'Tipo de Frete/Entrega',
  delivery_terms: 'Termos de Entrega',
  oc_number: 'Número da OC',
  total: 'Total',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  code: 'Código',
  description: 'Descrição',
}

export function formatDetailedErrorMessage(error: unknown, fallback = 'Erro na operação'): string {
  if (!error) return fallback

  const errObj = error as {
    response?: {
      message?: string
      data?: Record<string, { code?: string; message?: string }>
    }
    message?: string
  }

  const response = errObj?.response
  const data = response?.data

  if (data && typeof data === 'object') {
    const fieldDetails: string[] = []

    for (const [field, detail] of Object.entries(data)) {
      if (!detail) continue
      const fieldName = FIELD_LABELS_PT[field] || field
      const code = detail.code || ''
      const msg = detail.message || ''

      let friendlyMsg = msg
      if (code === 'validation_required' || msg.toLowerCase().includes('cannot be blank')) {
        friendlyMsg = 'Obrigatório'
      } else if (code === 'validation_invalid_date' || msg.toLowerCase().includes('datetime')) {
        friendlyMsg = 'Data inválida'
      } else if (code === 'validation_not_unique' || msg.toLowerCase().includes('unique')) {
        friendlyMsg = 'Já existente'
      }

      fieldDetails.push(`${fieldName}: ${friendlyMsg}`)
    }

    if (fieldDetails.length > 0) {
      return fieldDetails.join(' | ')
    }
  }

  return response?.message || errObj.message || fallback
}
