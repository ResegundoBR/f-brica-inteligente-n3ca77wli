import { ClientResponseError } from 'pocketbase'

// ⚠️ NÃO REMOVER funções deste arquivo — já quebrou o build 3 vezes por reescrita integral.
// Consumidores de formatDetailedErrorMessage (NÃO REMOVER):
//   - src/pages/pcp/suprimentos/ComprasPage.tsx
//   - src/pages/pcp/suprimentos/components/EditOrdemCompraModal.tsx
//   - src/pages/pcp/suprimentos/components/OrdemCompraModal.tsx
//   - src/services/ordens-compra.test.ts
// Edite por cima (patch pontual), nunca reescreva o arquivo inteiro.

export type FieldErrors = Record<string, string>

// Rótulos amigáveis (pt-BR) para campos de validação do backend.
// NÃO REMOVER — usados por formatDetailedErrorMessage (ver consumidores acima).
const FIELD_LABELS: Record<string, string> = {
  expected_date: 'Previsão de Entrega',
  'data.delivery_forecast': 'Previsão de Entrega',
  delivery_forecast: 'Previsão de Entrega',
  supplier: 'Fornecedor',
  supplier_id: 'Fornecedor',
  oc_number: 'Número da OC',
  total: 'Valor Total',
  payment_terms: 'Condições de Pagamento',
}

const FIELD_FALLBACKS: Record<string, { invalid: string; required: string }> = {
  expected_date: { invalid: 'Data inválida', required: 'Obrigatório' },
  supplier: { required: 'Obrigatório' },
}

function friendlyMessage(field: string, rawMessage: string): string {
  const label = FIELD_LABELS[field] ?? field
  const lower = (rawMessage || '').toLowerCase()
  let msg = rawMessage
  if (lower.includes('valid date') || lower.includes('invalid')) {
    msg = FIELD_FALLBACKS[field]?.invalid ?? 'Data inválida'
  } else if (lower.includes('blank') || lower.includes('required')) {
    msg = FIELD_FALLBACKS[field]?.required ?? 'Obrigatório'
  }
  return `${label}: ${msg}`
}

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

// NÃO REMOVER — formatDetailedErrorMessage: transforma erros de validação do
// PocketBase em mensagem amigável em pt-BR ("Previsão de Entrega: Data inválida").
// Aceita um fallback (string) para quando não há erro de campo identificado.
export function formatDetailedErrorMessage(error: unknown, fallback?: string): string {
  const isClientError = error instanceof ClientResponseError
  const response = (error as { response?: { message?: string; data?: Record<string, unknown> } })
    ?.response
  const data = response?.data

  if (!data || typeof data !== 'object') {
    if (isClientError && response?.message) return response.message
    if (fallback) return fallback
    return error instanceof Error ? error.message : 'Erro inesperado.'
  }

  const parts: string[] = []
  for (const [field, detail] of Object.entries(data)) {
    if (detail && typeof detail === 'object' && 'message' in detail) {
      const rawMessage = (detail as { message: unknown }).message
      if (typeof rawMessage === 'string' && rawMessage) {
        parts.push(friendlyMessage(field, rawMessage))
      }
    }
  }

  if (parts.length > 0) return parts.join(' · ')
  if (fallback) return fallback
  if (isClientError && response?.message) return response.message
  return error instanceof Error ? error.message : 'Erro inesperado.'
}
