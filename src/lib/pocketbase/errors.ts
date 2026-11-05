import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

/** Extrai erros por campo da resposta de validação do PocketBase (aceita também
 *  objetos em forma de mock usados nos testes, sem ser ClientResponseError). */
export function extractFieldErrors(error: unknown): FieldErrors {
  const response =
    error instanceof ClientResponseError
      ? error.response
      : (error as { response?: { data?: unknown } } | null)?.response
  const data = (response as { data?: unknown } | null)?.data
  if (!data || typeof data !== 'object') return {}
  const errors: FieldErrors = {}
  for (const [field, value] of Object.entries(data as Record<string, unknown>)) {
    if (
      value &&
      typeof value === 'object' &&
      'message' in value &&
      typeof (value as { message: unknown }).message === 'string'
    ) {
      errors[field] = (value as { message: string }).message
    }
  }
  return errors
}

/** Rótulos legíveis para os campos mais usados nas validações do app. */
const FIELD_LABELS: Record<string, string> = {
  code: 'Código',
  description: 'Descrição',
  quantity: 'Quantidade',
  unit_price: 'Valor Unitário',
  total: 'Total',
  oc_number: 'Número da OC',
  supplier: 'Fornecedor',
  expected_date: 'Previsão de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_terms: 'Condições de Entrega',
  status: 'Status',
  sale_price: 'Valor de Venda',
  labor_hour_rate: 'Valor da Hora de Mão de Obra',
  category: 'Categoria',
  order_id: 'OP',
  order_number: 'Número do Pedido',
}

/** Códigos de validação do PocketBase mapeados para mensagens curtas em português;
 *  têm prioridade sobre a mensagem crua enviada pelo backend. */
const ERROR_CODE_LABELS: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_length_out_of_range: 'Tamanho fora do intervalo permitido',
  validation_values_mismatch: 'Valor fora das opções permitidas',
  validation_not_unique: 'Valor já utilizado em outro registro',
  validation_invalid_value: 'Valor inválido',
  validation_invalid_date: 'Data inválida',
  validation_missing_field_value: 'Campo sem valor',
}

function prettyFieldLabel(field: string): string {
  return FIELD_LABELS[field] || field.replace(/_/g, ' ')
}

function prettifyMessage(message: string, code?: string): string {
  if (code && ERROR_CODE_LABELS[code]) return ERROR_CODE_LABELS[code]
  const matched = Object.keys(ERROR_CODE_LABELS).find((key) => message.includes(key))
  if (matched) return ERROR_CODE_LABELS[matched]
  return message
    .replace(/validation_/g, 'validação: ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Formata um erro de API em mensagem legível em português, priorizando os erros
 *  por campo (código de validação sobre a mensagem crua). */
export function formatDetailedErrorMessage(error: unknown, fallback = 'Erro inesperado.'): string {
  const fieldErrors = extractFieldErrors(error)
  if (Object.keys(fieldErrors).length > 0) {
    const response = (error as { response?: { data?: Record<string, { code?: string }> } })
      ?.response as { data?: Record<string, { code?: string }> } | undefined
    return Object.entries(fieldErrors)
      .map(([field, message]) => {
        const code = response?.data?.[field]?.code
        return `${prettyFieldLabel(field)}: ${prettifyMessage(message, code)}`
      })
      .join(' · ')
  }
  if (error instanceof Error && error.message) return error.message
  if (typeof (error as { message?: unknown })?.message === 'string') {
    const raw = (error as { message: string }).message
    if (raw) return raw
  }
  return fallback
}

/** Mensagem de erro amigável para toasts e diálogos do app. */
export function getErrorMessage(error: unknown, fallback = 'Erro inesperado.'): string {
  return formatDetailedErrorMessage(error, fallback)
}
