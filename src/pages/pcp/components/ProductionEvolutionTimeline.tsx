import React, { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Database,
  History,
  TrendingDown,
  TrendingUp,
  Minus,
  Sparkles,
  BarChart3,
  List,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatQuantity } from '@/lib/pcp-utils'
import { PcpOrder, PcpProductionSnapshot } from '@/types'
import {
  CalculatedSnapshotMetrics,
  computeHistoricalSnapshotFromOrders,
} from '@/services/pcp-production-snapshots'
import { format, subDays, startOfDay } from 'date-fns'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  Legend,
} from 'recharts'

interface ProductionEvolutionTimelineProps {
  orders: PcpOrder[]
  persistedSnapshots: PcpProductionSnapshot[]
  todayUnits: { total: number; delayed: number }
}

interface DayEvolutionPoint {
  dateStr: string // YYYY-MM-DD
  displayDate: string // DD/MM
  dayOfWeek: string
  total: number
  delayed: number
  toStart: number
  inProcess: number
  expedition: number
  linha: number
  especial: number
  assistencia: number
  entered: number
  exited: number
  balance: number
  isPersisted: boolean
  isToday: boolean
}

export function ProductionEvolutionTimeline({
  orders,
  persistedSnapshots,
  todayUnits,
}: ProductionEvolutionTimelineProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart')
  const [daysWindow, setDaysWindow] = useState<number>(60)

  // Mapa de snapshots persistidos por data 'YYYY-MM-DD'
  const persistedMap = useMemo(() => {
    const map = new Map<string, PcpProductionSnapshot>()
    persistedSnapshots.forEach((s) => {
      if (s.reference_date) {
        map.set(s.reference_date, s)
      }
    })
    return map
  }, [persistedSnapshots])

  // Gera os últimos N dias (de hoje para trás até daysWindow dias)
  const evolutionData: DayEvolutionPoint[] = useMemo(() => {
    const today = startOfDay(new Date())
    const points: DayEvolutionPoint[] = []

    // Constroi de daysWindow até 0 (hoje)
    for (let i = daysWindow - 1; i >= 0; i--) {
      const d = subDays(today, i)
      const dStr = format(d, 'yyyy-MM-dd')
      const isToday = i === 0

      const persisted = persistedMap.get(dStr)

      if (isToday) {
        // Se o snapshot de hoje já estiver persistido com entered/exited, usa; se não, calcula das OPs
        let enteredToday =
          persisted?.entered_units !== undefined ? Number(persisted.entered_units) : undefined
        let exitedToday =
          persisted?.exited_units !== undefined ? Number(persisted.exited_units) : undefined

        if (enteredToday === undefined || exitedToday === undefined) {
          const compToday = computeHistoricalSnapshotFromOrders(orders, d)
          enteredToday = compToday.enteredUnits ?? 0
          exitedToday = compToday.exitedUnits ?? 0
        }

        points.push({
          dateStr: dStr,
          displayDate: format(d, 'dd/MM'),
          dayOfWeek: format(d, 'EEE'),
          total: todayUnits.total,
          delayed: todayUnits.delayed,
          toStart: 0,
          inProcess: 0,
          expedition: 0,
          linha: 0,
          especial: 0,
          assistencia: 0,
          entered: enteredToday,
          exited: exitedToday,
          balance: enteredToday - exitedToday,
          isPersisted: Boolean(persisted),
          isToday: true,
        })
      } else {
        if (persisted) {
          let ent =
            persisted.entered_units !== undefined ? Number(persisted.entered_units) : undefined
          let ext =
            persisted.exited_units !== undefined ? Number(persisted.exited_units) : undefined

          if (ent === undefined || ext === undefined) {
            const comp = computeHistoricalSnapshotFromOrders(orders, d)
            ent = comp.enteredUnits ?? 0
            ext = comp.exitedUnits ?? 0
          }

          points.push({
            dateStr: dStr,
            displayDate: format(d, 'dd/MM'),
            dayOfWeek: format(d, 'EEE'),
            total: Number(persisted.total_units) || 0,
            delayed: Number(persisted.delayed_units) || 0,
            toStart: Number(persisted.to_start_units) || 0,
            inProcess: Number(persisted.in_process_units) || 0,
            expedition: Number(persisted.expedition_units) || 0,
            linha: Number(persisted.linha_units) || 0,
            especial: Number(persisted.especial_units) || 0,
            assistencia: Number(persisted.assistencia_units) || 0,
            entered: ent,
            exited: ext,
            balance: ent - ext,
            isPersisted: true,
            isToday: false,
          })
        } else {
          // Fallback computado a partir das OPs atuais
          const comp = computeHistoricalSnapshotFromOrders(orders, d)
          const ent = comp.enteredUnits ?? 0
          const ext = comp.exitedUnits ?? 0
          points.push({
            dateStr: dStr,
            displayDate: format(d, 'dd/MM'),
            dayOfWeek: format(d, 'EEE'),
            total: comp.total,
            delayed: comp.delayed,
            toStart: comp.toStart,
            inProcess: comp.inProcess,
            expedition: comp.expedition,
            linha: comp.linha,
            especial: comp.especial,
            assistencia: comp.assistencia,
            entered: ent,
            exited: ext,
            balance: ent - ext,
            isPersisted: false,
            isToday: false,
          })
        }
      }
    }

    return points
  }, [daysWindow, orders, persistedMap, todayUnits])

  // Estatísticas rápidas da janela selecionada
  const stats = useMemo(() => {
    if (evolutionData.length === 0)
      return {
        avgTotal: 0,
        avgDelayed: 0,
        maxDelayed: 0,
        persistedCount: 0,
        totalEntered: 0,
        totalExited: 0,
        totalBalance: 0,
      }
    const totalSum = evolutionData.reduce((acc, p) => acc + p.total, 0)
    const delayedSum = evolutionData.reduce((acc, p) => acc + p.delayed, 0)
    const maxDelayed = Math.max(...evolutionData.map((p) => p.delayed), 0)
    const persistedCount = evolutionData.filter((p) => p.isPersisted).length
    const totalEntered = evolutionData.reduce((acc, p) => acc + p.entered, 0)
    const totalExited = evolutionData.reduce((acc, p) => acc + p.exited, 0)
    const totalBalance = totalEntered - totalExited

    return {
      avgTotal: Math.round(totalSum / evolutionData.length),
      avgDelayed: Math.round(delayedSum / evolutionData.length),
      maxDelayed,
      persistedCount,
      totalEntered,
      totalExited,
      totalBalance,
    }
  }, [evolutionData])

  return (
    <div className="mt-3 pt-3 border-t border-slate-200/70 dark:border-slate-800/70">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen((prev) => !prev)}
            className="h-7 px-2 text-xs font-semibold text-foreground hover:bg-slate-200/60 dark:hover:bg-slate-800/60 gap-1.5"
          >
            <History className="size-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Visão de Evolução (Últimos {daysWindow} dias)</span>
            {isOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </Button>

          <Badge
            variant="outline"
            className="text-[10px] font-normal gap-1 py-0 px-2 border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300"
          >
            <Database className="size-3 text-indigo-500" />
            <span>{stats.persistedCount} snapshot(s) gravado(s)</span>
          </Badge>
        </div>

        {isOpen && (
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border p-0.5 bg-muted/40 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('chart')}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                  viewMode === 'chart'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <BarChart3 className="size-3" />
                <span>Gráfico</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                  viewMode === 'table'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <List className="size-3" />
                <span>Tabela</span>
              </button>
            </div>

            <div className="inline-flex rounded-md border p-0.5 bg-muted/40 text-xs">
              {[30, 60].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDaysWindow(d)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                    daysWindow === d
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="mt-3 space-y-3 animate-in fade-in-50 duration-200">
          {/* Mini resumo de métricas do período */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div className="p-2 rounded border bg-background/80 dark:bg-slate-900/60">
              <span className="text-[10px] text-muted-foreground font-medium block">
                Média Total em Aberto
              </span>
              <span className="text-sm font-bold font-mono">
                {formatQuantity(stats.avgTotal)} unid.
              </span>
            </div>
            <div className="p-2 rounded border bg-background/80 dark:bg-slate-900/60">
              <span className="text-[10px] text-muted-foreground font-medium block">
                Média de Atrasos
              </span>
              <span className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">
                {formatQuantity(stats.avgDelayed)} unid.
              </span>
            </div>
            <div className="p-2 rounded border bg-background/80 dark:bg-slate-900/60">
              <span className="text-[10px] text-muted-foreground font-medium block">
                Pico de Atrasos
              </span>
              <span className="text-sm font-bold font-mono text-red-600 dark:text-red-400">
                {formatQuantity(stats.maxDelayed)} unid.
              </span>
            </div>
            <div className="p-2 rounded border bg-background/80 dark:bg-slate-900/60">
              <span className="text-[10px] text-muted-foreground font-medium block">
                Fluxo Total ({daysWindow}d)
              </span>
              <div className="text-[11px] font-mono leading-tight mt-0.5">
                <span className="text-foreground">+{formatQuantity(stats.totalEntered)}</span> /{' '}
                <span className="text-muted-foreground">-{formatQuantity(stats.totalExited)}</span>
                <div
                  className={cn(
                    'font-bold text-xs inline-flex items-center gap-0.5 ml-1.5',
                    stats.totalBalance < 0 && 'text-emerald-600 dark:text-emerald-400',
                    stats.totalBalance > 0 && 'text-red-600 dark:text-red-400',
                    stats.totalBalance === 0 && 'text-muted-foreground',
                  )}
                >
                  {stats.totalBalance < 0 && <TrendingDown className="size-3 inline" />}
                  {stats.totalBalance > 0 && <TrendingUp className="size-3 inline" />}
                  {stats.totalBalance === 0 && <Minus className="size-3 inline" />}
                  <span>
                    {stats.totalBalance > 0
                      ? `+${formatQuantity(stats.totalBalance)}`
                      : formatQuantity(stats.totalBalance)}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-2 rounded border bg-background/80 dark:bg-slate-900/60">
              <span className="text-[10px] text-muted-foreground font-medium block">
                Fonte dos Dados
              </span>
              <span className="text-[11px] text-muted-foreground">
                <strong className="text-indigo-600 dark:text-indigo-400 font-mono">
                  {stats.persistedCount}
                </strong>{' '}
                gravados /{' '}
                <strong className="text-foreground font-mono">
                  {evolutionData.length - stats.persistedCount}
                </strong>{' '}
                fallback
              </span>
            </div>
          </div>

          {/* Gráfico de evolução diária */}
          {viewMode === 'chart' && (
            <div className="p-3 rounded-lg border bg-background/90 dark:bg-slate-900/50">
              <div className="flex items-center justify-between pb-2 mb-2 border-b text-[11px] text-muted-foreground flex-wrap gap-2">
                <span>Trajetória diária: Volume Total vs. Unidades Atrasadas</span>
                <div className="flex items-center gap-3 text-[10px]">
                  <div className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-blue-500 inline-block" />
                    <span>Total em aberto</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-red-500 inline-block" />
                    <span>Atrasadas</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="size-2 rounded-sm bg-violet-400 inline-block" />
                    <span>Entradas</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="size-2 rounded-sm bg-emerald-400 inline-block" />
                    <span>Saídas</span>
                  </div>
                </div>
              </div>

              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={evolutionData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                    <XAxis
                      dataKey="displayDate"
                      tick={{ fontSize: 10 }}
                      interval={Math.ceil(evolutionData.length / 10)}
                    />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as DayEvolutionPoint
                          return (
                            <div className="p-2 bg-popover text-popover-foreground border rounded shadow-md text-xs space-y-1">
                              <div className="font-semibold flex items-center justify-between gap-2 border-b pb-1">
                                <span>
                                  {data.displayDate} ({data.dateStr})
                                </span>
                                {data.isPersisted ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] py-0 px-1 bg-emerald-50 text-emerald-700 border-emerald-200"
                                  >
                                    Gravado
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] py-0 px-1 bg-slate-50 text-slate-600 border-slate-200"
                                  >
                                    Computado
                                  </Badge>
                                )}
                              </div>
                              <div className="flex justify-between gap-4 text-blue-600 dark:text-blue-400">
                                <span>Total em aberto:</span>
                                <span className="font-mono font-bold">
                                  {formatQuantity(data.total)} unid.
                                </span>
                              </div>
                              <div className="flex justify-between gap-4 text-red-600 dark:text-red-400">
                                <span>Atrasadas:</span>
                                <span className="font-mono font-bold">
                                  {formatQuantity(data.delayed)} unid.
                                </span>
                              </div>
                              <div className="border-t pt-1 mt-1 flex justify-between gap-4 text-[11px] text-muted-foreground">
                                <span>Fluxo diário:</span>
                                <span className="font-mono">
                                  +{formatQuantity(data.entered)} / -{formatQuantity(data.exited)} (
                                  <strong
                                    className={cn(
                                      data.balance < 0 && 'text-emerald-600',
                                      data.balance > 0 && 'text-red-600',
                                    )}
                                  >
                                    saldo {data.balance > 0 ? `+${data.balance}` : data.balance}
                                  </strong>
                                  )
                                </span>
                              </div>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Bar
                      dataKey="delayed"
                      name="Atrasadas"
                      fill="#ef4444"
                      radius={[2, 2, 0, 0]}
                      maxBarSize={14}
                    />
                    <Bar
                      dataKey="entered"
                      name="Entradas"
                      fill="#a78bfa"
                      radius={[2, 2, 0, 0]}
                      maxBarSize={10}
                      opacity={0.7}
                    />
                    <Bar
                      dataKey="exited"
                      name="Saídas"
                      fill="#34d399"
                      radius={[2, 2, 0, 0]}
                      maxBarSize={10}
                      opacity={0.7}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Total Aberto"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Tabela rolável dos snapshots dos últimos dias */}
          {viewMode === 'table' && (
            <div className="rounded-md border bg-background overflow-hidden max-h-[300px] overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 sticky top-0 border-b text-[11px] text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">Data</th>
                    <th className="p-2 font-medium text-right">Total em Aberto</th>
                    <th className="p-2 font-medium text-right">Atrasadas</th>
                    <th className="p-2 font-medium text-right">Entraram</th>
                    <th className="p-2 font-medium text-right">Saíram</th>
                    <th className="p-2 font-medium text-right">Saldo do Dia</th>
                    <th className="p-2 font-medium text-center">Status Histórico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...evolutionData].reverse().map((pt) => (
                    <tr
                      key={pt.dateStr}
                      className={cn(
                        'hover:bg-muted/30 transition-colors',
                        pt.isToday && 'bg-blue-50/40 dark:bg-blue-950/20 font-semibold',
                      )}
                    >
                      <td className="p-2 font-mono">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="size-3 text-muted-foreground" />
                          <span>{pt.displayDate}</span>
                          <span className="text-[10px] text-muted-foreground font-normal">
                            ({pt.dateStr})
                          </span>
                          {pt.isToday && (
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 px-1 border-blue-300 text-blue-700 bg-blue-50"
                            >
                              Hoje
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-foreground">
                        {formatQuantity(pt.total)} unid.
                      </td>
                      <td className="p-2 text-right font-mono">
                        {pt.delayed > 0 ? (
                          <span className="text-red-600 dark:text-red-400 font-semibold">
                            {formatQuantity(pt.delayed)} unid.
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">0</span>
                        )}
                      </td>
                      <td className="p-2 text-right font-mono font-medium text-foreground">
                        {pt.entered > 0 ? (
                          <span className="text-violet-600 dark:text-violet-400">
                            +{formatQuantity(pt.entered)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="p-2 text-right font-mono font-medium text-foreground">
                        {pt.exited > 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {formatQuantity(pt.exited)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="p-2 text-right font-mono font-bold">
                        <span
                          className={cn(
                            pt.balance < 0 && 'text-emerald-600 dark:text-emerald-400',
                            pt.balance > 0 && 'text-red-600 dark:text-red-400',
                            pt.balance === 0 && 'text-muted-foreground',
                          )}
                        >
                          {pt.balance > 0
                            ? `+${formatQuantity(pt.balance)}`
                            : formatQuantity(pt.balance)}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        {pt.isPersisted ? (
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200"
                          >
                            Gravado
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1.5 bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400 border-slate-200"
                          >
                            Computado
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
