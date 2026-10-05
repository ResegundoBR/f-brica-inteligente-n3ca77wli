import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Boxes,
  AlertTriangle,
  PlayCircle,
  Cog,
  Truck,
  Layers,
  Sparkles,
  LifeBuoy,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Eye,
  ArrowUpRight,
  History,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatQuantity } from '@/lib/pcp-utils'
import { PcpOrder, PcpProductionSnapshot } from '@/types'
import { NoTranslate } from '@/components/NoTranslate'
import { OpReadOnlyModal } from './OpReadOnlyModal'
import {
  fetchProductionSnapshots,
  recordTodaySnapshot,
  getSnapshotForTargetDate,
} from '@/services/pcp-production-snapshots'
import { ProductionEvolutionTimeline } from './ProductionEvolutionTimeline'
import { startOfDay, subDays, parseISO, isValid, isBefore, format } from 'date-fns'

interface ProductsBlockProps {
  orders: PcpOrder[]
}

type CardType =
  | 'total'
  | 'delayed'
  | 'to_start'
  | 'in_process'
  | 'expedition'
  | 'linha'
  | 'especial'
  | 'assistencia'

interface CardDefinition {
  id: CardType
  label: string
  subtitle: string
  value: number
  icon: typeof Boxes
  colorClass: string
  iconColor: string
  borderColor?: string
  filterFn: (op: PcpOrder, today: Date) => boolean
}

export function ProductsBlock({ orders }: ProductsBlockProps) {
  const [selectedCard, setSelectedCard] = useState<CardDefinition | null>(null)
  const [selectedOpForModal, setSelectedOpForModal] = useState<string | null>(null)
  const [isOpModalOpen, setIsOpModalOpen] = useState(false)
  const [persistedSnapshots, setPersistedSnapshots] = useState<PcpProductionSnapshot[]>([])

  const today = useMemo(() => startOfDay(new Date()), [])

  // Carrega snapshots persistidos e garante gravação/atualização de Hoje
  const loadSnapshots = useCallback(async () => {
    try {
      // 1. Grava/atualiza o snapshot de hoje no backend de forma transparente
      await recordTodaySnapshot()
      // 2. Busca histórico persistido
      const list = await fetchProductionSnapshots(60)
      setPersistedSnapshots(list)
    } catch (err) {
      console.warn('Erro ao carregar snapshots no ProductsBlock:', err)
    }
  }, [])

  useEffect(() => {
    loadSnapshots()
  }, [loadSnapshots])

  // APENAS OPs NÃO CONCLUÍDAS (status != 'Concluído')
  const openOrders = useMemo(() => {
    return orders.filter((o) => o.status !== 'Concluído')
  }, [orders])

  // Helper para somar quantidades de uma lista de OPs
  const sumUnits = (ops: PcpOrder[]) =>
    ops.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0)

  // 1. Total de produtos em aberto
  const totalUnits = useMemo(() => sumUnits(openOrders), [openOrders])

  // 2. Produtos atrasados (unidades): delivery_date < hoje
  const delayedOrders = useMemo(() => {
    return openOrders.filter((o) => {
      if (!o.delivery_date) return false
      const d = parseISO(o.delivery_date)
      return isValid(d) && isBefore(startOfDay(d), today)
    })
  }, [openOrders, today])
  const delayedUnits = useMemo(() => sumUnits(delayedOrders), [delayedOrders])

  // 3. Produtos a iniciar (unidades): status === 'Fila'
  const toStartOrders = useMemo(() => {
    return openOrders.filter((o) => o.status === 'Fila')
  }, [openOrders])
  const toStartUnits = useMemo(() => sumUnits(toStartOrders), [toStartOrders])

  // 4. Produtos em processo (unidades): status === 'Em Andamento' || 'Parado'
  const inProcessOrders = useMemo(() => {
    return openOrders.filter((o) => o.status === 'Em Andamento' || o.status === 'Parado')
  }, [openOrders])
  const inProcessUnits = useMemo(() => sumUnits(inProcessOrders), [inProcessOrders])

  // 5. Produtos na expedição (unidades): stage === 'Expedição'
  const expeditionOrders = useMemo(() => {
    return openOrders.filter((o) => o.stage === 'Expedição')
  }, [openOrders])
  const expeditionUnits = useMemo(() => sumUnits(expeditionOrders), [expeditionOrders])

  // 6. Produtos por tipo de OP (Linha / Especial / Assistência Técnica)
  const linhaOrders = useMemo(() => {
    return openOrders.filter((o) => (o.op_type || 'Linha') === 'Linha')
  }, [openOrders])
  const linhaUnits = useMemo(() => sumUnits(linhaOrders), [linhaOrders])

  const especialOrders = useMemo(() => {
    return openOrders.filter((o) => o.op_type === 'Especial')
  }, [openOrders])
  const especialUnits = useMemo(() => sumUnits(especialOrders), [especialOrders])

  const assistenciaOrders = useMemo(() => {
    return openOrders.filter((o) => o.op_type === 'Assistência')
  }, [openOrders])
  const assistenciaUnits = useMemo(() => sumUnits(assistenciaOrders), [assistenciaOrders])

  // Definição dos cards para renderização consistente
  const cards: CardDefinition[] = useMemo(
    () => [
      {
        id: 'total',
        label: 'Total em Aberto',
        subtitle: 'Soma total de unidades em OPs ativas',
        value: totalUnits,
        icon: Boxes,
        colorClass: 'text-blue-600 dark:text-blue-400',
        iconColor: 'bg-blue-100 dark:bg-blue-950',
        filterFn: () => true,
      },
      {
        id: 'delayed',
        label: 'Produtos Atrasados',
        subtitle: 'Prazo de entrega vencido (< hoje)',
        value: delayedUnits,
        icon: AlertTriangle,
        colorClass: 'text-red-600 dark:text-red-400',
        iconColor: 'bg-red-100 dark:bg-red-950',
        filterFn: (op, refDay) => {
          if (!op.delivery_date) return false
          const d = parseISO(op.delivery_date)
          return isValid(d) && isBefore(startOfDay(d), refDay)
        },
      },
      {
        id: 'to_start',
        label: 'A Iniciar (Fila)',
        subtitle: 'Unidades aguardando início do processo',
        value: toStartUnits,
        icon: PlayCircle,
        colorClass: 'text-amber-600 dark:text-amber-400',
        iconColor: 'bg-amber-100 dark:bg-amber-950',
        filterFn: (op) => op.status === 'Fila',
      },
      {
        id: 'in_process',
        label: 'Em Processo',
        subtitle: 'Unidades em andamento ou paradas',
        value: inProcessUnits,
        icon: Cog,
        colorClass: 'text-emerald-600 dark:text-emerald-400',
        iconColor: 'bg-emerald-100 dark:bg-emerald-950',
        filterFn: (op) => op.status === 'Em Andamento' || op.status === 'Parado',
      },
      {
        id: 'expedition',
        label: 'Na Expedição',
        subtitle: 'Unidades na etapa de expedição',
        value: expeditionUnits,
        icon: Truck,
        colorClass: 'text-indigo-600 dark:text-indigo-400',
        iconColor: 'bg-indigo-100 dark:bg-indigo-950',
        filterFn: (op) => op.stage === 'Expedição',
      },
      {
        id: 'linha',
        label: 'Linha',
        subtitle: 'Produtos padrão de catálogo',
        value: linhaUnits,
        icon: Layers,
        colorClass: 'text-cyan-600 dark:text-cyan-400',
        iconColor: 'bg-cyan-100 dark:bg-cyan-950',
        filterFn: (op) => (op.op_type || 'Linha') === 'Linha',
      },
      {
        id: 'especial',
        label: 'Especiais',
        subtitle: 'Produtos sob medida ou modificados',
        value: especialUnits,
        icon: Sparkles,
        colorClass: 'text-purple-600 dark:text-purple-400',
        iconColor: 'bg-purple-100 dark:bg-purple-950',
        filterFn: (op) => op.op_type === 'Especial',
      },
      {
        id: 'assistencia',
        label: 'Assistência Técnica',
        subtitle: 'Garantias, manutenções e reparos',
        value: assistenciaUnits,
        icon: LifeBuoy,
        colorClass: 'text-orange-600 dark:text-orange-400',
        iconColor: 'bg-orange-100 dark:bg-orange-950',
        filterFn: (op) => op.op_type === 'Assistência',
      },
    ],
    [
      totalUnits,
      delayedUnits,
      toStartUnits,
      inProcessUnits,
      expeditionUnits,
      linhaUnits,
      especialUnits,
      assistenciaUnits,
    ],
  )

  // (7) RASTRO DE PRODUÇÃO: faixa comparativa "Há 7 dias / Há 15 dias / Há 30 dias / Hoje"
  // Para cada marco temporal:
  // - total de unidades em aberto naquela data: OP criada <= data E não concluída até aquela data
  // - unidades atrasadas naquela data: delivery_date < data E não concluída até aquela data
  const rastroData = useMemo(() => {
    const calcSnapshot = (refDate: Date) => {
      const dayEnd = new Date(refDate)
      dayEnd.setHours(23, 59, 59, 999)
      const dayStart = startOfDay(refDate)

      let totalInDate = 0
      let delayedInDate = 0

      orders.forEach((op) => {
        // OP criada até a data de referência?
        const createdDate = parseISO(op.created)
        if (!isValid(createdDate) || isBefore(dayEnd, createdDate)) {
          return // criada após esta data
        }

        // Estava concluída até a data?
        // Conclusão inferida por finished_at || updated (quando status == 'Concluído')
        let wasFinished = false
        if (op.status === 'Concluído') {
          const finishDateStr = op.finished_at || op.updated
          if (finishDateStr) {
            const fDate = parseISO(finishDateStr)
            if (isValid(fDate) && !isBefore(dayEnd, fDate)) {
              wasFinished = true
            }
          } else {
            wasFinished = true
          }
        }

        if (wasFinished) return

        // Se estava em aberto na data:
        const qty = Number(op.quantity) || 0
        totalInDate += qty

        // Estava atrasada na data? delivery_date < refDate
        if (op.delivery_date) {
          const dDate = parseISO(op.delivery_date)
          if (isValid(dDate) && isBefore(startOfDay(dDate), dayStart)) {
            delayedInDate += qty
          }
        }
      })

      return { total: totalInDate, delayed: delayedInDate }
    }

    const d30 = subDays(today, 30)
    const d15 = subDays(today, 15)
    const d7 = subDays(today, 7)

    // Lê snapshots gravados mais próximos para 30, 15 e 7 dias, usando fallback computado apenas quando necessário
    const snap30 = getSnapshotForTargetDate(d30, persistedSnapshots, orders)
    const snap15 = getSnapshotForTargetDate(d15, persistedSnapshots, orders)
    const snap7 = getSnapshotForTargetDate(d7, persistedSnapshots, orders)
    const snapToday = { total: totalUnits, delayed: delayedUnits }

    // Tendência hoje vs 7 dias atrás
    // Atrasos caindo: verde (positivo para a fábrica)
    // Atrasos subindo: vermelho (negativo)
    const delayedDiff = snapToday.delayed - snap7.delayed
    const delayedTrend = delayedDiff < 0 ? 'down' : delayedDiff > 0 ? 'up' : 'neutral'

    const totalDiff = snapToday.total - snap7.total
    const totalTrend = totalDiff < 0 ? 'down' : totalDiff > 0 ? 'up' : 'neutral'

    return {
      points: [
        {
          label: 'Há 30 dias',
          date: format(d30, 'dd/MM'),
          total: snap30.total,
          delayed: snap30.delayed,
          isPersisted: snap30.isPersisted,
        },
        {
          label: 'Há 15 dias',
          date: format(d15, 'dd/MM'),
          total: snap15.total,
          delayed: snap15.delayed,
          isPersisted: snap15.isPersisted,
        },
        {
          label: 'Há 7 dias',
          date: format(d7, 'dd/MM'),
          total: snap7.total,
          delayed: snap7.delayed,
          isPersisted: snap7.isPersisted,
        },
        {
          label: 'Hoje',
          date: format(today, 'dd/MM'),
          total: snapToday.total,
          delayed: snapToday.delayed,
          isCurrent: true,
          isPersisted: true,
        },
      ],
      delayedDiff,
      delayedTrend,
      totalDiff,
      totalTrend,
    }
  }, [orders, persistedSnapshots, today, totalUnits, delayedUnits])

  // OPs filtradas para o modal de detalhamento do card clicado
  const modalOps = useMemo(() => {
    if (!selectedCard) return []
    return openOrders.filter((op) => selectedCard.filterFn(op, today))
  }, [selectedCard, openOrders, today])

  const handleOpenOpDetails = (op: PcpOrder) => {
    setSelectedOpForModal(op.op_number || op.order_number || op.id)
    setIsOpModalOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* CABEÇALHO DO BLOCO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="size-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Produtos em Produção
            </h2>
            <Badge
              variant="outline"
              className="text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200"
            >
              Métrica: Unidades
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Soma do campo quantidade das OPs não concluídas (pedidos/OPs encerrados não computam).
          </p>
        </div>
        <div className="text-[11px] text-muted-foreground">
          Total em aberto:{' '}
          <strong className="text-foreground font-mono">{formatQuantity(totalUnits)}</strong> unid.
          em <strong className="text-foreground font-mono">{openOrders.length}</strong> OPs
        </div>
      </div>

      {/* GRADE DE CARDS (8 CARDS CLICÁVEIS) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <Card
              key={c.id}
              onClick={() => setSelectedCard(c)}
              className={cn(
                'group relative overflow-hidden cursor-pointer transition-all hover:shadow-md hover:border-primary/50',
                c.id === 'delayed' && c.value > 0 && 'border-red-200 dark:border-red-900/50',
              )}
            >
              <CardContent className="p-3 flex flex-col justify-between h-full min-h-[92px]">
                <div className="flex items-start justify-between gap-1.5">
                  <div className={cn('rounded-lg p-1.5 shrink-0', c.iconColor)}>
                    <Icon className={cn('size-4', c.colorClass)} />
                  </div>
                  <ArrowUpRight className="size-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="min-w-0 mt-2">
                  <p className="text-xl font-bold font-mono leading-none tracking-tight">
                    {formatQuantity(c.value)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 truncate font-medium">
                    {c.label}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* (7) RASTRO DE PRODUÇÃO - FAIXA COMPARATIVA */}
      <Card className="overflow-hidden border-slate-200 dark:border-slate-800 bg-gradient-to-r from-slate-50/70 via-background to-slate-50/70 dark:from-slate-900/40 dark:via-background dark:to-slate-900/40">
        <CardContent className="p-3.5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Título e Tendência */}
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 shrink-0">
                <History className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Rastro de Produção
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] font-semibold gap-1 py-0 px-1.5',
                      rastroData.delayedTrend === 'down' &&
                        'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
                      rastroData.delayedTrend === 'up' &&
                        'border-red-200 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
                      rastroData.delayedTrend === 'neutral' &&
                        'border-slate-200 text-muted-foreground',
                    )}
                  >
                    {rastroData.delayedTrend === 'down' && (
                      <>
                        <TrendingDown className="size-3 text-emerald-600" />
                        <span>Atrasos caindo ({Math.abs(rastroData.delayedDiff)} unid. vs 7d)</span>
                      </>
                    )}
                    {rastroData.delayedTrend === 'up' && (
                      <>
                        <TrendingUp className="size-3 text-red-600" />
                        <span>Atrasos subindo (+{rastroData.delayedDiff} unid. vs 7d)</span>
                      </>
                    )}
                    {rastroData.delayedTrend === 'neutral' && (
                      <>
                        <Minus className="size-3" />
                        <span>Atrasos estáveis vs 7d</span>
                      </>
                    )}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Evolução do volume total e atrasos em unidades não concluídas
                </p>
              </div>
            </div>

            {/* Linha dos 4 marcos temporais */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:gap-4 shrink-0">
              {rastroData.points.map((pt, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'p-2 rounded-md border text-center transition-colors',
                    pt.isCurrent
                      ? 'border-blue-300 bg-blue-50/60 dark:bg-blue-950/40 dark:border-blue-800'
                      : 'border-slate-200 dark:border-slate-800 bg-background',
                  )}
                >
                  <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground font-medium">
                    <Calendar className="size-3" />
                    <span>{pt.label}</span>
                    <span className="font-mono text-[9px]">({pt.date})</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-center gap-2">
                    <span
                      className="text-sm font-bold font-mono text-foreground"
                      title="Total em aberto na data"
                    >
                      {formatQuantity(pt.total)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">unid.</span>
                  </div>
                  <div className="text-[10px] mt-0.5">
                    {pt.delayed > 0 ? (
                      <span className="text-red-600 dark:text-red-400 font-semibold font-mono">
                        {formatQuantity(pt.delayed)} atrasadas
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        0 atrasos
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* VISÃO DE EVOLUÇÃO (ÚLTIMOS 60 DIAS) */}
          <ProductionEvolutionTimeline
            orders={orders}
            persistedSnapshots={persistedSnapshots}
            todayUnits={{ total: totalUnits, delayed: delayedUnits }}
          />
        </CardContent>
      </Card>

      {/* MODAL DETALHADO DA SITUAÇÃO CLICADA (LISTAGEM DE OPs) */}
      <Dialog open={!!selectedCard} onOpenChange={(open) => !open && setSelectedCard(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0 shadow-2xl">
          <DialogHeader className="p-5 pb-3 border-b bg-slate-50/80 dark:bg-slate-900/80">
            <div className="flex items-center justify-between gap-3 pr-6">
              <div className="flex items-center gap-2.5">
                {selectedCard && (
                  <div className={cn('rounded-lg p-2', selectedCard.iconColor)}>
                    <selectedCard.icon className={cn('size-5', selectedCard.colorClass)} />
                  </div>
                )}
                <div>
                  <DialogTitle className="text-lg font-bold flex items-center gap-2">
                    <span>{selectedCard?.label}</span>
                    <Badge variant="outline" className="text-xs font-mono">
                      {formatQuantity(selectedCard?.value || 0)} unidades
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    {selectedCard?.subtitle} · Total de {modalOps.length} OP(s)
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* LISTAGEM DAS OPs */}
          <div className="flex-1 overflow-y-auto p-5">
            {modalOps.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nenhuma OP encontrada para esta situação.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50/60 dark:bg-slate-900/40 text-xs">
                    <TableRow>
                      <TableHead className="w-[110px]">OP</TableHead>
                      <TableHead className="w-[90px]">Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="w-[80px] text-right">Qtd (Unid)</TableHead>
                      <TableHead className="w-[110px]">Status</TableHead>
                      <TableHead className="w-[120px]">Etapa</TableHead>
                      <TableHead className="w-[100px] text-center">Entrega</TableHead>
                      <TableHead className="w-[70px] text-center">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modalOps.map((op) => {
                      const isDelayed =
                        op.delivery_date &&
                        isValid(parseISO(op.delivery_date)) &&
                        isBefore(startOfDay(parseISO(op.delivery_date)), today)

                      const prodName =
                        op.expand?.product_id?.name || op.manual_product_name || 'Produto S/N'

                      const clientName = op.expand?.client_id?.name || op.client_name || '—'

                      return (
                        <TableRow
                          key={op.id}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 cursor-pointer text-xs"
                          onClick={() => handleOpenOpDetails(op)}
                        >
                          <TableCell className="font-mono font-bold text-blue-700 dark:text-blue-400">
                            <NoTranslate>{op.op_number || 'S/N'}</NoTranslate>
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground">
                            <NoTranslate>#{op.order_number}</NoTranslate>
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate">
                            <NoTranslate title={clientName}>{clientName}</NoTranslate>
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <div className="truncate font-medium">
                              <NoTranslate title={prodName}>{prodName}</NoTranslate>
                            </div>
                            {op.op_type && (
                              <Badge
                                variant="outline"
                                className="text-[9px] py-0 px-1 mt-0.5 font-normal"
                              >
                                {op.op_type}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-foreground">
                            {formatQuantity(op.quantity)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] font-semibold',
                                op.status === 'Fila' &&
                                  'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300',
                                op.status === 'Em Andamento' &&
                                  'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
                                op.status === 'Parado' &&
                                  'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300',
                              )}
                            >
                              {op.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground truncate">
                            {op.stage || '—'}
                          </TableCell>
                          <TableCell className="text-center font-mono">
                            {op.delivery_date ? (
                              <span
                                className={cn(
                                  isDelayed && 'text-red-600 dark:text-red-400 font-bold',
                                )}
                              >
                                {format(parseISO(op.delivery_date), 'dd/MM/yyyy')}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenOpDetails(op)
                              }}
                              className="inline-flex items-center justify-center size-7 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-muted-foreground hover:text-foreground transition-colors"
                              title="Ver detalhes da OP"
                            >
                              <Eye className="size-4" />
                            </button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL DETALHES DA OP (SOMENTE LEITURA CONFORME CONVENÇÃO PCP) */}
      <OpReadOnlyModal
        open={isOpModalOpen}
        onOpenChange={setIsOpModalOpen}
        opIdentifier={selectedOpForModal}
        existingOrders={orders}
      />
    </div>
  )
}
