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
  delivery_type: 'Tipo de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_terms: 'Condições de Entrega',
  total: 'Valor Total',
  oc_number: 'Número da OC',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error) return fallbackMessage || 'Erro inesperado.'
  const errObj = error as any
  const fieldData =
    errObj?.response?.data || (error instanceof ClientResponseError ? error.response?.data : null)

  if (fieldData && typeof fieldData === 'object') {
    const errorLines: string[] = []
    for (const [field, detail] of Object.entries(fieldData)) {
      const label = FIELD_LABELS_PT[field] || field
      let msg = 'Erro no campo'
      if (typeof detail === 'object' && detail !== null) {
        const d = detail as any
        if (
          d.code === 'validation_invalid_date' ||
          d.message?.toLowerCase().includes('datetime') ||
          d.message?.toLowerCase().includes('date')
        ) {
          msg = 'Data inválida'
        } else if (
          d.code === 'validation_required' ||
          d.message?.toLowerCase().includes('cannot be blank')
        ) {
          msg = 'Obrigatório'
        } else if (d.message) {
          msg = d.message
        }
      } else if (typeof detail === 'string') {
        msg = detail
      }
      errorLines.push(`${label}: ${msg}`)
    }
    if (errorLines.length > 0) {
      return errorLines.join('\n')
    }
  }

  return errObj?.response?.message || errObj?.message || fallbackMessage || 'Erro inesperado.'
}
