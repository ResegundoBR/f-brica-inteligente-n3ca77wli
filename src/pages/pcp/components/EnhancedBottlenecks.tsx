import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, Minus, AlertOctagon, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { subDays } from 'date-fns'

interface EnhancedBottlenecksProps {
  orders: any[]
  logs: any[]
}

function formatDuration(hours: number): string {
  if (hours <= 0) return '0min'
  if (hours < 1) return `${Math.round(hours * 60)}min`
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`
  const days = Math.floor(hours / 24)
  const remH = Math.round((hours % 24) * 10) / 10
  return `${days}d ${remH}h`
}

function getStoppedSince(order: any, allLogs: any[]): Date {
  const orderLogs = allLogs
    .filter((l) => l.order_id === order.id)
    .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())

  for (let i = orderLogs.length - 1; i >= 0; i--) {
    const log = orderLogs[i]
    const text = `${log.action || ''} ${log.details || ''} ${log.stage || ''}`.toLowerCase()
    if (text.includes('parado')) {
      return new Date(log.created)
    }
  }
  return new Date(order.updated)
}

export function EnhancedBottlenecks({ orders, logs }: EnhancedBottlenecksProps) {
  const stoppedOrders = useMemo(() => {
    return orders
      .filter((o) => o.status === 'Parado')
      .map((o) => {
        const since = getStoppedSince(o, logs)
        return {
          ...o,
          stoppedSince: since,
          stoppedHours: (Date.now() - since.getTime()) / (1000 * 60 * 60),
        }
      })
      .sort((a, b) => b.stoppedHours - a.stoppedHours)
  }, [orders, logs])

  const avgIdleTime = useMemo(() => {
    if (stoppedOrders.length === 0) return 0
    return stoppedOrders.reduce((sum, o) => sum + o.stoppedHours, 0) / stoppedOrders.length
  }, [stoppedOrders])

  const { prevStoppedCount, prevAvgIdleTime } = useMemo(() => {
    const now = new Date()
    const weekAgo = subDays(now, 7)
    const twoWeeksAgo = subDays(now, 14)

    const prevStopLogs = logs.filter((l) => {
      const created = new Date(l.created)
      const text = `${l.action || ''} ${l.details || ''}`.toLowerCase()
      return text.includes('parado') && created >= twoWeeksAgo && created < weekAgo
    })

    const prevCount = new Set(prevStopLogs.map((l) => l.order_id)).size
    const prevDurations: number[] = []

    const byOrder = new Map<string, any[]>()
    prevStopLogs.forEach((l) => {
      if (!byOrder.has(l.order_id)) byOrder.set(l.order_id, [])
      byOrder.get(l.order_id)!.push(l)
    })

    byOrder.forEach((stopLogs, orderId) => {
      stopLogs.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())
      stopLogs.forEach((stopLog) => {
        const stopTime = new Date(stopLog.created)
        const orderLogs = logs
          .filter((l) => l.order_id === orderId)
          .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())
        const nextLog = orderLogs.find((l) => new Date(l.created) > stopTime)
        const endTime = nextLog ? new Date(nextLog.created) : weekAgo
        const duration = (endTime.getTime() - stopTime.getTime()) / (1000 * 60 * 60)
        if (duration > 0 && duration < 500) prevDurations.push(duration)
      })
    })

    const prevAvg =
      prevDurations.length > 0 ? prevDurations.reduce((a, b) => a + b, 0) / prevDurations.length : 0

    return { prevStoppedCount: prevCount, prevAvgIdleTime: prevAvg }
  }, [logs])

  const countDiff = stoppedOrders.length - prevStoppedCount
  const avgDiff =
    prevAvgIdleTime > 0 ? ((avgIdleTime - prevAvgIdleTime) / prevAvgIdleTime) * 100 : 0
  const top5 = stoppedOrders.slice(0, 5)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertOctagon className="size-4 text-orange-500" />
          Gargalos Aprimorados
        </CardTitle>
        <CardDescription>Tempo médio parado e OPs com maior tempo de parada</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3 bg-orange-50/50 dark:bg-orange-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Tempo Médio Parado</span>
              {prevAvgIdleTime > 0 && (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[9px]',
                    avgDiff < 0 ? 'text-green-600 border-green-300' : 'text-red-600 border-red-300',
                  )}
                >
                  {avgDiff < 0 ? (
                    <TrendingDown className="size-2.5" />
                  ) : (
                    <TrendingUp className="size-2.5" />
                  )}
                  {Math.abs(Math.round(avgDiff))}%
                </Badge>
              )}
            </div>
            <p className="text-lg font-bold mt-1">
              <Clock className="size-3.5 inline mr-1 text-orange-500" />
              {formatDuration(avgIdleTime)}
            </p>
          </div>
          <div className="rounded-lg border p-3 bg-red-50/50 dark:bg-red-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">OPs Travadas</span>
              {prevStoppedCount > 0 && (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[9px]',
                    countDiff < 0
                      ? 'text-green-600 border-green-300'
                      : countDiff > 0
                        ? 'text-red-600 border-red-300'
                        : '',
                  )}
                >
                  {countDiff < 0 ? (
                    <TrendingDown className="size-2.5" />
                  ) : countDiff > 0 ? (
                    <TrendingUp className="size-2.5" />
                  ) : (
                    <Minus className="size-2.5" />
                  )}
                  {countDiff > 0 ? '+' : ''}
                  {countDiff}
                </Badge>
              )}
            </div>
            <p className="text-lg font-bold mt-1 text-red-600">{stoppedOrders.length}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">Top 5 OPs Travadas</p>
          {top5.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhuma OP travada no momento.
            </p>
          ) : (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {top5.map((op, idx) => (
                <div
                  key={op.id}
                  className="flex items-start gap-2 p-2 rounded-md border bg-background/60 text-xs"
                >
                  <span className="font-bold text-muted-foreground shrink-0">#{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold truncate">{op.order_number}</span>
                      <span className="text-muted-foreground truncate">
                        — {op.expand?.client_id?.name || op.client_name}
                      </span>
                    </div>
                    {op.op_number && (
                      <span className="text-[10px] text-muted-foreground">OP: {op.op_number}</span>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge
                        variant="outline"
                        className="text-[9px] text-orange-600 border-orange-300"
                      >
                        {op.bottleneck_reason || 'Nenhum'}
                      </Badge>
                      <span className="text-orange-600 font-semibold">
                        {formatDuration(op.stoppedHours)}
                      </span>
                    </div>
                    {op.bottleneck_details && (
                      <p className="text-[10px] text-muted-foreground italic mt-1 line-clamp-2">
                        {op.bottleneck_details}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
