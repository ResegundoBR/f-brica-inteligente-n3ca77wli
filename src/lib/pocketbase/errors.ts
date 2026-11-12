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
 * Mapa padrão de rótulos amigáveis para campos de validação do PocketBase.
 * NÃO REMOVER: usado por ComprasPage, EditOrdemCompraModal, OrdemCompraModal
 * e pelo teste src/services/ordens-compra.test.ts.
 */
export const DEFAULT_FIELD_LABELS: Record<string, string> = {
  expected_date: 'Previsão de Entrega',
  'data.delivery_forecast': 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
}

const MESSAGE_TEMPLATES: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_missing_required: 'Obrigatório',
  validation_values_mismatch: 'Valor inválido',
  validation_length_out_of_range: 'Valor fora do intervalo permitido',
  validation_min_char_limit: 'Valor muito curto',
  validation_max_char_limit: 'Valor muito longo',
  validation_invalid_date: 'Data inválida',
  validation_is_zero: 'Valor não pode ser zero',
  validation_is_not_unique: 'Valor já existe',
  validation_min_int_limit: 'Valor abaixo do mínimo',
  validation_max_int_limit: 'Valor abaixo/acima do intervalo',
}

/**
 * Formata um erro (ClientResponseError do PocketBase ou qualquer objeto com
 * `response.data`) em uma mensagem detalhada e amigável em português.
 * Aceita no 2º argumento um Record<string,string> de rótulos por campo
 * (mesclado sobre DEFAULT_FIELD_LABELS) ou uma string de fallback.
 */
export function formatDetailedErrorMessage(
  error: unknown,
  labelsOrFallback: Record<string, string> | string = {},
): string {
  const labels: Record<string, string> = {
    ...DEFAULT_FIELD_LABELS,
    ...(typeof labelsOrFallback === 'string' ? {} : labelsOrFallback),
  }
  const fallback =
    typeof labelsOrFallback === 'string' && labelsOrFallback.trim() !== ''
      ? labelsOrFallback
      : 'Erro na operação'

  const base = getErrorMessage(error)

  let data: unknown = (error as { response?: { data?: unknown } })?.response?.data
  if (data && typeof data === 'object') {
    const parts: string[] = []
    for (const [field, detail] of Object.entries(data as Record<string, unknown>)) {
      if (
        detail &&
        typeof detail === 'object' &&
        'message' in (detail as Record<string, unknown>) &&
        typeof (detail as { message: unknown }).message === 'string'
      ) {
        const code =
          'code' in (detail as Record<string, unknown>) &&
          typeof (detail as { code: unknown }).code === 'string'
            ? (detail as { code: string }).code
            : ''
        const message =
          MESSAGE_TEMPLATES[code] || (detail as { message: string }).message || 'Valor inválido'
        const label = labels[field] ?? field
        parts.push(`${label}: ${message}`)
      }
    }
    if (parts.length > 0) {
      return parts.join(' — ')
    }
  }

  return base || fallback
}
