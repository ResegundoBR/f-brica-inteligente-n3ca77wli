import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

const FIELD_LABELS_PT: Record<string, string> = {
  oc_number: 'Número da OC',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  status: 'Status',
  expected_date: 'Previsão de Entrega',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  total: 'Valor Total',
  user_id: 'Usuário',
  description: 'Descrição',
  code: 'Código',
  quantity: 'Quantidade',
  unit_price: 'Valor Unitário',
  st_value: 'Valor ST',
  ipi_value: 'Valor IPI',
  material_shortage_id: 'Solicitação de Material',
}

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ClientResponseError)) {
    if (error && typeof error === 'object' && 'response' in error) {
      const respData = (error as any).response?.data
      if (respData && typeof respData === 'object') {
        const errors: FieldErrors = {}
        for (const [field, detail] of Object.entries(respData)) {
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
    }
    return {}
  }
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

/**
 * Formata os erros de validação do PocketBase detalhadamente em português:
 * "Previsão de Entrega: Data inválida | Fornecedor: Obrigatório"
 */
export function formatDetailedErrorMessage(
  error: unknown,
  fallbackMessage = 'Erro ao processar requisição',
): string {
  const fieldErrors = extractFieldErrors(error)
  const entries = Object.entries(fieldErrors)

  if (entries.length > 0) {
    const formatted = entries.map(([field, rawMsg]) => {
      const label = FIELD_LABELS_PT[field] || field
      let msg = rawMsg
      if (
        rawMsg.toLowerCase().includes('cannot be blank') ||
        rawMsg.toLowerCase().includes('required')
      ) {
        msg = 'Obrigatório'
      } else if (
        rawMsg.toLowerCase().includes('valid date') ||
        rawMsg.toLowerCase().includes('datetime')
      ) {
        msg = 'Data inválida'
      } else if (rawMsg.toLowerCase().includes('numeric')) {
        msg = 'Deve ser numérico'
      }
      return `${label}: ${msg}`
    })
    return formatted.join(' | ')
  }

  if (error instanceof ClientResponseError) {
    const respMsg = error.response?.message || error.message
    if (respMsg && respMsg !== 'Failed to create record.') {
      return respMsg
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred.'
  }
  const msgs = Object.values(extractFieldErrors(error))
  return msgs.length > 0 ? msgs.join(' ') : error.message || 'An unexpected error occurred.'
}
