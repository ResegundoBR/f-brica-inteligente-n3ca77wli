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
  delivery_terms: 'Condições de Entrega',
  payment_terms: 'Condições de Pagamento',
  delivery_type: 'Tipo de Entrega',
  total: 'Valor Total',
  user_id: 'Usuário Responsável',
  oc_number: 'Número da OC',
  status: 'Status',
  code: 'Código',
  description: 'Descrição',
  quantity: 'Quantidade',
  unit_price: 'Preço Unitário',
  st_value: 'Valor ST',
  ipi_value: 'Valor IPI',
  material_shortage_id: 'Item de Falta',
  oc_id: 'Ordem de Compra',
  received_quantity: 'Quantidade Recebida',
  sector: 'Setor',
  priority: 'Prioridade',
  request_type: 'Tipo de Requisição',
  order_id: 'Ordem de Produção',
  requested_by: 'Solicitante',
  batch_id: 'Lote',
  batch_info: 'Informações do Lote',
  observation: 'Observação',
  inventory_id: 'Item de Estoque',
  type: 'Tipo de Movimento',
  reason: 'Motivo',
}

const ERROR_MESSAGE_TRANSLATIONS: Record<string, string> = {
  'Must be a valid datetime.': 'Data inválida.',
  'Value cannot be blank.': 'Obrigatório.',
  'Cannot be blank.': 'Obrigatório.',
  'Failed to create record.': 'Falha ao criar registro.',
  'Failed to update record.': 'Falha ao atualizar registro.',
}

function translateErrorMessage(msg: string): string {
  if (!msg) return ''
  const trimmed = msg.trim()
  if (ERROR_MESSAGE_TRANSLATIONS[trimmed]) {
    return ERROR_MESSAGE_TRANSLATIONS[trimmed]
  }
  if (
    trimmed.toLowerCase().includes('valid datetime') ||
    trimmed.toLowerCase().includes('valid date')
  ) {
    return 'Data inválida.'
  }
  if (
    trimmed.toLowerCase().includes('cannot be blank') ||
    trimmed.toLowerCase().includes('required')
  ) {
    return 'Obrigatório.'
  }
  return trimmed
}

export function formatDetailedErrorMessage(
  error: unknown,
  fallbackMessage = 'Ocorreu um erro inesperado.',
): string {
  if (!error) return fallbackMessage

  // PocketBase ClientResponseError ou objeto { response: { message, data } } / { code, message, data }
  let data: Record<string, any> | undefined = undefined
  let mainMsg: string | undefined = undefined

  if (error instanceof ClientResponseError) {
    mainMsg = error.message
    data = error.response?.data
  } else if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, any>
    if (errObj.response && typeof errObj.response === 'object') {
      mainMsg = errObj.response.message || errObj.message
      data = errObj.response.data
    } else if (errObj.data && typeof errObj.data === 'object') {
      mainMsg = errObj.message
      data = errObj.data
    } else if (typeof errObj.message === 'string') {
      mainMsg = errObj.message
    }
  } else if (typeof error === 'string') {
    return error
  }

  const fieldParts: string[] = []

  if (data && typeof data === 'object') {
    for (const [field, detail] of Object.entries(data)) {
      const fieldLabel = FIELD_LABELS_PT[field] || field
      let detailMsg = ''

      if (typeof detail === 'string') {
        detailMsg = translateErrorMessage(detail)
      } else if (
        detail &&
        typeof detail === 'object' &&
        'message' in detail &&
        typeof (detail as any).message === 'string'
      ) {
        detailMsg = translateErrorMessage((detail as any).message)
      } else if (
        detail &&
        typeof detail === 'object' &&
        'code' in detail &&
        typeof (detail as any).code === 'string'
      ) {
        const code = (detail as any).code
        if (code === 'validation_required') detailMsg = 'Obrigatório.'
        else if (code.includes('invalid_date')) detailMsg = 'Data inválida.'
        else detailMsg = code
      }

      if (detailMsg) {
        // Remove ponto final do detalhe se houver, para manter elegância na concatenação
        const cleanDetail = detailMsg.replace(/\.$/, '')
        fieldParts.push(`${fieldLabel}: ${cleanDetail}`)
      }
    }
  }

  if (fieldParts.length > 0) {
    return fieldParts.join('; ')
  }

  if (mainMsg && mainMsg.trim()) {
    return mainMsg
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage
}
