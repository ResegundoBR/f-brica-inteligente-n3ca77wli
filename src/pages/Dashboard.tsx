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
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Product } from '@/types'

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

  const loadData = async () => {
    try {
      const [prodRes, statRes, usersRes] = await Promise.all([
        pb.collection('products').getFullList<Product>(),
        pb.collection('product_statuses').getFullList(),
        pb.collection('users').getFullList(),
      ])
      setProducts(prodRes)
      setStatuses(statRes)
      setUsers(usersRes)
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
    const count = products.filter((p) => p.updated.startsWith(dateStr)).length
    const dateObj = new Date(dateStr)
    // Fix timezone offset for string display
    dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset())
    return {
      date: dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      count,
    }
  })

  const chartConfig = {
    count: {
      label: 'Atividades',
      color: '#22C55E',
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Progresso de Cadastros</CardTitle>
            <CardDescription>Meta: {TARGET} produtos</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] flex items-center justify-center relative pt-6">
            <Gauge value={totalProducts} max={TARGET} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Produtividade da Equipe</CardTitle>
            <CardDescription>Atividades e atualizações nos últimos 14 dias</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] pt-4">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                    value: 'Meta Diária',
                    fill: '#EF4444',
                    fontSize: 12,
                    fontWeight: 'bold',
                  }}
                />
                <ChartTooltip
                  cursor={{ fill: 'var(--color-secondary)' }}
                  content={<ChartTooltipContent />}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#22C55E"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCount)"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cadastros Parados (Mais de 5 dias)</CardTitle>
          <CardDescription>Atenção necessária para itens ociosos (não validados).</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Última Atualização</TableHead>
                <TableHead className="text-right">Dias Parado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {idleProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    Nenhum cadastro parado encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                idleProducts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        style={{ borderColor: p.statusColor, color: p.statusColor }}
                      >
                        {p.statusName}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(p.updated).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right text-destructive font-bold">
                      {p.daysIdle} dias
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
