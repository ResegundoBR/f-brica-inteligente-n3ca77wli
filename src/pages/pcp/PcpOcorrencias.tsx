import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { AlertCircle, Filter, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PcpOrderDetails } from './components/PcpOrderDetails'
import { cn } from '@/lib/utils'

export default function PcpOcorrencias() {
  const [logs, setLogs] = useState<any[]>([])
  const [activeOrders, setActiveOrders] = useState<any[]>([])
  const [selectedMonth, setSelectedMonth] = useState('all')
  const [activeTab, setActiveTab] = useState('ativos')
  const [selectedOp, setSelectedOp] = useState<any | null>(null)
  const [observations, setObservations] = useState<any[]>([])

  const fetchLogs = () => {
    pb.collection('pcp_order_logs')
      .getFullList({
        filter: "action = 'Parado' || action = 'Gargalo'",
        expand: 'order_id,order_id.product_id,order_id.client_id,user_id',
        sort: '-created',
      })
      .then((res) => {
        const parsed = res.map((log) => {
          let reason = 'Desconhecido'
          let details = log.details || ''

          if (log.details?.includes('Motivo:')) {
            const parts = log.details.split('|')
            reason = parts[0]?.replace('Motivo:', '')?.trim() || ''
            details =
              parts.length > 1 ? parts.slice(1).join('|').replace('Detalhes:', '').trim() : ''
          } else if (log.expand?.order_id?.bottleneck_reason) {
            reason = log.expand.order_id.bottleneck_reason
          } else {
            try {
              const data = JSON.parse(log.details)
              if (data && data.reason) {
                reason = data.reason
                details = data.details || ''
              }
            } catch {
              // ignore
            }
          }

          if (reason === 'Nenhum' || !reason) {
            reason = 'Não Especificado'
          }

          return { ...log, reasonData: { reason, details } }
        })
        setLogs(parsed)
      })
      .catch((err) => {
        console.error(err)
      })
  }

  const fetchActiveOrders = () => {
    pb.collection('pcp_orders')
      .getFullList({
        filter: "status = 'Parado'",
        expand: 'product_id,client_id',
        sort: '-updated',
      })
      .then((res) => {
        setActiveOrders(res)
      })
      .catch((err) => {
        console.error(err)
      })
  }

  useEffect(() => {
    fetchLogs()
    fetchActiveOrders()
  }, [])

  useRealtime('pcp_orders', fetchActiveOrders)
  useRealtime('pcp_order_logs', fetchLogs)

  useEffect(() => {
    if (selectedOp) {
      pb.collection('pcp_order_observations')
        .getFullList({
          filter: `order_id = "${selectedOp.id}"`,
          sort: 'created',
        })
        .then(setObservations)
        .catch((err) => console.error(err))
    } else {
      setObservations([])
    }
  }, [selectedOp])

  // Histórico processing
  const months = useMemo(() => {
    const m = new Set<string>()
    logs.forEach((log) => {
      const date = new Date(log.created)
      m.add(format(date, 'yyyy-MM'))
    })
    return Array.from(m).sort().reverse()
  }, [logs])

  const filteredLogs = useMemo(() => {
    if (selectedMonth === 'all') return logs
    return logs.filter((log) => {
      const dateStr = format(new Date(log.created), 'yyyy-MM')
      return dateStr === selectedMonth
    })
  }, [logs, selectedMonth])

  const chartData = useMemo(() => {
    const counts: Record<string, number> = {}
    filteredLogs.forEach((log) => {
      counts[log.reasonData.reason] = (counts[log.reasonData.reason] || 0) + 1
    })
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [filteredLogs])

  const chartConfig = {
    count: {
      label: 'Ocorrências',
      color: 'hsl(var(--destructive))',
    },
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <AlertCircle className="size-8 text-red-500" />
            Ocorrências e Gargalos
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestão de ordens travadas e histórico de paradas de produção.
          </p>
        </div>
        {activeTab === 'historico' && (
          <div className="flex items-center gap-3 bg-muted/50 p-2 rounded-lg border animate-in fade-in zoom-in duration-200">
            <Filter className="size-4 text-muted-foreground ml-1" />
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[200px] h-9 bg-background">
                <SelectValue placeholder="Filtrar por mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os períodos</SelectItem>
                {months.map((m) => {
                  const date = parseISO(`${m}-01`)
                  return (
                    <SelectItem key={m} value={m}>
                      {format(date, 'MMMM yyyy', { locale: ptBR })}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-[400px] grid-cols-2">
          <TabsTrigger value="ativos" className="gap-2">
            Gargalos Ativos
            {activeOrders.length > 0 && (
              <Badge
                variant="destructive"
                className="ml-1 h-5 px-1.5 min-w-5 flex items-center justify-center text-[10px]"
              >
                {activeOrders.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="historico">Histórico Geral</TabsTrigger>
        </TabsList>

        <TabsContent value="ativos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="size-5 text-red-500" />
                Ordens Atualmente Paradas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Atualizado em</TableHead>
                      <TableHead>OP</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Fase Atual</TableHead>
                      <TableHead>Motivo / Observação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeOrders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Nenhuma ordem travada no momento.
                        </TableCell>
                      </TableRow>
                    )}
                    {activeOrders.map((order) => {
                      const timeDiff = new Date().getTime() - new Date(order.updated).getTime()
                      const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24))
                      const hours = Math.floor((timeDiff / (1000 * 60 * 60)) % 24)
                      const timeStr = days > 0 ? `${days}d ${hours}h` : `${hours}h`

                      return (
                        <TableRow
                          key={order.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setSelectedOp(order)}
                        >
                          <TableCell className="whitespace-nowrap py-2">
                            <div className="flex flex-col gap-1">
                              <span>
                                {format(new Date(order.updated), 'dd/MM/yyyy HH:mm', {
                                  locale: ptBR,
                                })}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
                                <Clock className="size-3" /> parado há {timeStr}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium py-2">{order.order_number}</TableCell>
                          <TableCell className="py-2">
                            <div
                              className="line-clamp-2 max-w-[200px]"
                              title={
                                order.op_type === 'Assistência'
                                  ? order.manual_product_name
                                  : order.expand?.product_id?.name
                              }
                            >
                              {order.op_type === 'Assistência'
                                ? order.manual_product_name
                                : order.op_type === 'Especial'
                                  ? 'Produto Especial'
                                  : order.expand?.product_id?.name || 'S/Produto'}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {order.expand?.client_id?.name || order.client_name}
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge variant="outline">{order.stage}</Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex w-fit items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                {order.bottleneck_reason || 'Não Especificado'}
                              </span>
                              {order.bottleneck_details && (
                                <span
                                  className="text-xs text-muted-foreground line-clamp-2 max-w-[300px]"
                                  title={order.bottleneck_details}
                                >
                                  {order.bottleneck_details}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Ocorrências por Motivo</CardTitle>
              </CardHeader>
              <CardContent className="h-[350px]">
                {chartData.length > 0 ? (
                  <ChartContainer config={chartConfig} className="w-full h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 0, right: 20, bottom: 0, left: 10 }}
                      >
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12 }} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    Nenhum dado no período
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Detalhamento das Paradas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>OP</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>Fase</TableHead>
                        <TableHead>Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            Nenhuma ocorrência encontrada.
                          </TableCell>
                        </TableRow>
                      )}
                      {filteredLogs.map((log) => (
                        <TableRow
                          key={log.id}
                          className={cn(
                            'transition-colors',
                            log.expand?.order_id ? 'cursor-pointer hover:bg-muted/50' : '',
                          )}
                          onClick={() => log.expand?.order_id && setSelectedOp(log.expand.order_id)}
                        >
                          <TableCell className="whitespace-nowrap py-2">
                            {format(new Date(log.created), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </TableCell>
                          <TableCell className="font-medium py-2">
                            {log.expand?.order_id?.order_number}
                          </TableCell>
                          <TableCell className="py-2">
                            <div
                              className="line-clamp-1 max-w-[150px]"
                              title={log.expand?.order_id?.expand?.product_id?.name}
                            >
                              {log.expand?.order_id?.expand?.product_id?.name || 'S/Produto'}
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge variant="outline">
                              {log.stage || log.expand?.order_id?.stage}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex w-fit items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                {log.reasonData.reason}
                              </span>
                              {log.reasonData.details && (
                                <span
                                  className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]"
                                  title={log.reasonData.details}
                                >
                                  {log.reasonData.details}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <PcpOrderDetails
        op={selectedOp}
        observations={observations}
        onClose={() => setSelectedOp(null)}
      />
    </div>
  )
}
