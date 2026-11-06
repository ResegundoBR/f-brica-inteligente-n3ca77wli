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

export const FIELD_LABELS: Record<string, string> = {
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  payment_condition: 'Condições de Pagamento',
  order_number: 'Número da OC',
  status: 'Status',
  items: 'Itens',
  total_amount: 'Valor Total',
  unit_price: 'Preço Unitário',
  quantity: 'Quantidade',
  code: 'Código',
  description: 'Descrição',
  notes: 'Observações',
}

export const ERROR_CODE_LABELS: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_invalid_email: 'E-mail inválido',
  validation_invalid_url: 'URL inválida',
  validation_min_text_constraint: 'Muito curto',
  validation_max_text_constraint: 'Muito longo',
  validation_not_unique: 'Já existe no sistema',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error) return fallbackMessage || 'Erro inesperado.'

  // Suporte a ClientResponseError ou objeto mock/resposta similar
  const anyErr = error as any
  const responseData = anyErr?.response?.data || anyErr?.data

  if (responseData && typeof responseData === 'object') {
    const details: string[] = []
    for (const [field, detail] of Object.entries(responseData)) {
      const fieldLabel = FIELD_LABELS[field] || field
      let reason = ''

      if (detail && typeof detail === 'object') {
        const d = detail as { code?: string; message?: string }
        if (d.code && ERROR_CODE_LABELS[d.code]) {
          reason = ERROR_CODE_LABELS[d.code]
        } else if (d.message) {
          reason = d.message
        }
      } else if (typeof detail === 'string') {
        reason = detail
      }

      if (reason) {
        details.push(`${fieldLabel}: ${reason}`)
      }
    }

    if (details.length > 0) {
      return details.join(' • ')
    }
  }

  if (anyErr?.response?.message && typeof anyErr.response.message === 'string') {
    return anyErr.response.message
  }

  if (anyErr?.message && typeof anyErr.message === 'string') {
    return anyErr.message
  }

  return fallbackMessage || 'Erro inesperado.'
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred.'
  }
  const msgs = Object.values(extractFieldErrors(error))
  return msgs.length > 0 ? msgs.join(' ') : error.message || 'An unexpected error occurred.'
}
