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
  delivery_type: 'Tipo de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_terms: 'Condições de Entrega',
  freight: 'Frete',
  discount: 'Desconto',
  notes: 'Observações',
  oc_number: 'Número da OC',
  total: 'Total',
  quantity: 'Quantidade',
  received_quantity: 'Quantidade Recebida',
  code: 'Código',
  description: 'Descrição',
  status: 'Status',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallbackMessage = 'Ocorreu um erro ao processar a operação.',
): string {
  if (!error || typeof error !== 'object') return fallbackMessage

  const anyErr = error as any
  const responseData = anyErr?.response?.data || anyErr?.data

  if (responseData && typeof responseData === 'object') {
    const errorParts: string[] = []
    for (const [field, detail] of Object.entries(responseData)) {
      const fieldName = FIELD_LABEL_MAP[field] || field
      let reason = 'Inválido'
      if (typeof detail === 'object' && detail !== null) {
        const d = detail as any
        if (d.code === 'validation_required' || d.message?.includes('cannot be blank')) {
          reason = 'Obrigatório'
        } else if (d.code === 'validation_invalid_date' || d.message?.includes('valid datetime')) {
          reason = 'Data inválida'
        } else if (d.message) {
          reason = d.message
        }
      } else if (typeof detail === 'string') {
        reason = detail
      }
      errorParts.push(`${fieldName}: ${reason}`)
    }
    if (errorParts.length > 0) {
      return errorParts.join(' | ')
    }
  }

  if (anyErr?.response?.message) return anyErr.response.message
  if (anyErr?.message) return anyErr.message
  return fallbackMessage
}
