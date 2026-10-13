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
  oc_number: 'Número da OC',
  total: 'Valor Total',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Frete',
  delivery_terms: 'Prazo de Entrega',
  status: 'Status',
  code: 'Código',
  description: 'Descrição',
  unit: 'Unidade',
  quantity: 'Quantidade',
}

const ERROR_MESSAGES_PT: Record<string, string> = {
  validation_invalid_date: 'Data inválida',
  validation_required: 'Obrigatório',
  validation_missing_required_elem: 'Campo obrigatório ausente',
  validation_not_unique: 'Já existe um registro com este valor',
}

/**
 * Formata erros detalhados retornados pelo PocketBase com mapeamento amigável para o português.
 */
export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error || typeof error !== 'object') {
    return fallbackMessage || 'Ocorreu um erro inesperado.'
  }

  // Se tiver response.data com campos detalhados
  const errObj = error as any
  const data = errObj?.response?.data || errObj?.data
  if (data && typeof data === 'object') {
    const fieldDetails: string[] = []
    for (const [field, detail] of Object.entries(data)) {
      const fieldLabel = FIELD_LABELS_PT[field] || field
      let reason = 'Inválido'
      if (typeof detail === 'object' && detail !== null) {
        const d = detail as any
        if (d.code && ERROR_MESSAGES_PT[d.code]) {
          reason = ERROR_MESSAGES_PT[d.code]
        } else if (d.message) {
          if (typeof d.message === 'string' && d.message.toLowerCase().includes('blank')) {
            reason = 'Obrigatório'
          } else if (
            typeof d.message === 'string' &&
            d.message.toLowerCase().includes('datetime')
          ) {
            reason = 'Data inválida'
          } else {
            reason = String(d.message)
          }
        }
      } else if (typeof detail === 'string') {
        reason = detail
      }
      fieldDetails.push(`${fieldLabel}: ${reason}`)
    }
    if (fieldDetails.length > 0) {
      return fieldDetails.join('. ')
    }
  }

  const baseMsg = errObj?.response?.message || errObj?.message
  if (baseMsg && typeof baseMsg === 'string' && baseMsg.trim()) {
    return baseMsg
  }

  return fallbackMessage || 'Ocorreu um erro inesperado.'
}
