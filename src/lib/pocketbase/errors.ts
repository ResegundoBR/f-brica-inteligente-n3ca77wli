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
  expected_date: 'Previsão de Entrega',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Frete',
  total: 'Total',
  quantity: 'Quantidade',
  unit_price: 'Valor Unitário',
  price: 'Preço',
  code: 'Código',
  description: 'Descrição',
  order_id: 'OP / Pedido',
  material_shortage_id: 'Item de Falta',
}

const CODE_MESSAGES: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_not_unique: 'Já cadastrado',
  validation_min_number: 'Valor abaixo do mínimo',
  validation_max_number: 'Valor acima do máximo',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallback: string = 'Verifique os dados informados.',
): string {
  if (!error || typeof error !== 'object') {
    return fallback
  }

  const errObj = error as Record<string, any>
  const data = errObj.response?.data || (errObj as any).data

  if (data && typeof data === 'object') {
    const parts: string[] = []
    for (const [key, val] of Object.entries(data)) {
      const fieldName = FIELD_LABELS[key] || key
      let msg = ''
      if (val && typeof val === 'object') {
        const item = val as { code?: string; message?: string }
        if (item.code && CODE_MESSAGES[item.code]) {
          msg = CODE_MESSAGES[item.code]
        } else if (item.message) {
          msg = item.message
        }
      } else if (typeof val === 'string') {
        msg = val
      }
      if (msg) {
        parts.push(`${fieldName}: ${msg}`)
      }
    }
    if (parts.length > 0) {
      return parts.join('; ')
    }
  }

  const responseMsg = errObj.response?.message || errObj.message
  if (typeof responseMsg === 'string' && responseMsg.trim()) {
    return responseMsg
  }

  return fallback
}
