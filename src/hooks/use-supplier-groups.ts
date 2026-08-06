import { useMemo } from 'react'
import type { MaterialShortage } from '@/types'

export interface SupplierGroup {
  supplier: string
  items: MaterialShortage[]
  totalValue: number
}

export function useSupplierGroups(items: MaterialShortage[]): SupplierGroup[] {
  return useMemo(() => {
    const groups = new Map<string, MaterialShortage[]>()
    for (const item of items) {
      const key = (item.supplier || '').trim()
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    const result: SupplierGroup[] = []
    let noSupplier: MaterialShortage[] = []
    for (const [supplier, groupItems] of groups) {
      if (!supplier) {
        noSupplier = groupItems
      } else {
        const totalValue = groupItems.reduce(
          (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
          0,
        )
        result.push({ supplier, items: groupItems, totalValue })
      }
    }
    result.sort((a, b) => a.supplier.localeCompare(b.supplier, 'pt-BR'))
    if (noSupplier.length > 0) {
      const totalValue = noSupplier.reduce(
        (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
        0,
      )
      result.push({ supplier: '', items: noSupplier, totalValue })
    }
    return result
  }, [items])
}
