import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { AlertCircle, Filter } from 'lucide-react'

export default function PcpOcorrencias() {
  const [logs, setLogs] = useState<any[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    pb.collection('pcp_order_logs')
      .getFullList({
        expand: 'order_id,order_id.product_id,order_id.client_id,user_id',
        sort: '-created',
      })
      .then((res) => {
        const parsed = res
          .map((log) => {
            try {
              if (!log.details) return null
              const data = JSON.parse(log.details)
              if (data && data.reason) return { ...log, reasonData: data }
              return null
            } catch {
              return null
            }
          })
          .filter(Boolean)
        setLogs(parsed)
      })
  }, [])

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      const date = new Date(log.created).toISOString().split('T')[0]
      if (startDate && date < startDate) return false
      if (endDate && date > endDate) return false
      return true
    })
  }, [logs, startDate, endDate])

  const chartData = useMemo(() => {
    const counts: Record<string, number> = {}
    filtered.forEach((log) => {
      counts[log.reasonData.reason] = (counts[log.reasonData.reason] || 0) + 1
    })
    return Object.entries(counts).map(([name, count]) => ({ name, count }))
  }, [filtered])

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
            Relatório de Ocorrências
          </h1>
          <p className="text-muted-foreground mt-1">Histórico de gargalos e paradas de produção.</p>
        </div>
        <div className="flex items-center gap-3 bg-muted/50 p-2 rounded-lg border">
          <Filter className="size-4 text-muted-foreground ml-1" />
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-auto h-8 text-sm"
          />
          <span className="text-muted-foreground text-sm">até</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-auto h-8 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Frequência por Motivo</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {chartData.length > 0 ? (
              <ChartContainer config={chartConfig} className="w-full h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
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

        <Card className="md:col-span-2">
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
                    <TableHead>Motivo</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhuma ocorrência encontrada.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(log.created), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.expand?.order_id?.order_number}
                      </TableCell>
                      <TableCell>
                        <div
                          className="line-clamp-1 max-w-[150px]"
                          title={log.expand?.order_id?.expand?.product_id?.name}
                        >
                          {log.expand?.order_id?.expand?.product_id?.name || 'S/Produto'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          {log.reasonData.reason}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <div
                          className="line-clamp-2 text-sm text-muted-foreground"
                          title={log.reasonData.details}
                        >
                          {log.reasonData.details || '-'}
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
    </div>
  )
}
