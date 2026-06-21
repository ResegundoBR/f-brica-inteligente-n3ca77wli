import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { parseISO, startOfDay, isBefore } from 'date-fns'
import { PcpOrder, MaterialShortage, Log } from '@/types'
import { Loader2 } from 'lucide-react'

export default function PcpDashboard() {
  const [orders, setOrders] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ordersData, logsData, shortagesData] = await Promise.all([
          pb.collection('pcp_orders').getFullList({ sort: '-created' }),
          pb.collection('pcp_order_logs').getFullList({ sort: 'created' }),
          pb.collection('material_shortages').getFullList({ sort: '-created' }),
        ])
        setOrders(ordersData)
        setLogs(logsData)
        setShortages(shortagesData)
      } catch (err) {
        console.error('Failed to fetch dashboard data', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const onTimeDeliveryData = useMemo(() => {
    const completed = orders.filter((o) => o.status === 'Concluído')
    let onTime = 0
    let late = 0

    completed.forEach((o) => {
      if (!o.delivery_date) return
      const deliveryDate = startOfDay(parseISO(o.delivery_date))
      const finishDate = o.finished_at
        ? startOfDay(parseISO(o.finished_at))
        : startOfDay(parseISO(o.updated))
      if (isBefore(deliveryDate, finishDate)) {
        late++
      } else {
        onTime++
      }
    })

    return [
      { name: 'No Prazo', value: onTime },
      { name: 'Atrasado', value: late },
    ]
  }, [orders])

  const bottlenecksData = useMemo(() => {
    const counts: Record<string, number> = {}
    orders.forEach((o) => {
      if (o.bottleneck_reason && o.bottleneck_reason !== 'Nenhum') {
        counts[o.bottleneck_reason] = (counts[o.bottleneck_reason] || 0) + 1
      }
    })
    return Object.entries(counts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
  }, [orders])

  const shortageRanking = useMemo(() => {
    const counts: Record<string, number> = {}
    shortages.forEach((s) => {
      if (s.status !== 'Cancelado') {
        const key = s.description || s.code || 'Desconhecido'
        counts[key] = (counts[key] || 0) + 1
      }
    })
    return Object.entries(counts)
      .map(([material, count]) => ({ material, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [shortages])

  const leadTimeData = useMemo(() => {
    const stageTimes: Record<string, number[]> = {}
    const orderLogs = logs.reduce((acc, log) => {
      if (!acc[log.order_id]) acc[log.order_id] = []
      acc[log.order_id].push(log)
      return acc
    }, {})

    Object.values(orderLogs).forEach((orderLogList: any[]) => {
      let currentStage = orderLogList[0].stage
      let stageEnterTime = new Date(orderLogList[0].created).getTime()

      for (let i = 1; i < orderLogList.length; i++) {
        const log = orderLogList[i]
        if (log.stage && log.stage !== currentStage) {
          const timeSpent = (new Date(log.created).getTime() - stageEnterTime) / (1000 * 3600) // hours
          if (!stageTimes[currentStage]) stageTimes[currentStage] = []
          if (timeSpent >= 0 && timeSpent < 1000) {
            // filter out unreasonable outliers
            stageTimes[currentStage].push(timeSpent)
          }

          currentStage = log.stage
          stageEnterTime = new Date(log.created).getTime()
        }
      }
    })

    return Object.entries(stageTimes)
      .map(([stage, times]) => ({
        stage,
        horas: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      }))
      .sort((a, b) => b.horas - a.horas)
      .slice(0, 10)
  }, [logs])

  const workloadData = useMemo(() => {
    const activeOrders = orders.filter((o) => o.status !== 'Concluído' && o.status !== 'Parado')
    const counts: Record<string, number> = {}
    activeOrders.forEach((o) => {
      if (o.stage) {
        counts[o.stage] = (counts[o.stage] || 0) + 1
      }
    })
    return Object.entries(counts)
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count)
  }, [orders])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard PCP</h1>
        <p className="text-muted-foreground mt-1">
          Indicadores de desempenho, gargalos e lead time de produção.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* On-Time Delivery */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entregas no Prazo</CardTitle>
            <CardDescription>Pedidos concluídos na data ou antes</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px]">
            {onTimeDeliveryData.reduce((acc, curr) => acc + curr.value, 0) === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Nenhum pedido concluído.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={onTimeDeliveryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {onTimeDeliveryData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.name === 'No Prazo' ? '#10B981' : '#EF4444'}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: 'none',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Bottlenecks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Painel de Gargalos</CardTitle>
            <CardDescription>OPs travadas por motivo</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px]">
            {bottlenecksData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Nenhum gargalo registrado.
              </div>
            ) : (
              <ChartContainer
                config={{ count: { label: 'Ocorrências', color: '#F59E0B' } }}
                className="h-full w-full"
              >
                <BarChart
                  data={bottlenecksData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="reason"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    tickMargin={8}
                  />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} tickMargin={8} />
                  <ChartTooltip
                    cursor={{ fill: 'var(--color-secondary)' }}
                    content={<ChartTooltipContent />}
                  />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Workload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Carga de Trabalho (OPs Ativas)</CardTitle>
            <CardDescription>Volume de OPs em andamento por etapa</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px]">
            {workloadData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Nenhuma OP em andamento.
              </div>
            ) : (
              <ChartContainer
                config={{ count: { label: 'OPs', color: '#8B5CF6' } }}
                className="h-full w-full"
              >
                <BarChart
                  data={workloadData}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    tickMargin={8}
                  />
                  <YAxis
                    dataKey="stage"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    tickMargin={8}
                    width={80}
                  />
                  <ChartTooltip
                    cursor={{ fill: 'var(--color-secondary)' }}
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Lead Time */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Lead Time Médio por Setor (Horas)</CardTitle>
            <CardDescription>Tempo médio histórico gasto em cada etapa</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px]">
            {leadTimeData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Dados insuficientes.
              </div>
            ) : (
              <ChartContainer
                config={{ horas: { label: 'Horas', color: '#3B82F6' } }}
                className="h-full w-full"
              >
                <BarChart data={leadTimeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="stage"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    tickMargin={8}
                  />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} tickMargin={8} />
                  <ChartTooltip
                    cursor={{ fill: 'var(--color-secondary)' }}
                    content={<ChartTooltipContent />}
                  />
                  <Bar dataKey="horas" fill="var(--color-horas)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Shortages Ranking */}
        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Índice de Ruptura</CardTitle>
            <CardDescription>Top materiais com maior ocorrência de falta</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Faltas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shortageRanking.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground h-[150px]">
                      Nenhuma ruptura registrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  shortageRanking.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium text-xs py-2">{item.material}</TableCell>
                      <TableCell className="text-right text-xs py-2">{item.count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
