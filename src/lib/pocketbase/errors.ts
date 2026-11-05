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

/** Rótulos legíveis para os campos mais validados do PocketBase. */
const FIELD_LABELS: Record<string, string> = {
  order_id: 'OP',
  order_number: 'Número do Pedido',
  category: 'Categoria',
  description: 'Descrição',
  quantity: 'Quantidade',
  unit_cost: 'Valor Unitário',
  total: 'Valor Total',
  date: 'Data',
  notes: 'Observações',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  material_code: 'Código do Material',
  material_description: 'Descrição do Material',
  quantity_requested: 'Quantidade Solicitada',
  quantity_purchased: 'Quantidade Comprada',
  unit_price: 'Preço Unitário',
  freight: 'Frete',
  status: 'Situação',
  observation: 'Observação',
  reason: 'Motivo',
  expected_date: 'Previsão de Entrega',
}

/** Códigos de validação do PocketBase traduzidos para português. */
const ERROR_CODE_LABELS: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_length_out_of_range: 'Tamanho inválido',
  validation_min_value: 'Valor abaixo do mínimo permitido',
  validation_max_value: 'Valor acima do máximo permitido',
  validation_invalid_value: 'Valor inválido',
  validation_invalid_date: 'Data inválida',
  validation_not_unique: 'Já existe um registro com este valor',
  validation_invalid_text_format: 'Formato inválido',
  validation_is_object_empty: 'Não pode ficar vazio',
}

function labelForField(field: string): string {
  return FIELD_LABELS[field] || field
}

function messageForDetail(field: string, detail: unknown): string | null {
  if (!detail || typeof detail !== 'object') return null
  const d = detail as { message?: unknown; code?: unknown }
  if (typeof d.code === 'string' && ERROR_CODE_LABELS[d.code]) {
    return `${labelForField(field)}: ${ERROR_CODE_LABELS[d.code]}`
  }
  if (typeof d.message === 'string' && d.message.trim()) {
    return `${labelForField(field)}: ${d.message}`
  }
  return null
}

/**
 * Converte um erro do PocketBase em uma mensagem detalhada e legível em
 * português, linha a linha para cada campo com problema de validação.
 */
export function formatDetailedErrorMessage(error: unknown, fallback?: string): string {
  // Aceita tanto ClientResponseError quanto objetos com a mesma forma
  // (mocks em testes, erros serializados).
  const candidate = error as { response?: { data?: unknown; message?: unknown }; message?: unknown } | null
  const data = candidate?.response?.data
  if (data && typeof data === 'object') {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(data as Record<string, unknown>)) {
      const msg = messageForDetail(field, detail)
      if (msg) parts.push(msg)
    }
    if (parts.length > 0) return parts.join(' · ')
  }
  if (typeof candidate?.message === 'string' && candidate.message.trim()) {
    return candidate.message
  }
  if (error instanceof Error && error.message?.trim()) {
    return error.message
  }
  return fallback || 'Ocorreu um erro inesperado. Tente novamente.'
}
