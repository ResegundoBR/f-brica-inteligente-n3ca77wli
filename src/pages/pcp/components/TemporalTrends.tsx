import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Line, LineChart } from 'recharts'
import { TrendingUp, Timer, CalendarCheck } from 'lucide-react'
import {
  startOfWeek,
  endOfWeek,
  subWeeks,
  format,
  isWithinInterval,
  parseISO,
  isValid,
  isBefore,
} from 'date-fns'

interface TemporalTrendsProps {
  orders: any[]
}

export function TemporalTrends({ orders }: TemporalTrendsProps) {
  const weeklyData = useMemo(() => {
    const now = new Date()
    const weeks: {
      week: string
      concluded: number
      avgLeadTime: number
      onTimePct: number
    }[] = []

    for (let i = 7; i >= 0; i--) {
      const ws = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 })
      const we = endOfWeek(subWeeks(now, i), { weekStartsOn: 1 })

      const weekOrders = orders.filter((o) => {
        if (o.status !== 'Concluído' || !o.finished_at) return false
        const d = parseISO(o.finished_at)
        if (!isValid(d)) return false
        return isWithinInterval(d, { start: ws, end: we })
      })

      const leadTimes = weekOrders
        .map((o) => {
          const finish = parseISO(o.finished_at)
          const start = o.started_at ? parseISO(o.started_at) : parseISO(o.created)
          if (!isValid(finish) || !isValid(start)) return null
          return (finish.getTime() - start.getTime()) / 36e5
        })
        .filter((t): t is number => t !== null && t >= 0 && t < 10000)

      const avgLeadTime =
        leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 0

      const onTime = weekOrders.filter((o) => {
        if (!o.delivery_date) return true
        const delivery = parseISO(o.delivery_date)
        const finish = parseISO(o.finished_at)
        if (!isValid(delivery) || !isValid(finish)) return true
        return !isBefore(delivery, finish)
      }).length

      weeks.push({
        week: format(ws, 'dd/MM'),
        concluded: weekOrders.length,
        avgLeadTime: Math.round(avgLeadTime * 10) / 10,
        onTimePct: weekOrders.length > 0 ? Math.round((onTime / weekOrders.length) * 100) : 0,
      })
    }
    return weeks
  }, [orders])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="size-4 text-indigo-500" />
          Tendências Temporais
        </CardTitle>
        <CardDescription>Evolução nas últimas 8 semanas</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
            <CalendarCheck className="size-3" /> OPs Concluídas por Semana
          </p>
          <ChartContainer
            config={{ concluded: { label: 'Concluídas', color: '#10B981' } }}
            className="h-[140px] w-full"
          >
            <BarChart data={weeklyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={false}
                fontSize={10}
                tickMargin={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={10}
                tickMargin={8}
                allowDecimals={false}
              />
              <ChartTooltip
                cursor={{ fill: 'var(--color-secondary)' }}
                content={<ChartTooltipContent />}
              />
              <Bar dataKey="concluded" fill="var(--color-concluded)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
            <Timer className="size-3" /> Lead Time Médio (horas)
          </p>
          <ChartContainer
            config={{ avgLeadTime: { label: 'Lead Time', color: '#3B82F6' } }}
            className="h-[140px] w-full"
          >
            <LineChart data={weeklyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={false}
                fontSize={10}
                tickMargin={8}
              />
              <YAxis tickLine={false} axisLine={false} fontSize={10} tickMargin={8} />
              <ChartTooltip
                cursor={{ fill: 'var(--color-secondary)' }}
                content={<ChartTooltipContent />}
              />
              <Line
                type="monotone"
                dataKey="avgLeadTime"
                stroke="var(--color-avgLeadTime)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ChartContainer>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
            <TrendingUp className="size-3" /> % Entregas no Prazo
          </p>
          <ChartContainer
            config={{ onTimePct: { label: 'No Prazo', color: '#8B5CF6' } }}
            className="h-[140px] w-full"
          >
            <LineChart data={weeklyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={false}
                fontSize={10}
                tickMargin={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={10}
                tickMargin={8}
                domain={[0, 100]}
              />
              <ChartTooltip
                cursor={{ fill: 'var(--color-secondary)' }}
                content={<ChartTooltipContent />}
              />
              <Line
                type="monotone"
                dataKey="onTimePct"
                stroke="var(--color-onTimePct)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  )
}
