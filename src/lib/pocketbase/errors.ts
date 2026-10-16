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

const FIELD_LABEL_MAP: Record<string, string> = {
  supplier: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  total: 'Valor Total',
  unit_price: 'Valor Unitário',
  quantity: 'Quantidade',
  code: 'Código',
  description: 'Descrição',
  order_id: 'Ordem de Produção',
  sector: 'Setor',
  reason: 'Motivo',
  inventory_id: 'Item de Estoque',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error) return fallbackMessage || 'Ocorreu um erro inesperado.'

  // Se tem response.data no estilo PocketBase (ClientResponseError ou mock de erro com formato similar)
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
    for (const [field, detail] of Object.entries(data)) {
      const fieldName = FIELD_LABEL_MAP[field] || field
      let msg = ''
      let code = ''
      if (detail && typeof detail === 'object') {
        msg = detail.message || ''
        code = detail.code || ''
      } else if (typeof detail === 'string') {
        msg = detail
      }

      // Traduz erros comuns para português amigável
      if (code === 'validation_invalid_date' || /valid datetime/i.test(msg)) {
        fieldDetails.push(`${fieldName}: Data inválida`)
      } else if (code === 'validation_required' || /cannot be blank/i.test(msg)) {
        fieldDetails.push(`${fieldName}: Obrigatório`)
      } else if (code === 'validation_min' || /must be greater/i.test(msg)) {
        fieldDetails.push(`${fieldName}: Valor abaixo do mínimo permitido`)
      } else if (msg) {
        fieldDetails.push(`${fieldName}: ${msg}`)
      }
    }
    if (fieldDetails.length > 0) {
      return fieldDetails.join(' | ')
    }
  }

  if (errObj.response?.message && typeof errObj.response.message === 'string') {
    return errObj.response.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage || 'Ocorreu um erro inesperado.'
}
