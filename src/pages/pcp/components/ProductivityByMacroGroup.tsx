import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Factory, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MACRO_GROUPS } from './macro-groups'
import { subDays, isAfter, parseISO } from 'date-fns'

interface ProductivityByMacroGroupProps {
  orders: any[]
  logs: any[]
}

type Period = '7d' | '30d' | '90d' | 'all'
const PERIOD_DAYS: Record<Period, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null }

function fmtHours(h: number): string {
  if (h <= 0) return '-'
  if (h < 1) return `${Math.round(h * 60)}min`
  if (h < 24) return `${Math.round(h * 10) / 10}h`
  const d = Math.floor(h / 24)
  return `${d}d ${Math.round((h % 24) * 10) / 10}h`
}

export function ProductivityByMacroGroup({ orders, logs }: ProductivityByMacroGroupProps) {
  const [period, setPeriod] = useState<Period>('30d')

  const periodStart = useMemo(() => {
    const days = PERIOD_DAYS[period]
    return days ? subDays(new Date(), days) : null
  }, [period])

  const stageDurations = useMemo(() => {
    const stageTimes: Record<string, number[]> = {}
    const byOrder: Record<string, any[]> = {}
    logs.forEach((l) => {
      ;(byOrder[l.order_id] ||= []).push(l)
    })
    Object.values(byOrder).forEach((ol) => {
      const s = [...ol].sort(
        (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
      )
      let cur = s[0]?.stage
      let enter = new Date(s[0]?.created).getTime()
      for (let i = 1; i < s.length; i++) {
        if (s[i].stage && s[i].stage !== cur) {
          const t = (new Date(s[i].created).getTime() - enter) / 36e5
          if (cur && t >= 0 && t < 1000) (stageTimes[cur] ||= []).push(t)
          cur = s[i].stage
          enter = new Date(s[i].created).getTime()
        }
      }
    })
    return stageTimes
  }, [logs])

  const groupStats = useMemo(() => {
    return MACRO_GROUPS.map((group) => {
      const ids = new Set<string>()
      logs.forEach((l) => {
        if (group.stages.includes(l.stage)) ids.add(l.order_id)
      })
      orders.forEach((o) => {
        if (group.stages.includes(o.stage)) ids.add(o.id)
      })
      const concluded = orders.filter(
        (o) =>
          o.status === 'Concluído' &&
          ids.has(o.id) &&
          (!periodStart || (o.finished_at && isAfter(parseISO(o.finished_at), periodStart))),
      )
      const times: number[] = []
      group.stages.forEach((st) => {
        if (stageDurations[st]) times.push(...stageDurations[st])
      })
      const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0
      return {
        name: group.name,
        passedThrough: ids.size,
        concludedCount: concluded.length,
        concludedOrders: concluded.slice(0, 5),
        avgPassTime: avg,
        passRate: ids.size > 0 ? (concluded.length / ids.size) * 100 : 0,
      }
    })
  }, [logs, orders, stageDurations, periodStart])

  const chartData = groupStats.map((g) => ({
    name: g.name,
    horas: Math.round(g.avgPassTime * 10) / 10,
  }))

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Factory className="size-4 text-cyan-500" />
              Produtividade por Macro-Grupo
            </CardTitle>
            <CardDescription>Desempenho por setor no período selecionado</CardDescription>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 dias</SelectItem>
              <SelectItem value="30d">30 dias</SelectItem>
              <SelectItem value="90d">90 dias</SelectItem>
              <SelectItem value="all">Tudo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {groupStats.map((g) => (
            <div key={g.name} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{g.name}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px]">
                    <Clock className="size-2.5 mr-0.5" /> {fmtHours(g.avgPassTime)}
                  </Badge>
                  <Badge variant="outline" className="text-[9px] text-green-600 border-green-300">
                    {g.concludedCount} concluídas
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Passaram: {g.passedThrough}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">Concluídas: {g.concludedCount}</span>
                <span className="text-muted-foreground">·</span>
                <span
                  className={cn(
                    'font-medium',
                    g.passRate >= 50 ? 'text-green-600' : 'text-orange-600',
                  )}
                >
                  {Math.round(g.passRate)}% taxa
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    g.passRate >= 50 ? 'bg-green-500' : 'bg-orange-400',
                  )}
                  style={{ width: `${Math.min(g.passRate, 100)}%` }}
                />
              </div>
              {g.concludedOrders.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {g.concludedOrders.map((op) => (
                    <span
                      key={op.id}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900"
                    >
                      {op.order_number} — {op.expand?.client_id?.name || op.client_name}
                      {op.op_number && <span className="opacity-60"> · OP: {op.op_number}</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <ChartContainer
          config={{ horas: { label: 'Horas', color: '#06B6D4' } }}
          className="h-[180px] w-full"
        >
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              fontSize={9}
              tickMargin={8}
              angle={-20}
              textAnchor="end"
              height={50}
            />
            <YAxis tickLine={false} axisLine={false} fontSize={10} tickMargin={8} />
            <ChartTooltip
              cursor={{ fill: 'var(--color-secondary)' }}
              content={<ChartTooltipContent />}
            />
            <Bar dataKey="horas" fill="var(--color-horas)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
