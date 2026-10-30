import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

export function extractFieldErrors(error: unknown): FieldErrors {
  let data: Record<string, any> | undefined
  if (error instanceof ClientResponseError) {
    data = error.response?.data
  } else if (error && typeof error === 'object' && 'response' in error) {
    data = (error as any).response?.data
  }
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
  order_number: 'Número do Pedido',
  op_number: 'Número da OP',
  quantity: 'Quantidade',
  unit: 'Unidade',
  code: 'Código',
  description: 'Descrição',
  client_id: 'Cliente',
  product_id: 'Produto',
}

const MESSAGE_TRANSLATIONS: Record<string, string> = {
  'Must be a valid datetime.': 'Data inválida',
  'Cannot be blank.': 'Obrigatório',
  'Value cannot be blank.': 'Obrigatório',
  'Value is required.': 'Obrigatório',
  'Missing required value.': 'Obrigatório',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  let rawData: Record<string, any> | undefined

  if (error instanceof ClientResponseError) {
    rawData = error.response?.data
  } else if (error && typeof error === 'object' && 'response' in error) {
    rawData = (error as any).response?.data
  }

  const fieldEntries: Array<[string, string]> = []
  if (rawData && typeof rawData === 'object') {
    for (const [field, detail] of Object.entries(rawData)) {
      if (detail && typeof detail === 'object' && 'message' in detail) {
        const rawMsg = String((detail as { message: unknown }).message || '')
        const translatedMsg = MESSAGE_TRANSLATIONS[rawMsg] || rawMsg
        const fieldLabel = FIELD_LABELS[field] || field
        fieldEntries.push([fieldLabel, translatedMsg])
      }
    }
  }

  if (fieldEntries.length > 0) {
    const list = fieldEntries.map(([field, msg]) => `${field}: ${msg}`).join(', ')
    return fallbackMessage ? `${fallbackMessage} (${list})` : list
  }

  if (error instanceof Error) return error.message
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as any).message === 'string'
  ) {
    return (error as any).message
  }
  return fallbackMessage || 'Ocorreu um erro inesperado.'
}
