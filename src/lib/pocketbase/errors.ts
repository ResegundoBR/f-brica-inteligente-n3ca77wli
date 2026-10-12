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

export function formatDetailedErrorMessage(error: any, fallbackMessage?: string): string {
  if (!error) return fallbackMessage || ''

  const fieldNameMap: Record<string, string> = {
    fornecedor: 'Fornecedor',
    ordem_compra: 'Nº OC',
    previsao_entrega: 'Previsão de Entrega',
    condicoes_pagamento: 'Condições de Pagamento',
    tipo_frete: 'Tipo de Frete',
    prazo_dias: 'Prazo em Dias',
    items: 'Itens',
  }

  // Extração ampla de dados de erro por campo
  const collected: [string, string][] = []
  const candidates = [error?.data?.data, error?.response?.data, error?.data, error?.fields]

  for (const src of candidates) {
    if (src && typeof src === 'object') {
      for (const [key, val] of Object.entries(src)) {
        if (typeof val === 'object' && val && 'message' in val) {
          collected.push([key, String((val as any).message)])
        } else if (typeof val === 'string') {
          collected.push([key, val])
        }
      }
    }
  }

  if (collected.length === 0) {
    const fromExtract = extractFieldErrors(error)
    for (const [k, v] of Object.entries(fromExtract)) {
      collected.push([k, v])
    }
  }

  if (collected.length > 0) {
    const unique = new Map<string, string>()
    for (const [k, v] of collected) {
      if (!unique.has(k)) unique.set(k, v)
    }
    return Array.from(unique.entries())
      .map(([field, msg]) => `${fieldNameMap[field] || field}: ${msg}`)
      .join('; ')
  }

  return error.message || fallbackMessage || 'Erro ao processar requisição.'
}
