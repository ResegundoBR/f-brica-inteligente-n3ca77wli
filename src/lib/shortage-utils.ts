export function sanitizeNumber(
  value: string | number | null | undefined,
  defaultValue: number = 0,
  min?: number,
): number {
  if (value === null || value === undefined || value === '') return defaultValue
  const num = Number(value)
  if (!Number.isFinite(num)) return defaultValue
  if (min !== undefined && num < min) return min
  return num
}

export function sanitizeDate(value: string | null | undefined): string | null {
  if (!value || (typeof value === 'string' && value.trim() === '')) return null
  return value.trim()
}

export function sanitizeString(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return ''
  return value.trim()
}

export function sanitizeSelectValue(
  value: string | null | undefined,
  validValues: string[],
  defaultValue: string,
): string {
  if (!value || !validValues.includes(value)) return defaultValue
  return value
}

export const VALID_PRIORITIES: string[] = ['Sem pressa', 'Próximos dias', 'Urgente']
export const VALID_REQUEST_TYPES: string[] = ['Ferramentas', 'Materiais', 'Produtos', 'Insumos']
export const VALID_STATUSES: string[] = [
  'Pendente',
  'Liberado_Estoque',
  'Cotação',
  'Compra',
  'Recebido',
  'Recebido_Parcial',
  'Cancelado',
]
