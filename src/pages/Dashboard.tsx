import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ReferenceLine, Legend } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Product, Log } from '@/types'

const TARGET = 242

function Gauge({ value, max }: { value: number; max: number }) {
  const percentage = Math.min(value / max, 1)
  const angle = percentage * 180

  let color = '#22C55E' // Default to Green (181-242)
  if (value <= 30)
    color = '#EF4444' // Red
  else if (value <= 75)
    color = '#F97316' // Orange
  else if (value <= 120)
    color = '#C084FC' // Lilac
  else if (value <= 180) color = '#3B82F6' // Blue

  return (
    <div className="relative w-full aspect-[2/1] max-h-[180px] mx-auto overflow-hidden flex items-end justify-center">
      <svg viewBox="0 0 200 115" className="w-full h-full drop-shadow-sm overflow-visible">
        <path
          d="M 20 90 A 80 80 0 0 1 180 90"
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="20"
          strokeLinecap="round"
        />
        <path
          d="M 20 90 A 80 80 0 0 1 180 90"
          fill="none"
          stroke={color}
          strokeWidth="20"
          strokeLinecap="round"
          strokeDasharray="251.327"
          strokeDashoffset={251.327 - percentage * 251.327}
          className="transition-all duration-1000 ease-out"
        />
        <g
          transform={`translate(100, 90) rotate(${angle - 90})`}
          className="transition-all duration-1000 ease-out"
        >
          <path d="M -4 0 L 0 -65 L 4 0 Z" fill="hsl(var(--foreground))" />
          <circle cx="0" cy="0" r="8" fill="hsl(var(--foreground))" />
          <circle cx="0" cy="0" r="3" fill="hsl(var(--background))" />
        </g>
        <text x="100" y="112" textAnchor="middle" className="text-sm font-bold fill-foreground">
          {value} / {max}
        </text>
      </svg>
    </div>
  )
}

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([])
  const [statuses, setStatuses] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [logs, setLogs] = useState<Log[]>([])

  const loadData = async () => {
    try {
      const [prodRes, statRes, usersRes, logsRes] = await Promise.all([
        pb.collection('products').getFullList<Product>(),
        pb.collection('product_statuses').getFullList(),
        pb.collection('users').getFullList(),
        pb.collection('activity_logs').getFullList<Log>(),
      ])
      setProducts(prodRes)
      setStatuses(statRes)
      setUsers(usersRes)
      setLogs(logsRes)
    } catch {
      /* intentionally ignored */
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useRealtime('products', () => {
    loadData()
  })
  useRealtime('product_statuses', () => {
    loadData()
  })
  useRealtime('activity_logs', () => {
    loadData()
  })

  const getStatusInfo = (names: string[], fallbackLabel: string, defaultColor: string) => {
    const st = statuses.find((s) => names.includes(s.name.toLowerCase()))
    const count = st ? products.filter((p) => p.status === st.id).length : 0
    const percentage = ((count / TARGET) * 100).toFixed(1)
    return { count, color: defaultColor, label: st?.name || fallbackLabel, percentage }
  }

  const kpiIniciado = getStatusInfo(['iniciado', 'rascunho'], 'Iniciado', '#F97316')
  const kpiRevisao = getStatusInfo(['revisão', 'revisao'], 'Revisão', '#3B82F6')
  const kpiPendencia = getStatusInfo(['pendência', 'pendencia'], 'Pendência', '#EF4444')
  const kpiValidado = getStatusInfo(['validado'], 'Validado', '#22C55E')

  const totalProducts = products.length
  const faltam = Math.max(TARGET - totalProducts, 0)
  const faltamPercentage = ((faltam / TARGET) * 100).toFixed(1)
  const totalPercentage = ((totalProducts / TARGET) * 100).toFixed(1)
  const today = new Date().getTime()
  const validadoId = statuses.find((s) => s.name?.toLowerCase() === 'validado')?.id

  const idleProducts = products
    .filter((p) => {
      const diff = Math.floor((today - new Date(p.updated).getTime()) / (1000 * 3600 * 24))
      return diff > 5 && p.status !== validadoId
    })
    .map((p) => {
      const st = statuses.find((s) => s.id === p.status)
      return {
        ...p,
        daysIdle: Math.floor((today - new Date(p.updated).getTime()) / (1000 * 3600 * 24)),
        statusName: st?.name || 'Desconhecido',
        statusColor: st?.color || 'hsl(var(--muted-foreground))',
      }
    })

  const last14Days = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (13 - i))
    return d.toISOString().split('T')[0]
  })

  const chartData = last14Days.map((dateStr) => {
    const dateObj = new Date(dateStr)
    // Fix timezone offset for string display
    dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset())

    // Cadastros: products created on this date
    const cadastros = products.filter((p) => p.created.startsWith(dateStr)).length

    return {
      date: dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      cadastros,
    }
  })

  const chartConfig = {
    cadastros: {
      label: 'Cadastros',
      color: '#3B82F6',
    },
  }

  // User Activity Data
  const userActivityCounts: Record<string, number> = {}
  logs.forEach((l) => {
    if (l.user_id) {
      userActivityCounts[l.user_id] = (userActivityCounts[l.user_id] || 0) + 1
    }
  })

  const userActivityData = Object.entries(userActivityCounts)
    .map(([userId, count]) => {
      const user = users.find((u) => u.id === userId)
      return {
        name: user?.name?.split(' ')[0] || 'Desconhecido',
        count,
      }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10) // Top 10 users

  const userActivityConfig = {
    count: {
      label: 'Ações',
      color: '#8B5CF6',
    },
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Evolução dos Trabalhos</h1>
        <p className="text-muted-foreground">
          Visão geral de produtividade e acompanhamento da meta de cadastros.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card className="border-l-4" style={{ borderLeftColor: '#D946EF' }}>
          <CardContent className="p-4 flex flex-col justify-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Faltam Cadastrar{' '}
              <span className="text-gray-500 dark:text-gray-400 normal-case ml-1">
                ({faltamPercentage}%)
              </span>
            </p>
            <h3 className="text-2xl font-bold mt-1" style={{ color: '#D946EF' }}>
              {faltam}
            </h3>
          </CardContent>
        </Card>

        {[kpiIniciado, kpiRevisao, kpiPendencia, kpiValidado].map((kpi) => (
          <Card key={kpi.label} className="border-l-4" style={{ borderLeftColor: kpi.color }}>
            <CardContent className="p-4 flex flex-col justify-center">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                {kpi.label}{' '}
                <span className="text-gray-500 dark:text-gray-400 normal-case ml-1">
                  ({kpi.percentage}%)
                </span>
              </p>
              <h3 className="text-2xl font-bold mt-1" style={{ color: kpi.color }}>
                {kpi.count}
              </h3>
            </CardContent>
          </Card>
        ))}

        <Card className="border-l-4" style={{ borderLeftColor: 'hsl(var(--foreground))' }}>
          <CardContent className="p-4 flex flex-col justify-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Total{' '}
              <span className="text-gray-500 dark:text-gray-400 normal-case ml-1">
                ({totalPercentage}%)
              </span>
            </p>
            <h3 className="text-2xl font-bold mt-1">{totalProducts}</h3>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Progresso de Cadastros</CardTitle>
            <CardDescription>Meta: {TARGET} produtos</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] flex items-center justify-center relative pt-6">
            <Gauge value={totalProducts} max={TARGET} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Produtividade da Equipe</CardTitle>
            <CardDescription>Cadastros realizados nos últimos 14 dias</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] pt-4">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={12}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                <ReferenceLine
                  y={8}
                  stroke="#EF4444"
                  strokeDasharray="3 3"
                  label={{
                    position: 'insideTopLeft',
                    value: 'Meta Diária (8)',
                    fill: '#EF4444',
                    fontSize: 12,
                    fontWeight: 'bold',
                  }}
                />
                <ChartTooltip
                  cursor={{ fill: 'var(--color-secondary)' }}
                  content={<ChartTooltipContent />}
                />
                <Bar
                  dataKey="cadastros"
                  fill="var(--color-cadastros)"
                  radius={[4, 4, 0, 0]}
                  name="Cadastros"
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Atividade por Usuário</CardTitle>
            <CardDescription>Total de ações (edições, status) no sistema</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {userActivityData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                Nenhuma atividade registrada.
              </div>
            ) : (
              <ChartContainer config={userActivityConfig} className="h-full w-full">
                <BarChart
                  data={userActivityData}
                  margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
                  layout="vertical"
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    fontSize={12}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    fontSize={12}
                    width={80}
                  />
                  <ChartTooltip
                    cursor={{ fill: 'var(--color-secondary)' }}
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[0, 4, 4, 0]}
                    name="Ações"
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cadastros Parados (Mais de 5 dias)</CardTitle>
            <CardDescription>Atenção necessária para itens ociosos.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[300px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Últ. Atualização</TableHead>
                  <TableHead className="text-right">Parado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {idleProducts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground py-6 text-sm"
                    >
                      Nenhum cadastro parado encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  idleProducts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-sm py-2">{p.name}</TableCell>
                      <TableCell className="py-2">
                        <Badge
                          variant="outline"
                          style={{ borderColor: p.statusColor, color: p.statusColor }}
                        >
                          {p.statusName}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground">
                        {new Date(p.updated).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right text-destructive font-bold text-sm py-2">
                        {p.daysIdle}d
                      </TableCell>
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
