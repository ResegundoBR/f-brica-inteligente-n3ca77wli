import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PcpOrder } from '@/types'
import { startOfDay, isSameDay, addDays, isSameWeek, isBefore, parseISO, isValid } from 'date-fns'
import { AlertOctagon, CalendarClock, CalendarDays, CalendarRange } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DeadlineAlertsProps {
  orders: PcpOrder[]
}

interface DeadlineGroup {
  key: string
  label: string
  icon: typeof AlertOctagon
  variant: 'overdue' | 'today' | 'tomorrow' | 'week'
  items: PcpOrder[]
}

export function DeadlineAlerts({ orders }: DeadlineAlertsProps) {
  const today = startOfDay(new Date())
  const tomorrow = addDays(today, 1)

  const overdue: PcpOrder[] = []
  const dueToday: PcpOrder[] = []
  const dueTomorrow: PcpOrder[] = []
  const dueThisWeek: PcpOrder[] = []

  orders.forEach((o) => {
    if (!o.delivery_date) return
    const d = parseISO(o.delivery_date)
    if (!isValid(d)) return
    const dayStart = startOfDay(d)

    const isOverdue = isBefore(dayStart, today) && o.status !== 'Concluído'
    if (isOverdue) {
      overdue.push(o)
      return
    }
    if (isSameDay(dayStart, today)) {
      dueToday.push(o)
      return
    }
    if (isSameDay(dayStart, tomorrow)) {
      dueTomorrow.push(o)
      return
    }
    if (isSameWeek(d, today, { weekStartsOn: 1 }) && o.status !== 'Concluído') {
      dueThisWeek.push(o)
    }
  })

  const groups: DeadlineGroup[] = [
    { key: 'overdue', label: 'Vencidas', icon: AlertOctagon, variant: 'overdue', items: overdue },
    { key: 'today', label: 'Vencem Hoje', icon: CalendarClock, variant: 'today', items: dueToday },
    {
      key: 'tomorrow',
      label: 'Vencem Amanhã',
      icon: CalendarDays,
      variant: 'tomorrow',
      items: dueTomorrow,
    },
    {
      key: 'week',
      label: 'Vencem Esta Semana',
      icon: CalendarRange,
      variant: 'week',
      items: dueThisWeek,
    },
  ]

  const variantStyles: Record<string, string> = {
    overdue: 'border-red-300 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20',
    today: 'border-orange-200 dark:border-orange-900',
    tomorrow: 'border-yellow-200 dark:border-yellow-900',
    week: 'border-blue-200 dark:border-blue-900',
  }

  const iconStyles: Record<string, string> = {
    overdue: 'text-red-600',
    today: 'text-orange-600',
    tomorrow: 'text-yellow-600',
    week: 'text-blue-600',
  }

  const badgeVariant: Record<string, 'destructive' | 'secondary' | 'outline'> = {
    overdue: 'destructive',
    today: 'secondary',
    tomorrow: 'outline',
    week: 'outline',
  }

  const hasItems = groups.some((g) => g.items.length > 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertOctagon className="size-4 text-red-500" />
          Alertas de Prazo
        </CardTitle>
        <CardDescription>OPs próximas ao vencimento agrupadas por urgência</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasItems ? (
          <div className="flex items-center justify-center h-[120px] text-sm text-muted-foreground">
            Nenhum alerta de prazo no momento.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {groups.map((group) => {
              const Icon = group.icon
              return (
                <div
                  key={group.key}
                  className={cn('rounded-lg border p-3', variantStyles[group.variant])}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={cn('size-4', iconStyles[group.variant])} />
                    <span className="text-sm font-semibold">{group.label}</span>
                    <Badge variant={badgeVariant[group.variant]} className="ml-auto text-[10px]">
                      {group.items.length}
                    </Badge>
                  </div>
                  {group.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">Nenhuma OP.</p>
                  ) : (
                    <div className="space-y-1 max-h-[160px] overflow-y-auto">
                      {group.items.map((op) => (
                        <div
                          key={op.id}
                          className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded bg-background/60"
                        >
                          <span className="font-medium truncate">
                            {`Pedido #${op.order_number} - OP ${op.op_number || 'S/N'}`}
                          </span>
                          <Badge variant="outline" className="text-[9px] shrink-0">
                            {op.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
