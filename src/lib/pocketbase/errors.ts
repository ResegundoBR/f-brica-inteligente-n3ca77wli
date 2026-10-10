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
  supplier_id: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  oc_number: 'Número da OC',
  total: 'Total',
  status: 'Status',
  description: 'Descrição',
  code: 'Código',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  user_id: 'Usuário',
  client_id: 'Cliente',
  name: 'Nome',
  email: 'E-mail',
  password: 'Senha',
  passwordConfirm: 'Confirmação de Senha',
  oldPassword: 'Senha Atual',
}

function translateValidationMessage(code?: string, rawMsg?: string): string {
  if (code === 'validation_invalid_date') {
    return 'Data inválida'
  }
  if (code === 'validation_required') {
    return 'Obrigatório'
  }
  if (code === 'validation_not_unique') {
    return 'Já cadastrado / deve ser único'
  }
  if (code === 'validation_length') {
    return 'Tamanho inválido'
  }
  if (code === 'validation_min') {
    return 'Valor abaixo do mínimo permitido'
  }
  if (code === 'validation_max') {
    return 'Valor acima do máximo permitido'
  }
  if (code === 'validation_mismatch') {
    return 'Valores não conferem'
  }

  if (rawMsg) {
    const lower = rawMsg.toLowerCase()
    if (lower.includes('must be a valid datetime') || lower.includes('invalid date')) {
      return 'Data inválida'
    }
    if (lower.includes('cannot be blank') || lower.includes('required')) {
      return 'Obrigatório'
    }
    return rawMsg
  }

  return 'Inválido'
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  const errObj = error as {
    response?: {
      message?: string
      data?: Record<string, unknown>
    }
    message?: string
  } | null

  const data = errObj?.response?.data
  if (data && typeof data === 'object') {
    const details: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const fieldLabel = FIELD_LABELS[field] || field
      if (detail && typeof detail === 'object') {
        const det = detail as { code?: string; message?: string }
        const friendlyMsg = translateValidationMessage(det.code, det.message)
        details.push(`${fieldLabel}: ${friendlyMsg}`)
      } else if (typeof detail === 'string') {
        details.push(`${fieldLabel}: ${translateValidationMessage(undefined, detail)}`)
      }
    }
    if (details.length > 0) {
      return details.join(', ')
    }
  }

  if (fallbackMessage) {
    return fallbackMessage
  }

  if (errObj?.response?.message) {
    return errObj.response.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Ocorreu um erro inesperado.'
}
