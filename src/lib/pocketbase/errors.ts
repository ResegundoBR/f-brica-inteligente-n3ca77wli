import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

export interface PbFieldDetail {
  code?: string
  message: string
}

const FIELD_LABELS: Record<string, string> = {
  expected_date: 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  total: 'Total',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  description: 'Descrição',
  code: 'Código',
  status: 'Status',
  user_id: 'Usuário',
  oc_id: 'Ordem de Compra',
  material_shortage_id: 'Solicitação de Material',
  batch_id: 'Lote',
  received_quantity: 'Quantidade Recebida',
  inventory_id: 'Item de Estoque',
  type: 'Tipo',
  name: 'Nome',
  email: 'E-mail',
  password: 'Senha',
  passwordConfirm: 'Confirmação de Senha',
}

const ERROR_MESSAGE_TRANSLATIONS: Record<string, string> = {
  'value cannot be blank.': 'Obrigatório',
  'value cannot be blank': 'Obrigatório',
  'cannot be blank.': 'Obrigatório',
  'cannot be blank': 'Obrigatório',
  'must be a valid datetime.': 'Data inválida',
  'must be a valid datetime': 'Data inválida',
  'must be a valid date.': 'Data inválida',
  'must be a valid date': 'Data inválida',
  'failed to create record.': 'Falha ao criar registro.',
  'failed to update record.': 'Falha ao atualizar registro.',
  'failed to delete record.': 'Falha ao excluir registro.',
  'something went wrong while processing your request.':
    'Ocorreu um erro ao processar a requisição.',
}

const CODE_TRANSLATIONS: Record<string, string> = {
  validation_required: 'Obrigatório',
  validation_invalid_date: 'Data inválida',
  validation_invalid_email: 'E-mail inválido',
  validation_invalid_url: 'URL inválida',
  validation_min: 'Valor abaixo do mínimo permitido',
  validation_max: 'Valor acima do máximo permitido',
  validation_not_unique: 'Já existe um registro com este valor',
  validation_not_found: 'Registro não encontrado',
  validation_mismatch: 'Os campos não conferem',
  validation_length: 'Tamanho inválido',
}

function translateErrorMessage(msg: string, code?: string): string {
  if (code && CODE_TRANSLATIONS[code]) {
    return CODE_TRANSLATIONS[code]
  }
  const clean = (msg || '').trim()
  const lower = clean.toLowerCase()
  if (ERROR_MESSAGE_TRANSLATIONS[lower]) {
    return ERROR_MESSAGE_TRANSLATIONS[lower]
  }
  return clean
}

function getFriendlyFieldName(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field]
  return field
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function extractFieldErrors(error: unknown): FieldErrors {
  const data =
    error instanceof ClientResponseError
      ? error.response?.data
      : (error as any)?.response?.data || (error as any)?.data
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

export function formatDetailedErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error) return fallbackMessage || 'Ocorreu um erro inesperado.'

  const response =
    error instanceof ClientResponseError ? error.response : (error as any)?.response || error

  const data = response?.data || (error as any)?.data
  const rawMessage = response?.message || (error as any)?.message

  const fieldParts: string[] = []
  if (data && typeof data === 'object') {
    for (const [field, detail] of Object.entries(data)) {
      if (detail && typeof detail === 'object') {
        const d = detail as { code?: string; message?: string }
        const code = typeof d.code === 'string' ? d.code : undefined
        const rawMsg = typeof d.message === 'string' ? d.message : ''
        const translatedMsg = translateErrorMessage(rawMsg, code)
        if (translatedMsg) {
          const fieldLabel = getFriendlyFieldName(field)
          fieldParts.push(`${fieldLabel}: ${translatedMsg}`)
        }
      } else if (typeof detail === 'string' && detail.trim()) {
        const fieldLabel = getFriendlyFieldName(field)
        fieldParts.push(`${fieldLabel}: ${detail.trim()}`)
      }
    }
  }

  if (fieldParts.length > 0) {
    return fieldParts.join('; ')
  }

  if (typeof rawMessage === 'string' && rawMessage.trim()) {
    const cleanMsg = rawMessage.trim()
    const lower = cleanMsg.toLowerCase()
    if (ERROR_MESSAGE_TRANSLATIONS[lower]) {
      return ERROR_MESSAGE_TRANSLATIONS[lower]
    }
    return cleanMsg
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage || 'Ocorreu um erro inesperado.'
}
