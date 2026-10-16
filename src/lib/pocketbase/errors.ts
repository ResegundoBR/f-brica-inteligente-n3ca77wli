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
  delivery_type: 'Tipo de Entrega',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  received_quantity: 'Quantidade Recebida',
  description: 'Descrição',
  code: 'Código',
  material_shortage_id: 'Solicitação Vinculada',
  oc_id: 'Ordem de Compra',
}

const CODE_MESSAGES: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_min: 'Valor abaixo do mínimo',
  validation_max: 'Valor excede o limite',
  validation_not_found: 'Registro não encontrado',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error) return fallbackMessage || 'Erro desconhecido.'

  // Se o objeto de erro tiver response.data com campos detalhados
  const errObj = error as {
    response?: {
      message?: string
      data?: Record<string, { code?: string; message?: string }>
    }
    message?: string
  }

  const data = errObj?.response?.data
  if (data && typeof data === 'object' && Object.keys(data).length > 0) {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const label = FIELD_LABELS[field] || field
      const code = detail?.code || ''
      let detailMsg = detail?.message || ''
      if (code && CODE_MESSAGES[code]) {
        detailMsg = CODE_MESSAGES[code]
      }
      parts.push(`${label}: ${detailMsg}`)
    }
    if (parts.length > 0) {
      return parts.join('; ')
    }
  }

  const baseMsg = errObj?.response?.message || errObj?.message
  return baseMsg || fallbackMessage || 'Erro na operação.'
}
