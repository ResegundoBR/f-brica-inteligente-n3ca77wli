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
  delivery_terms: 'Condições de Entrega',
  delivery_type: 'Tipo de Entrega',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  description: 'Descrição',
  code: 'Código',
}

const ERROR_CODES_PT: Record<string, string> = {
  validation_invalid_date: 'Data inválida',
  validation_required: 'Obrigatório',
  validation_not_unique: 'Já existe',
  validation_min_length: 'Muito curto',
  validation_max_length: 'Muito longo',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error || typeof error !== 'object') {
    return fallbackMessage || 'Erro desconhecido'
  }

  const err = error as any
  const responseData = err.response?.data || err.data

  if (responseData && typeof responseData === 'object' && Object.keys(responseData).length > 0) {
    const details: string[] = []
    for (const [field, detail] of Object.entries(responseData)) {
      const label = FIELD_LABELS_PT[field] || field
      let msg = ''
      if (detail && typeof detail === 'object') {
        const d = detail as any
        msg = ERROR_CODES_PT[d.code] || d.message || 'Inválido'
      } else if (typeof detail === 'string') {
        msg = detail
      }
      if (msg) {
        details.push(`${label}: ${msg}`)
      }
    }
    if (details.length > 0) {
      return details.join(', ')
    }
  }

  if (err.response?.message) {
    return err.response.message
  }
  if (err.message) {
    return err.message
  }

  return fallbackMessage || 'Erro ao processar requisição'
}
