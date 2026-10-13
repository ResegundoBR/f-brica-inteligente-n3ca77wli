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
  expected_date: 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  oc_number: 'Número da OC',
  total: 'Total',
  status: 'Status',
  code: 'Código',
  description: 'Descrição',
  quantity: 'Quantidade',
  unit: 'Unidade',
  price: 'Preço',
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallbackMessage = 'Verifique os dados informados.',
): string {
  if (!error) return fallbackMessage

  const rawData =
    (error as any)?.response?.data ||
    (error instanceof ClientResponseError ? error.response?.data : undefined)

  if (rawData && typeof rawData === 'object') {
    const errorEntries = Object.entries(rawData)
    if (errorEntries.length > 0) {
      const parts = errorEntries.map(([field, detail]: [string, any]) => {
        const fieldName = FIELD_LABEL_MAP[field] || field
        let msg = detail?.message || detail?.code || 'Valor inválido'
        if (detail?.code === 'validation_required' || /cannot be blank/i.test(msg)) {
          msg = 'Obrigatório'
        } else if (detail?.code === 'validation_invalid_date' || /valid datetime/i.test(msg)) {
          msg = 'Data inválida'
        }
        return `${fieldName}: ${msg}`
      })
      return parts.join(' | ')
    }
  }

  const baseMsg = (error as any)?.response?.message || (error as any)?.message
  return baseMsg || fallbackMessage
}
