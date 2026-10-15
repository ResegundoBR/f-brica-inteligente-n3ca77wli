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
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  total: 'Total',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  description: 'Descrição',
  code: 'Código',
  status: 'Status',
  oc_id: 'Ordem de Compra',
  material_shortage_id: 'Solicitação de Material',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallback: string = 'Verifique os dados informados.',
): string {
  if (!error) return fallback

  let data: Record<string, any> | undefined
  let genericMsg = ''

  if (error instanceof ClientResponseError) {
    data = error.response?.data
    genericMsg = error.message
  } else if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, any>
    data = errObj.response?.data || errObj.data
    genericMsg = errObj.message || ''
  }

  if (data && typeof data === 'object' && Object.keys(data).length > 0) {
    const fieldDetails: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const label = FIELD_LABELS[field] || field
      let reason = ''
      if (typeof detail === 'string') {
        reason = detail
      } else if (detail && typeof detail === 'object') {
        const d = detail as Record<string, any>
        if (d.code === 'validation_required') {
          reason = 'Obrigatório'
        } else if (d.code === 'validation_invalid_date') {
          reason = 'Data inválida'
        } else if (d.message) {
          reason = String(d.message)
        }
      }
      fieldDetails.push(reason ? `${label}: ${reason}` : label)
    }
    if (fieldDetails.length > 0) {
      return fieldDetails.join(' | ')
    }
  }

  return genericMsg || fallback
}
