import { MaterialShortage } from '@/types'

export interface ShortageGroup {
  key: string
  code: string
  description: string
  totalQuantity: number
  items: MaterialShortage[]
  sectors: string[]
  highestPriority?: string
  hasNew: boolean
  opCount: number
}

const PRIORITY_ORDER: Record<string, number> = {
  Urgente: 3,
  'Próximos dias': 2,
  'Sem pressa': 1,
}

export function normalizeGroupKey(code?: string | null, description?: string | null): string {
  const normCode = (code || '').trim().toLowerCase()
  const normDesc = (description || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

  if (normCode) {
    return `code:${normCode}`
  }
  return `desc:${normDesc}`
}

export function groupShortagesByCode(
  items: MaterialShortage[],
  isNewFn?: (id: string) => boolean,
): ShortageGroup[] {
  const map = new Map<string, MaterialShortage[]>()

  for (const item of items) {
    const key = normalizeGroupKey(item.code, item.description)
    const existing = map.get(key)
    if (existing) {
      existing.push(item)
    } else {
      map.set(key, [item])
    }
  }

  const groups: ShortageGroup[] = []

  for (const [key, groupItems] of map.entries()) {
    const representative = groupItems[0]
    const totalQuantity = groupItems.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0)

    const sectorSet = new Set<string>()
    let highestPriority = ''
    let highestPriorityScore = 0
    let hasNew = false

    const opSet = new Set<string>()

    for (const item of groupItems) {
      if (item.sector?.trim()) {
        sectorSet.add(item.sector.trim())
      }
      if (item.priority) {
        const score = PRIORITY_ORDER[item.priority] || 0
        if (score > highestPriorityScore) {
          highestPriorityScore = score
          highestPriority = item.priority
        }
      }
      if (isNewFn && isNewFn(item.id)) {
        hasNew = true
      }
      const opNum = item.expand?.order_id?.op_number || item.expand?.order_id?.order_number
      if (opNum) {
        opSet.add(opNum)
      } else if (item.order_id) {
        opSet.add(item.order_id)
      } else {
        opSet.add(item.id)
      }
    }

    groups.push({
      key,
      code: representative.code || '',
      description: representative.description,
      totalQuantity,
      items: groupItems,
      sectors: Array.from(sectorSet),
      highestPriority: highestPriority || representative.priority || undefined,
      hasNew,
      opCount: opSet.size || groupItems.length,
    })
  }

  return groups
}
