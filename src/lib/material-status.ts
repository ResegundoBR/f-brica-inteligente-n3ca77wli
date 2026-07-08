import { MaterialShortage } from '@/types'

export type MaterialAvailabilityStatus = 'red' | 'yellow' | 'green' | 'none'

export function getMaterialAvailabilityStatus(
  shortages: MaterialShortage[] | undefined,
): MaterialAvailabilityStatus {
  if (!shortages || shortages.length === 0) return 'none'

  const active = shortages.filter((s) => s.status !== 'Cancelado')
  if (active.length === 0) return 'none'

  const resolvedStatuses = ['Recebido', 'Liberado_Estoque']
  const pendingStatuses = ['Pendente', 'Cotação', 'Compra']

  const allResolved = active.every((s) => resolvedStatuses.includes(s.status))
  if (allResolved) return 'green'

  const hasResolved = active.some(
    (s) => resolvedStatuses.includes(s.status) || s.status === 'Recebido_Parcial',
  )
  if (hasResolved) return 'yellow'

  const allPending = active.every((s) => pendingStatuses.includes(s.status))
  if (allPending) return 'red'

  return 'red'
}

export function groupShortagesByOrder(
  shortages: MaterialShortage[],
): Record<string, MaterialShortage[]> {
  const map: Record<string, MaterialShortage[]> = {}
  for (const s of shortages) {
    if (!s.order_id) continue
    if (!map[s.order_id]) map[s.order_id] = []
    map[s.order_id].push(s)
  }
  return map
}
