export const STATUS_COLOR_VARIANTS: Record<string, string> = {
  warning: '#FFEB3B',
  orange: '#FF9800',
  purple: '#9C27B0',
  success: '#4CAF50',
}

export function resolveStatusColor(color: string | undefined, name: string): string {
  if (color && STATUS_COLOR_VARIANTS[color]) return STATUS_COLOR_VARIANTS[color]
  if (color && color.startsWith('#')) return color

  const lower = name.toLowerCase()
  if (lower === 'falta docs' || lower === 'iniciado') return '#FFEB3B'
  if (lower === 'pronto p/ revisão' || lower === 'revisão') return '#FF9800'
  if (lower === 'rev fábrica' || lower === 'ajuste/pendência' || lower === 'pendência')
    return '#9C27B0'
  if (lower === 'validado') return '#4CAF50'

  return color || '#94a3b8'
}
