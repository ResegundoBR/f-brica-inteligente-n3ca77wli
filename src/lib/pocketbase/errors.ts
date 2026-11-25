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

// NÃO REMOVER: usado por ComprasPage, EditOrdemCompraModal, OrdemCompraModal e
// ordens-compra.test.ts (já foi apagado 3 vezes e quebrou o build 3 vezes).
// Aceita um erro PocketBase (ou qualquer objeto/string) e um fallback opcional;
// 2º parâmetro adicionado para Suprimentos (formatDetailedErrorMessage(err, fallback)).

const FIELD_LABELS: Record<string, string> = {
  expected_date: 'Previsão de Entrega',
  'data.delivery_forecast': 'Previsão de Entrega',
  delivery_forecast: 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  oc_number: 'Número da OC',
  total: 'Total',
  itens: 'Itens',
  quantity: 'Quantidade',
  unit_price: 'Valor Unitário',
}

interface FieldErrorDetail {
  code?: string
  message: string
}

function friendlyFieldMessage(detail: FieldErrorDetail): string {
  const m = `${detail.code || ''} ${detail.message}`.toLowerCase()
  if (/(blank|required|empty)/.test(m)) return 'Obrigatório'
  if (/invalid/.test(m)) return 'Data inválida'
  return detail.message
}

export function formatDetailedErrorMessage(error: unknown, fallback?: string): string {
  let base = fallback || ''
  const fieldErrors: Record<string, FieldErrorDetail> = {}

  const collect = (data: unknown) => {
    if (!data || typeof data !== 'object') return
    for (const [field, detail] of Object.entries(data as Record<string, unknown>)) {
      if (
        detail &&
        typeof detail === 'object' &&
        'message' in detail &&
        typeof (detail as { message: unknown }).message === 'string'
      ) {
        const d = detail as { code?: unknown; message: string }
        fieldErrors[field] = {
          code: typeof d.code === 'string' ? d.code : undefined,
          message: d.message,
        }
      }
    }
  }

  if (error instanceof ClientResponseError) {
    collect(error.response?.data)
    if (!base) base = error.message || ''
  } else if (error && typeof error === 'object') {
    const response = (error as { response?: { message?: string; data?: unknown } }).response
    collect(response?.data)
    if (!base) base = response?.message || ''
  } else if (typeof error === 'string' && error) {
    base = error
  }

  const parts = Object.entries(fieldErrors).map(([field, detail]) => {
    const label = FIELD_LABELS[field] || field
    return `${label}: ${friendlyFieldMessage(detail)}`
  })

  if (parts.length > 0) return parts.join(' ')
  return base || 'Erro inesperado.'
}
