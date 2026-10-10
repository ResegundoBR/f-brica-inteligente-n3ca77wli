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
  delivery_terms: 'Termos de Entrega',
  delivery_type: 'Tipo de Entrega',
  oc_number: 'Número da OC',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  code: 'Código',
  description: 'Descrição',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallback: string = 'Ocorreu um erro ao processar a operação.',
): string {
  if (!error) return fallback

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
    for (const [field, val] of Object.entries(data)) {
      const label = FIELD_LABELS_PT[field] || field
      let msg = ''
      if (val && typeof val === 'object') {
        if (val.code === 'validation_invalid_date') {
          msg = 'Data inválida'
        } else if (val.code === 'validation_required') {
          msg = 'Obrigatório'
        } else {
          msg = val.message || 'Inválido'
        }
      } else if (typeof val === 'string') {
        msg = val
      }
      if (msg) {
        fieldDetails.push(`${label}: ${msg}`)
      }
    }
    if (fieldDetails.length > 0) {
      return fieldDetails.join(' | ')
    }
  }

  return errObj.response?.message || errObj.message || fallback
}
