import { Card, CardContent } from '@/components/ui/card'
import {
  Activity,
  AlertTriangle,
  Pause,
  CheckCircle2,
  CalendarDays,
  CalendarRange,
  Package,
  Layers,
  Sparkles,
  LifeBuoy,
  Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PcpOrder } from '@/types'
import {
  startOfDay,
  isSameDay,
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

  const ordersByNumber: Record<string, PcpOrder[]> = {}
  orders.forEach((o) => {
    const key = o.order_number || o.id
    if (!ordersByNumber[key]) ordersByNumber[key] = []
    ordersByNumber[key].push(o)
  })
  const uniqueOrderNumbers = Object.keys(ordersByNumber)

  const totalPedidos = uniqueOrderNumbers.length

  const pedidosByType: Record<string, number> = { Linha: 0, Especial: 0, Assistência: 0 }
  uniqueOrderNumbers.forEach((orderNumber) => {
    const ops = ordersByNumber[orderNumber]
    const type = ops[0]?.op_type || 'Linha'
    if (pedidosByType[type] !== undefined) pedidosByType[type]++
  })

  let pedidosAtrasados = 0
  let pedidosNoPrazo = 0
  let pedidosTravados = 0
  uniqueOrderNumbers.forEach((orderNumber) => {
    const ops = ordersByNumber[orderNumber]
    const hasStuck = ops.some((o) => o.status === 'Parado')
    const hasDelayed = ops.some((o) => {
      if (o.status === 'Concluído' || !o.delivery_date) return false
      const d = parseISO(o.delivery_date)
      return isValid(d) && isBefore(startOfDay(d), today)
    })
    if (hasStuck) pedidosTravados++
    else if (hasDelayed) pedidosAtrasados++
    else pedidosNoPrazo++
  })

  const active = orders.filter((o) => o.status === 'Em Andamento' || o.status === 'Fila').length
  const delayed = orders.filter((o) => {
    if (o.status === 'Concluído' || !o.delivery_date) return false
    const d = parseISO(o.delivery_date)
    return isValid(d) && isBefore(startOfDay(d), today)
  }).length
  const stuck = orders.filter((o) => o.status === 'Parado').length
  const completedThisMonth = orders.filter((o) => {
    if (o.status !== 'Concluído' || !o.finished_at) return false
    const d = parseISO(o.finished_at)
    return isValid(d) && isWithinInterval(d, { start: startOfMonth(today), end: endOfMonth(today) })
  }).length
  const deliveriesToday = orders.filter((o) => {
    if (!o.delivery_date) return false
    const d = parseISO(o.delivery_date)
    return isValid(d) && isSameDay(startOfDay(d), today)
  }).length
  const deliveriesThisWeek = orders.filter((o) => {
    if (!o.delivery_date) return false
    const d = parseISO(o.delivery_date)
    return isValid(d) && isSameWeek(d, today, { weekStartsOn: 1 })
  }).length

  const pedidosKpis: KpiConfig[] = [
    {
      label: 'Total de Pedidos',
      value: totalPedidos,
      icon: Package,
      colorClass: 'text-blue-600',
      iconColor: 'bg-blue-100 dark:bg-blue-950',
    },
    {
      label: 'Linha',
      value: pedidosByType['Linha'],
      icon: Layers,
      colorClass: 'text-cyan-600',
      iconColor: 'bg-cyan-100 dark:bg-cyan-950',
    },
    {
      label: 'Especial',
      value: pedidosByType['Especial'],
      icon: Sparkles,
      colorClass: 'text-amber-600',
      iconColor: 'bg-amber-100 dark:bg-amber-950',
    },
    {
      label: 'Assistência',
      value: pedidosByType['Assistência'],
      icon: LifeBuoy,
      colorClass: 'text-purple-600',
      iconColor: 'bg-purple-100 dark:bg-purple-950',
    },
    {
      label: 'Atrasados',
      value: pedidosAtrasados,
      icon: AlertTriangle,
      colorClass: 'text-red-600',
      iconColor: 'bg-red-100 dark:bg-red-950',
    },
    {
      label: 'No Prazo',
      value: pedidosNoPrazo,
      icon: CheckCircle2,
      colorClass: 'text-green-600',
      iconColor: 'bg-green-100 dark:bg-green-950',
    },
    {
      label: 'Travados',
      value: pedidosTravados,
      icon: Lock,
      colorClass: 'text-orange-600',
      iconColor: 'bg-orange-100 dark:bg-orange-950',
    },
  ]

  const opsKpis: KpiConfig[] = [
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

  const renderKpi = (kpi: KpiConfig) => {
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
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-muted-foreground mb-2">Pedidos</p>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {pedidosKpis.map(renderKpi)}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-muted-foreground mb-2">Ordens de Produção (OPs)</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {opsKpis.map(renderKpi)}
        </div>
      </div>
    </div>
  )
}
