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

/**
 * Traduz erros comuns de validação do PocketBase para português legível
 */
const FIELD_LABELS_PT: Record<string, string> = {
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Frete/Entrega',
  total: 'Valor Total',
  oc_number: 'Número da OC',
  status: 'Status',
  description: 'Descrição',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  code: 'Código',
}

const ERROR_CODE_LABELS_PT: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_not_unique: 'Já cadastrado',
  validation_min_text_constraint: 'Texto muito curto',
  validation_max_text_constraint: 'Texto muito longo',
  validation_min_number_constraint: 'Valor abaixo do mínimo',
  validation_max_number_constraint: 'Valor acima do máximo',
}

/**
 * Formata os erros a nível de campo de uma resposta de erro do PocketBase em português amigável.
 */
export function formatDetailedErrorMessage(
  error: unknown,
  fallbackMessage = 'Verifique os dados informados.',
): string {
  if (!error || typeof error !== 'object') return fallbackMessage

  // PocketBase ClientResponseError ou objeto mock { response: { data: ... } }
  const anyErr = error as any
  const data = anyErr.response?.data || anyErr.data

  if (data && typeof data === 'object') {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      if (!detail) continue
      const fieldLabel = FIELD_LABELS_PT[field] || field
      let msg = ''
      if (typeof detail === 'object') {
        const d = detail as any
        if (d.code && ERROR_CODE_LABELS_PT[d.code]) {
          msg = ERROR_CODE_LABELS_PT[d.code]
        } else if (typeof d.message === 'string') {
          msg = d.message
        }
      } else if (typeof detail === 'string') {
        msg = detail
      }

      if (msg) {
        parts.push(`${fieldLabel}: ${msg}`)
      }
    }

    if (parts.length > 0) {
      return parts.join(' | ')
    }
  }

  if (anyErr.message && typeof anyErr.message === 'string') {
    return anyErr.message
  }

  return fallbackMessage
}
