import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Truck, AlertTriangle, CheckCircle } from 'lucide-react'
import { parseISO, isBefore, startOfDay, isValid } from 'date-fns'
import type { OrdemCompra, Supplier } from '@/types'

interface SupplierPerformanceCardsProps {
  ocs: OrdemCompra[]
  suppliers: Supplier[]
}

interface SupplierPerf {
  key: string
  name: string
  total: number
  onTime: number
  delayed: number
  received: number
}

export function SupplierPerformanceCards({ ocs, suppliers }: SupplierPerformanceCardsProps) {
  const supplierMap = useMemo(() => {
    const m = new Map<string, Supplier>()
    for (const s of suppliers) m.set(s.id, s)
    return m
  }, [suppliers])

  const groups = useMemo(() => {
    const today = startOfDay(new Date())
    const map = new Map<string, SupplierPerf>()
    for (const oc of ocs) {
      const key = oc.supplier_id || oc.supplier || 'sem-fornecedor'
      const name = oc.supplier_id
        ? supplierMap.get(oc.supplier_id)?.name || oc.supplier || 'Sem fornecedor'
        : oc.supplier || 'Sem fornecedor'
      if (!map.has(key)) {
        map.set(key, { key, name, total: 0, onTime: 0, delayed: 0, received: 0 })
      }
      const g = map.get(key)!
      g.total++
      const isReceived = oc.status === 'Recebida'
      const isCancelled = oc.status === 'Cancelada'
      if (isReceived) {
        g.received++
        g.onTime++
      }
      if (!isReceived && !isCancelled && oc.expected_date) {
        const d = parseISO(oc.expected_date)
        if (isValid(d) && isBefore(startOfDay(d), today)) {
          g.delayed++
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [ocs, supplierMap])

  if (groups.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {groups.map((g) => (
        <Card key={g.key} className="overflow-hidden">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm truncate" title={g.name}>
                {g.name}
              </span>
              <Badge variant="secondary" className="text-xs shrink-0">
                {g.total} OCs
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-2">
                <CheckCircle className="w-4 h-4 mx-auto text-green-600 mb-1" />
                <p className="text-lg font-bold text-green-700 dark:text-green-400">{g.onTime}</p>
                <p className="text-[10px] text-muted-foreground">No prazo</p>
              </div>
              <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-2">
                <AlertTriangle className="w-4 h-4 mx-auto text-red-600 mb-1" />
                <p className="text-lg font-bold text-red-700 dark:text-red-400">{g.delayed}</p>
                <p className="text-[10px] text-muted-foreground">Atrasadas</p>
              </div>
              <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 p-2">
                <Truck className="w-4 h-4 mx-auto text-blue-600 mb-1" />
                <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{g.received}</p>
                <p className="text-[10px] text-muted-foreground">Recebidas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
