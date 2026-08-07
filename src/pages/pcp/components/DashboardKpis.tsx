import { Card, CardContent } from '@/components/ui/card'
import {
  Activity,
  AlertTriangle,
  Pause,
  CheckCircle2,
  CalendarDays,
  CalendarRange,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PcpOrder } from '@/types'
import {
  startOfDay,
  isSameDay,
  addDays,
  isSameWeek,
  isBefore,
  parseISO,
  isValid,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
} from 'date-fns'

interface DashboardKpisProps {
  orders: PcpOrder[]
}

interface KpiConfig {
  label: string
  value: number
  icon: typeof Activity
  colorClass: string
  iconColor: string
}

export function DashboardKpis({ orders }: DashboardKpisProps) {
  const today = startOfDay(new Date())
  const tomorrow = addDays(today, 1)

  const active = orders.filter((o) => o.status === 'Em Andamento' || o.status === 'Fila').length

  const delayed = orders.filter((o) => {
    if (o.status === 'Concluído' || !o.delivery_date) return false
    const d = parseISO(o.delivery_date)
    if (!isValid(d)) return false
    return isBefore(startOfDay(d), today)
  }).length

  const stuck = orders.filter((o) => o.status === 'Parado').length

  const completedThisMonth = orders.filter((o) => {
    if (o.status !== 'Concluído' || !o.finished_at) return false
    const d = parseISO(o.finished_at)
    if (!isValid(d)) return false
    return isWithinInterval(d, { start: startOfMonth(today), end: endOfMonth(today) })
  }).length

  const deliveriesToday = orders.filter((o) => {
    if (!o.delivery_date) return false
    const d = parseISO(o.delivery_date)
    if (!isValid(d)) return false
    return isSameDay(startOfDay(d), today)
  }).length

  const deliveriesThisWeek = orders.filter((o) => {
    if (!o.delivery_date) return false
    const d = parseISO(o.delivery_date)
    if (!isValid(d)) return false
    return isSameWeek(d, today, { weekStartsOn: 1 })
  }).length

  const kpis: KpiConfig[] = [
    {
      label: 'OPs Ativas',
      value: active,
      icon: Activity,
      colorClass: 'text-blue-600',
      iconColor: 'bg-blue-100 dark:bg-blue-950',
    },
    {
      label: 'OPs Atrasadas',
      value: delayed,
      icon: AlertTriangle,
      colorClass: 'text-red-600',
      iconColor: 'bg-red-100 dark:bg-red-950',
    },
    {
      label: 'OPs Travadas',
      value: stuck,
      icon: Pause,
      colorClass: 'text-orange-600',
      iconColor: 'bg-orange-100 dark:bg-orange-950',
    },
    {
      label: 'Concluídas no Mês',
      value: completedThisMonth,
      icon: CheckCircle2,
      colorClass: 'text-green-600',
      iconColor: 'bg-green-100 dark:bg-green-950',
    },
    {
      label: 'Entregas Hoje',
      value: deliveriesToday,
      icon: CalendarDays,
      colorClass: 'text-indigo-600',
      iconColor: 'bg-indigo-100 dark:bg-indigo-950',
    },
    {
      label: 'Entregas na Semana',
      value: deliveriesThisWeek,
      icon: CalendarRange,
      colorClass: 'text-violet-600',
      iconColor: 'bg-violet-100 dark:bg-violet-950',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {kpis.map((kpi) => {
        const Icon = kpi.icon
        return (
          <Card key={kpi.label} className="overflow-hidden">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={cn('rounded-lg p-2 shrink-0', kpi.iconColor)}>
                <Icon className={cn('size-5', kpi.colorClass)} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold leading-none">{kpi.value}</p>
                <p className="text-[11px] text-muted-foreground mt-1 truncate">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
