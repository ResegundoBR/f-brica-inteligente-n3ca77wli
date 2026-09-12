import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PcpRework } from '@/types'
import { UserActionBadge } from '@/components/UserActionBadge'
import {
  RotateCcw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Timer,
  Search,
  Filter,
  ArrowRight,
  TrendingDown,
  Layers,
  Wrench,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface ReworkManagementPanelProps {
  reworks: PcpRework[]
  loading?: boolean
}

function formatMinutesToDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remMinutes = minutes % 60
  if (hours < 24) {
    return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`
  }
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  if (remHours > 0) {
    return `${days}d ${remHours}h`
  }
  return `${days}d`
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-'
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy HH:mm', { locale: ptBR })
  } catch {
    return dateStr
  }
}

export function ReworkManagementPanel({ reworks, loading = false }: ReworkManagementPanelProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [originSectorFilter, setOriginSectorFilter] = useState<string>('todos')
  const [targetSectorFilter, setTargetSectorFilter] = useState<string>('todos')

  // KPIs
  const totalReworks = reworks.length
  const pendingReworks = reworks.filter((r) => r.status === 'Pendente').length
  const inProgressReworks = reworks.filter((r) => r.status === 'Em Andamento').length
  const completedReworks = reworks.filter((r) => r.status === 'Concluído').length

  const totalDurationMinutes = useMemo(() => {
    return reworks.reduce((acc, r) => acc + (r.duration_minutes || 0), 0)
  }, [reworks])

  const avgResolutionMinutes = useMemo(() => {
    const concludedWithDuration = reworks.filter(
      (r) => r.status === 'Concluído' && r.duration_minutes && r.duration_minutes > 0,
    )
    if (concludedWithDuration.length === 0) return 0
    const sum = concludedWithDuration.reduce((acc, r) => acc + (r.duration_minutes || 0), 0)
    return Math.round(sum / concludedWithDuration.length)
  }, [reworks])

  // Distribuição por setor de origem
  const originDistribution = useMemo(() => {
    const counts: Record<string, number> = {}
    reworks.forEach((r) => {
      const sec = r.origin_sector || 'Não informado'
      counts[sec] = (counts[sec] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [reworks])

  // Distribuição por setor corretor (target_sector)
  const targetDistribution = useMemo(() => {
    const counts: Record<string, number> = {}
    reworks.forEach((r) => {
      const sec = r.target_sector || 'Não informado'
      counts[sec] = (counts[sec] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [reworks])

  // Filtragem da lista
  const filteredReworks = useMemo(() => {
    return reworks.filter((r) => {
      if (statusFilter !== 'todos' && r.status !== statusFilter) return false
      if (originSectorFilter !== 'todos' && r.origin_sector !== originSectorFilter) return false
      if (targetSectorFilter !== 'todos' && r.target_sector !== targetSectorFilter) return false

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase()
        const opNumber = (r.expand?.order_id?.op_number || '').toLowerCase()
        const orderNumber = (r.expand?.order_id?.order_number || '').toLowerCase()
        const clientName = (
          r.expand?.order_id?.client_name ||
          (r.expand?.order_id as any)?.expand?.client_id?.name ||
          ''
        ).toLowerCase()
        const desc = (r.description || '').toLowerCase()
        const signaledBy = (r.expand?.signaled_by?.name || '').toLowerCase()
        const executedBy = (r.expand?.executed_by?.name || '').toLowerCase()
        const originStage = (r.origin_stage || '').toLowerCase()

        const match =
          opNumber.includes(term) ||
          orderNumber.includes(term) ||
          clientName.includes(term) ||
          desc.includes(term) ||
          signaledBy.includes(term) ||
          executedBy.includes(term) ||
          originStage.includes(term)

        if (!match) return false
      }

      return true
    })
  }, [reworks, statusFilter, originSectorFilter, targetSectorFilter, searchTerm])

  const distinctOriginSectors = useMemo(() => {
    return Array.from(new Set(reworks.map((r) => r.origin_sector).filter(Boolean)))
  }, [reworks])

  const distinctTargetSectors = useMemo(() => {
    return Array.from(new Set(reworks.map((r) => r.target_sector).filter(Boolean)))
  }, [reworks])

  return (
    <Card className="border-2 border-amber-500/20 shadow-sm mt-6">
      <CardHeader className="border-b bg-amber-50/40 dark:bg-amber-950/20 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500 text-white shadow-sm">
              <RotateCcw className="size-5" />
            </div>
            <div>
              <CardTitle className="text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Gestão de Retrabalhos
                <Badge
                  variant="outline"
                  className="border-amber-400 text-amber-700 dark:text-amber-300 font-bold ml-1"
                >
                  Qualidade & Eficiência
                </Badge>
              </CardTitle>
              <CardDescription className="text-sm mt-0.5">
                Rastreabilidade de não-conformidades, tempo perdido, reincidências e ações
                preventivas
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Badge variant="secondary" className="px-3 py-1 font-semibold text-xs">
              {totalReworks} {totalReworks === 1 ? 'ocorrência' : 'ocorrências'}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Bloco de KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border p-4 bg-slate-50 dark:bg-slate-900/50">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
              <span>Total de Ocorrências</span>
              <AlertTriangle className="size-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 dark:text-slate-100">
                {totalReworks}
              </span>
              <span className="text-xs text-muted-foreground font-medium">registradas</span>
            </div>
            <div className="mt-2 flex gap-2 text-[11px] font-medium text-muted-foreground">
              <span className="text-amber-600 font-semibold">{pendingReworks} pendentes</span>
              <span>•</span>
              <span className="text-blue-600 font-semibold">{inProgressReworks} em andamento</span>
              <span>•</span>
              <span className="text-green-600 font-semibold">{completedReworks} concluídos</span>
            </div>
          </div>

          <div className="rounded-xl border p-4 bg-red-50/50 dark:bg-red-950/20 border-red-200/60 dark:border-red-900/50">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
              <span className="text-red-700 dark:text-red-300">Tempo Perdido Total</span>
              <Clock className="size-4 text-red-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-red-600 dark:text-red-400">
                {formatMinutesToDuration(totalDurationMinutes)}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Soma do tempo desde a sinalização até a restauração à etapa de origem
            </p>
          </div>

          <div className="rounded-xl border p-4 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/60 dark:border-blue-900/50">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
              <span className="text-blue-700 dark:text-blue-300">Tempo Médio de Resolução</span>
              <Timer className="size-4 text-blue-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-blue-600 dark:text-blue-400">
                {formatMinutesToDuration(avgResolutionMinutes)}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Média por retrabalho já finalizado pelos operadores
            </p>
          </div>

          <div className="rounded-xl border p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/50">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
              <span className="text-emerald-700 dark:text-emerald-300">Taxa de Conclusão</span>
              <CheckCircle2 className="size-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {totalReworks > 0
                  ? `${Math.round((completedReworks / totalReworks) * 100)}%`
                  : '0%'}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {completedReworks} de {totalReworks} retrabalhos corrigidos
            </p>
          </div>
        </div>

        {/* Distribuições: Origem vs Corretor */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Onde foi detectado / Setor de Origem */}
          <div className="rounded-xl border p-4 bg-card">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="size-4 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Distribuição por Setor de Origem (Quem Detectou)
              </h3>
            </div>
            {originDistribution.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Nenhum dado registrado.
              </p>
            ) : (
              <div className="space-y-2.5">
                {originDistribution.map(([sec, count]) => {
                  const pct = totalReworks > 0 ? Math.round((count / totalReworks) * 100) : 0
                  return (
                    <div key={sec} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-slate-700 dark:text-slate-300 font-semibold">
                          {sec}
                        </span>
                        <span className="text-muted-foreground">
                          {count} {count === 1 ? 'caso' : 'casos'} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Quem Corrigiu / Setor Corretor */}
          <div className="rounded-xl border p-4 bg-card">
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="size-4 text-blue-500" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Distribuição por Setor Corretor (Quem Executou/Retoque)
              </h3>
            </div>
            {targetDistribution.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Nenhum dado registrado.
              </p>
            ) : (
              <div className="space-y-2.5">
                {targetDistribution.map(([sec, count]) => {
                  const pct = totalReworks > 0 ? Math.round((count / totalReworks) * 100) : 0
                  return (
                    <div key={sec} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-slate-700 dark:text-slate-300 font-semibold">
                          {sec}
                        </span>
                        <span className="text-muted-foreground">
                          {count} {count === 1 ? 'correção' : 'correções'} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Tabela de Ocorrências com Filtros */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por OP, cliente, motivo, operador..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-xs w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Status: Todos</SelectItem>
                  <SelectItem value="Pendente">Pendente</SelectItem>
                  <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                  <SelectItem value="Concluído">Concluído</SelectItem>
                </SelectContent>
              </Select>

              {distinctOriginSectors.length > 0 && (
                <Select value={originSectorFilter} onValueChange={setOriginSectorFilter}>
                  <SelectTrigger className="h-9 text-xs w-[140px]">
                    <SelectValue placeholder="Origem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Origem: Todas</SelectItem>
                    {distinctOriginSectors.map((s) => (
                      <SelectItem key={s} value={s}>
                        Origem: {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {distinctTargetSectors.length > 0 && (
                <Select value={targetSectorFilter} onValueChange={setTargetSectorFilter}>
                  <SelectTrigger className="h-9 text-xs w-[140px]">
                    <SelectValue placeholder="Corretor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Corretor: Todos</SelectItem>
                    {distinctTargetSectors.map((s) => (
                      <SelectItem key={s} value={s}>
                        Corretor: {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900/60">
                <TableRow>
                  <TableHead className="text-xs font-bold w-[120px]">OP / Pedido</TableHead>
                  <TableHead className="text-xs font-bold min-w-[200px]">
                    Descrição do que Houve
                  </TableHead>
                  <TableHead className="text-xs font-bold w-[160px]">Origem → Corretor</TableHead>
                  <TableHead className="text-xs font-bold w-[120px]">Status</TableHead>
                  <TableHead className="text-xs font-bold w-[140px]">Sinalizado Por</TableHead>
                  <TableHead className="text-xs font-bold w-[140px]">Executado Por</TableHead>
                  <TableHead className="text-xs font-bold w-[130px]">Datas</TableHead>
                  <TableHead className="text-xs font-bold text-right w-[110px]">
                    Tempo Gasto
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-8 text-sm text-muted-foreground"
                    >
                      Carregando retrabalhos...
                    </TableCell>
                  </TableRow>
                ) : filteredReworks.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-10 text-sm text-muted-foreground"
                    >
                      {reworks.length === 0
                        ? 'Nenhum retrabalho registrado até o momento. Excelente índice de qualidade!'
                        : 'Nenhum retrabalho encontrado para os filtros selecionados.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReworks.map((r) => {
                    const opOrder = r.expand?.order_id
                    const clientName =
                      opOrder?.client_name || (opOrder as any)?.expand?.client_id?.name || '-'

                    return (
                      <TableRow
                        key={r.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40"
                      >
                        <TableCell className="align-top py-3">
                          <div className="flex flex-col">
                            <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                              {opOrder?.op_number
                                ? `OP ${opOrder.op_number}`
                                : opOrder?.order_number || 'OP s/n'}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              Ped: {opOrder?.order_number || '-'}
                            </span>
                            <span
                              className="text-[10px] text-muted-foreground truncate max-w-[110px]"
                              title={clientName}
                            >
                              {clientName}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="align-top py-3">
                          <p className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-medium">
                            {r.description || 'Sem descrição informada.'}
                          </p>
                        </TableCell>

                        <TableCell className="align-top py-3">
                          <div className="flex flex-col gap-1 text-xs">
                            <div className="flex items-center gap-1">
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                              >
                                {r.origin_sector || 'Origem'}
                              </Badge>
                              <ArrowRight className="size-3 text-muted-foreground" />
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                              >
                                {r.target_sector || 'Corretor'}
                              </Badge>
                            </div>
                            <div className="flex flex-col text-[10px] text-muted-foreground">
                              {r.origin_stage && <span>Origem: {r.origin_stage}</span>}
                              {r.target_stage && (
                                <span className="text-blue-600 dark:text-blue-400 font-medium">
                                  Destino: {r.target_stage}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="align-top py-3">
                          <Badge
                            className={
                              r.status === 'Concluído'
                                ? 'bg-green-600 hover:bg-green-600 text-white text-[10px]'
                                : r.status === 'Em Andamento'
                                  ? 'bg-blue-600 hover:bg-blue-600 text-white text-[10px]'
                                  : 'bg-amber-500 hover:bg-amber-500 text-white text-[10px]'
                            }
                          >
                            {r.status}
                          </Badge>
                        </TableCell>

                        <TableCell className="align-top py-3">
                          <div className="flex flex-col text-xs">
                            {r.expand?.signaled_by ? (
                              <UserActionBadge
                                user={r.expand.signaled_by}
                                date={r.signaled_at || r.created}
                                prefix="Sinalizado por"
                                compact={true}
                              />
                            ) : (
                              <UserActionBadge
                                date={r.signaled_at || r.created}
                                fallbackText="Não identificado"
                              />
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="align-top py-3">
                          <div className="flex flex-col text-xs">
                            {r.expand?.executed_by ? (
                              <UserActionBadge
                                user={r.expand.executed_by}
                                date={r.finished_at}
                                prefix="Executado por"
                                compact={true}
                              />
                            ) : (
                              <span className="text-muted-foreground">
                                {r.status === 'Concluído' ? 'Operador' : '-'}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="align-top py-3">
                          <div className="flex flex-col text-[11px] text-muted-foreground gap-0.5">
                            <span title="Data da Sinalização">
                              <strong>Sinaliz.:</strong> {formatDate(r.signaled_at || r.created)}
                            </span>
                            {r.finished_at && (
                              <span title="Data da Conclusão">
                                <strong>Concl.:</strong> {formatDate(r.finished_at)}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="align-top py-3 text-right">
                          {r.duration_minutes && r.duration_minutes > 0 ? (
                            <span className="inline-flex items-center gap-1 font-bold text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded border border-red-200 dark:border-red-900/50">
                              <Clock className="size-3" />
                              {formatMinutesToDuration(r.duration_minutes)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Em curso</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
