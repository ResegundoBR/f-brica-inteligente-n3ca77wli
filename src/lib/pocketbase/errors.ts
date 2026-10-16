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
  payment_terms: 'Condições de Pagamento',
  delivery_terms: 'Termos de Entrega',
  delivery_type: 'Tipo de Entrega',
  oc_number: 'Número da OC',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  description: 'Descrição',
  code: 'Código',
}

const ERROR_CODE_MESSAGES: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_not_unique: 'Já existe outro registro com este valor',
  validation_min: 'Valor abaixo do mínimo permitido',
  validation_max: 'Valor acima do máximo permitido',
}

export function formatDetailedErrorMessage(error: unknown, fallback?: string): string {
  if (!error) return fallback || 'Erro inesperado.'
  const errObj = error as {
    response?: {
      message?: string
      data?: Record<string, { code?: string; message?: string } | string>
    }
    message?: string
  }

  const data = errObj.response?.data
  if (data && typeof data === 'object') {
    const parts: string[] = []
    for (const [field, val] of Object.entries(data)) {
      const label = FIELD_LABELS[field] || field
      let msg = ''
      if (typeof val === 'string') {
        msg = val
      } else if (val && typeof val === 'object') {
        const code = val.code || ''
        msg = ERROR_CODE_MESSAGES[code] || val.message || 'Inválido'
      }
      if (msg) {
        parts.push(`${label}: ${msg}`)
      }
    }
    if (parts.length > 0) {
      return parts.join(' • ')
    }
  }

  return (
    errObj.response?.message ||
    errObj.message ||
    fallback ||
    'Erro de validação. Verifique os campos.'
  )
}
