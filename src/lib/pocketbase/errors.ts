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
  expected_date: 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  total: 'Valor Total',
  oc_number: 'Número da OC',
  status: 'Status',
  description: 'Descrição',
  code: 'Código',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  user_id: 'Usuário',
  itens: 'Itens',
  price: 'Preço',
}

const ERROR_CODE_LABELS: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_not_unique: 'Já cadastrado',
  validation_min_value: 'Valor abaixo do mínimo',
  validation_max_value: 'Valor acima do máximo',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallbackMessage = 'Verifique os dados informados.',
): string {
  if (!error) return fallbackMessage

  const errObj = error as {
    message?: string
    response?: {
      message?: string
      data?: Record<string, { code?: string; message?: string } | string | unknown>
    }
  }

  const data = errObj?.response?.data
  if (data && typeof data === 'object') {
    const details: string[] = []
    for (const [field, val] of Object.entries(data)) {
      const label = FIELD_LABELS[field] || field
      let msg = ''
      if (val && typeof val === 'object') {
        const code = (val as { code?: string }).code
        const rawMsg = (val as { message?: string }).message || ''
        if (code && ERROR_CODE_LABELS[code]) {
          msg = ERROR_CODE_LABELS[code]
        } else if (/cannot be blank|required/i.test(rawMsg)) {
          msg = 'Obrigatório'
        } else if (/valid datetime|valid date/i.test(rawMsg)) {
          msg = 'Data inválida'
        } else {
          msg = rawMsg || 'Inválido'
        }
      } else if (typeof val === 'string') {
        if (/cannot be blank|required/i.test(val)) {
          msg = 'Obrigatório'
        } else if (/valid datetime|valid date/i.test(val)) {
          msg = 'Data inválida'
        } else {
          msg = val
        }
      }
      if (msg) {
        details.push(`${label}: ${msg}`)
      }
    }
    if (details.length > 0) {
      return details.join('; ')
    }
  }

  if (
    errObj.response?.message &&
    errObj.response.message !== 'Failed to create record.' &&
    errObj.response.message !== 'Failed to update record.'
  ) {
    return errObj.response.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage
}
