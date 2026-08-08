import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isBefore, startOfDay, parseISO, isValid } from 'date-fns'
import { MACRO_GROUPS } from './macro-groups'

interface WorkloadByMacroGroupProps {
  orders: any[]
}

function isOverdue(order: any): boolean {
  if (order.status === 'Concluído' || !order.delivery_date) return false
  const d = parseISO(order.delivery_date)
  if (!isValid(d)) return false
  return isBefore(startOfDay(d), startOfDay(new Date()))
}

export function WorkloadByMacroGroup({ orders }: WorkloadByMacroGroupProps) {
  const groupData = useMemo(() => {
    const activeOrders = orders.filter((o) => o.status !== 'Concluído' && o.status !== 'Parado')
    return MACRO_GROUPS.map((group) => {
      const groupOrders = activeOrders.filter((o) => group.stages.includes(o.stage))
      const overdueOrders = groupOrders.filter(isOverdue)
      return {
        ...group,
        orders: groupOrders,
        count: groupOrders.length,
        overdueCount: overdueOrders.length,
      }
    })
  }, [orders])

  const maxCount = Math.max(...groupData.map((g) => g.count), 1)
  const avgCount = groupData.reduce((sum, g) => sum + g.count, 0) / (groupData.length || 1)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="size-4 text-purple-500" />
          Carga de Trabalho por Macro-Grupo
        </CardTitle>
        <CardDescription>Distribuição de OPs ativas por macro-grupo de produção</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5">
          {groupData.map((group) => {
            const isAbnormal = group.count > avgCount * 1.5 && group.count > 2
            const barWidth = (group.count / maxCount) * 100
            const overdueOps = group.orders.filter(isOverdue)

            return (
              <div key={group.name} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium">{group.name}</span>
                    {isAbnormal && (
                      <Badge variant="destructive" className="text-[8px] px-1 py-0 h-3.5">
                        Acumulado
                      </Badge>
                    )}
                    {group.overdueCount > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[8px] px-1 py-0 h-3.5 text-red-600 border-red-300"
                      >
                        {group.overdueCount} atrasada{group.overdueCount > 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs font-bold">{group.count}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      isAbnormal
                        ? 'bg-red-500'
                        : group.overdueCount > 0
                          ? 'bg-orange-400'
                          : 'bg-blue-500',
                    )}
                    style={{
                      width: `${Math.max(barWidth, group.count > 0 ? 8 : 0)}%`,
                    }}
                  />
                </div>
                {overdueOps.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {overdueOps.slice(0, 5).map((op) => (
                      <span
                        key={op.id}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900"
                      >
                        {op.order_number} — {op.expand?.client_id?.name || op.client_name}
                        {op.op_number && <span className="opacity-60"> · OP: {op.op_number}</span>}
                      </span>
                    ))}
                    {overdueOps.length > 5 && (
                      <span className="text-[9px] text-muted-foreground italic">
                        +{overdueOps.length - 5} mais
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
