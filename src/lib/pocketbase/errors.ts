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
 * Tradução de campos comuns para português amigável
 */
const FIELD_LABELS: Record<string, string> = {
  oc_number: 'Número da OC',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  delivery_date: 'Data de Entrega',
  quotation_date: 'Data da Cotação',
  purchase_date: 'Data da Compra',
  payment_terms: 'Condição de Pagamento',
  delivery_terms: 'Condição de Entrega',
  delivery_type: 'Tipo de Frete',
  unit_price: 'Preço Unitário',
  quantity: 'Quantidade',
  total: 'Valor Total',
  observation: 'Observação',
  status: 'Status',
  code: 'Código',
  description: 'Descrição',
  user_id: 'Usuário',
  order_id: 'OP / Pedido',
}

/**
 * Tradução de mensagens de erro comuns da validação PocketBase
 */
function translateValidationMessage(code: string, originalMsg: string): string {
  const c = (code || '').toLowerCase()
  const m = (originalMsg || '').toLowerCase()

  if (c.includes('required') || m.includes('cannot be blank') || m.includes('required')) {
    return 'Obrigatório'
  }
  if (c.includes('invalid_date') || m.includes('valid datetime') || m.includes('valid date')) {
    return 'Data inválida'
  }
  if (c.includes('unique') || m.includes('already exists') || m.includes('must be unique')) {
    return 'Já existe um registro com este valor'
  }
  if (c.includes('min') || m.includes('minimum')) {
    return 'Valor abaixo do permitido'
  }
  if (c.includes('max') || m.includes('maximum')) {
    return 'Valor acima do permitido'
  }
  return originalMsg || 'Inválido'
}

/**
 * Formata mensagens de erro detalhadas (incluindo validações campo a campo)
 * em português amigável para exibição ao usuário via toast ou alerta.
 */
export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error) return fallbackMessage || 'Ocorreu um erro inesperado.'

  // Erro estruturado do PocketBase (ClientResponseError ou objeto similar mockado)
  const errObj = error as {
    message?: string
    response?: {
      message?: string
      data?: Record<string, unknown>
    }
  }

  const responseData = errObj?.response?.data
  if (responseData && typeof responseData === 'object' && Object.keys(responseData).length > 0) {
    const details: string[] = []

    for (const [field, val] of Object.entries(responseData)) {
      const fieldLabel = FIELD_LABELS[field] || field
      let fieldMsg = 'Inválido'

      if (val && typeof val === 'object') {
        const v = val as { code?: string; message?: string }
        fieldMsg = translateValidationMessage(v.code || '', v.message || '')
      } else if (typeof val === 'string') {
        fieldMsg = translateValidationMessage('', val)
      }

      details.push(`${fieldLabel}: ${fieldMsg}`)
    }

    if (details.length > 0) {
      return details.join(' | ')
    }
  }

  if (errObj?.response?.message) {
    return errObj.response.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return fallbackMessage || 'Ocorreu um erro inesperado.'
}
