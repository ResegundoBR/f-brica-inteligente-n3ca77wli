import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

export function isPocketBaseError(error: unknown): error is ClientResponseError {
  if (error instanceof ClientResponseError) return true
  // Suporte a objetos mock em testes ou duck typing
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    typeof (error as any).response === 'object'
  ) {
    return true
  }
  return false
}

export function getErrorMessage(error: unknown): string {
  if (isPocketBaseError(error)) {
    if (error.response?.message) {
      return error.response.message
    }
    return (error as any).message || 'Erro na requisição'
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Ocorreu um erro inesperado'
}

export function extractFieldErrors(error: unknown): FieldErrors {
  if (isPocketBaseError(error) && error.response?.data) {
    const raw = error.response.data as Record<string, any>
    const result: FieldErrors = {}
    for (const [key, val] of Object.entries(raw)) {
      if (typeof val === 'string') {
        result[key] = val
      } else if (val && typeof val === 'object' && 'message' in val) {
        result[key] = String(val.message)
      }
    }
    return result
  }
  return {}
}

const FIELD_LABELS_PT: Record<string, string> = {
  expected_date: 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  oc_number: 'Número da OC',
  total: 'Total',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  description: 'Descrição',
  code: 'Código',
  sector: 'Setor',
  payment_terms: 'Condições de Pagamento',
  delivery_terms: 'Prazo de Entrega',
  delivery_type: 'Tipo de Entrega',
}

const ERROR_CODE_TRANSLATIONS: Record<string, string> = {
  validation_invalid_date: 'Data inválida',
  validation_required: 'Obrigatório',
  validation_not_unique: 'Já cadastrado',
  validation_min_text_constraint: 'Texto muito curto',
  validation_max_text_constraint: 'Texto muito longo',
  validation_is_email: 'E-mail inválido',
}

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error) return fallbackMessage || 'Erro desconhecido'

  if (isPocketBaseError(error)) {
    const data = error.response?.data
    if (data && typeof data === 'object') {
      const fieldErrors: string[] = []
      for (const [field, val] of Object.entries(data)) {
        const fieldLabel = FIELD_LABELS_PT[field] || field
        let msg = ''
        if (val && typeof val === 'object') {
          const code = (val as any).code
          if (code && ERROR_CODE_TRANSLATIONS[code]) {
            msg = ERROR_CODE_TRANSLATIONS[code]
          } else {
            msg = (val as any).message || String(val)
          }
        } else if (typeof val === 'string') {
          msg = val
        }
        if (msg) {
          fieldErrors.push(`${fieldLabel}: ${msg}`)
        }
      }

      if (fieldErrors.length > 0) {
        return `${error.response?.message || 'Erro de validação'}: ${fieldErrors.join('; ')}`
      }
    }

    return (
      error.response?.message || (error as any).message || fallbackMessage || 'Erro no servidor'
    )
  }

  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return fallbackMessage || 'Erro desconhecido'
}
