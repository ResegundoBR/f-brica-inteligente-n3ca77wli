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
  order_number: 'Número da OC',
  items: 'Itens',
  status: 'Status',
  payment_terms: 'Condições de Pagamento',
  delivery_terms: 'Prazo de Entrega',
}

function translateValidationMsg(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('blank') || m.includes('required') || m.includes('cannot be blank'))
    return 'Obrigatório'
  if (m.includes('invalid datetime') || m.includes('invalid date') || m.includes('valid datetime'))
    return 'Data inválida'
  if (m.includes('already exists') || m.includes('unique')) return 'Já cadastrado'
  return msg
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error) return fallbackMessage || 'Erro desconhecido.'

  const errObj = error as {
    response?: {
      data?: Record<string, unknown>
      message?: string
    }
    message?: string
  }

  const data = errObj.response?.data
  if (data && typeof data === 'object' && Object.keys(data).length > 0) {
    const fieldMsgs: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const fieldLabel = FIELD_LABELS[field] || field
      let rawMsg = ''
      if (detail && typeof detail === 'object' && 'message' in detail) {
        rawMsg = String((detail as { message: unknown }).message)
      } else if (typeof detail === 'string') {
        rawMsg = detail
      }
      const friendlyMsg = translateValidationMsg(rawMsg)
      fieldMsgs.push(`${fieldLabel}: ${friendlyMsg}`)
    }
    if (fieldMsgs.length > 0) {
      return fieldMsgs.join('; ')
    }
  }

  if (errObj.response?.message) {
    return errObj.response.message
  }

  const baseMsg = getErrorMessage(error)
  if (baseMsg && baseMsg !== 'An unexpected error occurred.') {
    return baseMsg
  }

  return fallbackMessage || baseMsg || 'Ocorreu um erro inesperado.'
}
