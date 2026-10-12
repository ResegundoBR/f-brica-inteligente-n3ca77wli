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

const FIELD_LABEL_MAP: Record<string, string> = {
  expected_date: 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  oc_number: 'Número da OC',
  payment_terms: 'Condições de Pagamento',
  delivery_terms: 'Condições de Entrega',
  delivery_type: 'Tipo de Entrega',
  total: 'Valor Total',
  unit_price: 'Preço Unitário',
  quantity: 'Quantidade',
  code: 'Código',
  description: 'Descrição',
  status: 'Status',
}

const ERROR_CODE_TRANSLATIONS: Record<string, string> = {
  validation_invalid_date: 'Data inválida',
  validation_required: 'Obrigatório',
  validation_not_unique: 'Já existe um registro com este valor',
  validation_min_text_constraint: 'Texto muito curto',
  validation_max_text_constraint: 'Texto muito longo',
  validation_min_number_constraint: 'Valor abaixo do mínimo permitido',
  validation_max_number_constraint: 'Valor acima do máximo permitido',
  validation_invalid_email: 'E-mail inválido',
  validation_invalid_url: 'URL inválida',
}

function translateFieldValidation(field: string, errorDetail: any): string {
  const label = FIELD_LABEL_MAP[field] || field

  let msg = ''
  if (typeof errorDetail === 'string') {
    msg = errorDetail
  } else if (errorDetail && typeof errorDetail === 'object') {
    const code = errorDetail.code
    if (code && ERROR_CODE_TRANSLATIONS[code]) {
      msg = ERROR_CODE_TRANSLATIONS[code]
    } else if (errorDetail.message) {
      const rawMsg = String(errorDetail.message)
      if (/cannot be blank|is required|cannot be empty/i.test(rawMsg)) {
        msg = 'Obrigatório'
      } else if (/valid date/i.test(rawMsg)) {
        msg = 'Data inválida'
      } else {
        msg = rawMsg
      }
    }
  }

  if (!msg) {
    msg = 'Inválido'
  }

  return `${label}: ${msg}`
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (error && typeof error === 'object') {
    const errObj = error as Record<string, any>
    const data = errObj.response?.data || (errObj as any).data
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      const details = Object.entries(data).map(([field, detail]) =>
        translateFieldValidation(field, detail),
      )
      if (details.length > 0) {
        return details.join(', ')
      }
    }

    if (errObj.response?.message && typeof errObj.response.message === 'string') {
      return errObj.response.message
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage || 'Ocorreu um erro inesperado.'
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred.'
  }
  const msgs = Object.values(extractFieldErrors(error))
  return msgs.length > 0 ? msgs.join(' ') : error.message || 'An unexpected error occurred.'
}
