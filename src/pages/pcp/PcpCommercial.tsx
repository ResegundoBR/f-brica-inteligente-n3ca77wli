import { Fragment, useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { PcpOrder, PcpOrderDelivery, PcpOrderObservation } from '@/types'
import { useRealtime } from '@/hooks/use-realtime'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { format, parseISO, isAfter, startOfDay } from 'date-fns'
import { Search, Truck, CheckCircle2, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PcpFilters } from './components/PcpFilters'
import { filterByDeadline, isOrderOverdue, normalizeSearchText } from '@/lib/pcp-utils'

const STAGES = [
  'Separação',
  'Cotação',
  'Compra',
  'Retirada',
  'Aguardando',
  'Corte',
  'Dobra',
  'Calandra',
  'Solda',
  'Acab. Solda',
  'Furação',
  'Rosca',
  'Concreto',
  'Terceirização',
  'Preparação',
  'Pintura',
  'Verniz',
  'Retoques',
  'Montagem',
  'Qualidade',
  'Embalagem',
  'Suprimentos',
  'Fabricação',
  'Acabamento',
  'Expedição',
]

export default function PcpCommercial() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [observations, setObservations] = useState<Record<string, PcpOrderObservation[]>>({})
  const [deliveries, setDeliveries] = useState<Record<string, PcpOrderDelivery[]>>({})
  const [search, setSearch] = useState('')
  const [opTypeFilter, setOpTypeFilter] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [clientTypeFilter, setClientTypeFilter] = useState('all')
  const [deadlineFilter, setDeadlineFilter] = useState('all')
  const [showConcluded, setShowConcluded] = useState(false)

  const loadData = async () => {
    try {
      const [records, obs, delivs] = await Promise.all([
        pb.collection('pcp_orders').getFullList<PcpOrder>({
          sort: 'delivery_date',
          expand: 'product_id,client_id',
        }),
        pb.collection('pcp_order_observations').getFullList<PcpOrderObservation>({
          sort: 'created',
        }),
        pb.collection('pcp_order_deliveries').getFullList<PcpOrderDelivery>({
          sort: '-created',
        }),
      ])

      setOrders(records)

      const obsMap: Record<string, PcpOrderObservation[]> = {}
      obs.forEach((o) => {
        if (!obsMap[o.order_id]) obsMap[o.order_id] = []
        obsMap[o.order_id].push(o)
      })
      setObservations(obsMap)

      const delivMap: Record<string, PcpOrderDelivery[]> = {}
      delivs.forEach((d) => {
        if (!delivMap[d.order_id]) delivMap[d.order_id] = []
        delivMap[d.order_id].push(d)
      })
      setDeliveries(delivMap)
    } catch {
      /* intentionally ignored */
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useRealtime('pcp_orders', loadData)
  useRealtime('pcp_order_observations', loadData)
  useRealtime('pcp_order_deliveries', loadData)

  const filteredOrders = orders.filter((op) => {
    if (!search) return true
    const q = normalizeSearchText(search)
    if (!q) return true
    const clientName = op.expand?.client_id?.name || op.client_name || ''
    const productName =
      op.op_type === 'Assistência'
        ? op.manual_product_name || ''
        : op.expand?.product_id?.name || ''
    const orderNum = op.order_number || ''
    const opNum = op.op_number || ''
    const obsSector = op.observation_sector || ''

    const fields = [clientName, productName, orderNum, opNum, obsSector]
    return fields.some((f) => normalizeSearchText(f).includes(q))
  })

  const groupedOrders = useMemo(() => {
    const filteredByCustom = filteredOrders.filter((op) => {
      // Regra de visualização:
      // Toggle desligado: listar apenas OPs em aberto (não concluídas).
      // Toggle ligado: listar SOMENTE as OPs concluídas.
      if (!showConcluded && op.status === 'Concluído') {
        return false
      }
      if (showConcluded && op.status !== 'Concluído') {
        return false
      }

      if (opTypeFilter !== 'all' && op.op_type !== opTypeFilter) return false
      if (clientFilter !== 'all' && op.client_id !== clientFilter) return false
      if (clientTypeFilter !== 'all' && op.expand?.client_id?.type !== clientTypeFilter)
        return false
      if (!filterByDeadline(op.delivery_date, deadlineFilter, op.status)) return false
      return true
    })

    const groups: {
      normalized_key: string
      order_number: string
      client_name: string
      op_type: string
      items: PcpOrder[]
    }[] = []
    const map = new Map<string, PcpOrder[]>()
    filteredByCustom.forEach((op) => {
      const normalized = (op.order_number || '').replace(/[.\-\s]/g, '').replace(/^0+/, '') || '0'
      if (!map.has(normalized)) {
        map.set(normalized, [])
        groups.push({
          normalized_key: normalized,
          order_number: op.order_number,
          client_name: op.expand?.client_id?.name || op.client_name,
          op_type: op.op_type,
          items: map.get(normalized)!,
        })
      }
      map.get(normalized)!.push(op)
    })
    return groups
  }, [filteredOrders, showConcluded, opTypeFilter, clientFilter, clientTypeFilter, deadlineFilter])

  const getStatusInfo = (op: PcpOrder) => {
    if (op.status === 'Parado' || (op.bottleneck_reason && op.bottleneck_reason !== 'Nenhum')) {
      return {
        label: 'Travado (Gargalo)',
        variant: 'default' as const,
        className: 'bg-orange-500 hover:bg-orange-600 text-white border-transparent',
      }
    }
    if (op.status === 'Concluído') {
      return { label: 'Finalizado', variant: 'default' as const, className: 'bg-green-500' }
    }

    if (!op.delivery_date) {
      return { label: 'Sem prazo', variant: 'secondary' as const, className: 'bg-slate-500' }
    }
    const date = parseISO(op.delivery_date)
    if (isNaN(date.getTime())) {
      return { label: 'Sem prazo', variant: 'secondary' as const, className: 'bg-slate-500' }
    }

    const delivery = startOfDay(date)
    const today = startOfDay(new Date())

    if (isAfter(today, delivery)) {
      return { label: 'Atrasado', variant: 'destructive' as const, className: 'bg-purple-500' }
    }

    return { label: 'No Prazo', variant: 'secondary' as const, className: 'bg-blue-500' }
  }

  const getProgress = (op: PcpOrder) => {
    if (op.status === 'Concluído') return 100
    const idx = STAGES.indexOf(op.stage as any)
    if (idx === -1) return 0
    return (idx / STAGES.length) * 100
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Visão Comercial</h1>
        <p className="text-muted-foreground">
          Acompanhe o status e previsão das ordens de produção de seus clientes.
        </p>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente ou OP..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <PcpFilters
          opType={opTypeFilter}
          setOpType={setOpTypeFilter}
          client={clientFilter}
          setClient={setClientFilter}
          clientType={clientTypeFilter}
          setClientType={setClientTypeFilter}
          deadline={deadlineFilter}
          setDeadline={setDeadlineFilter}
        />
        <Button
          variant={showConcluded ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowConcluded(!showConcluded)}
          className={cn(
            'gap-2 transition-colors',
            showConcluded && 'bg-green-600 hover:bg-green-700 text-white border-green-700',
          )}
        >
          <CheckCircle2 className="size-4" />
          Mostrar Concluídas
        </Button>
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OP</TableHead>
              <TableHead>Produto / Expedição</TableHead>
              <TableHead>Previsão</TableHead>
              <TableHead className="w-[200px]">Progresso</TableHead>
              <TableHead>Etapa Atual</TableHead>
              <TableHead>Status</TableHead>
              {showConcluded && <TableHead>Dados de Embarque (Expedição)</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showConcluded ? 7 : 6} className="text-center h-24">
                  Nenhuma OP encontrada.
                </TableCell>
              </TableRow>
            ) : (
              groupedOrders.map((group) => (
                <Fragment key={group.normalized_key}>
                  <TableRow
                    className={cn(
                      'hover:opacity-90 border-y transition-colors',
                      'bg-blue-100/80 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100',
                    )}
                  >
                    <TableCell
                      colSpan={showConcluded ? 7 : 6}
                      className="font-semibold text-sm py-1"
                    >
                      <div className="flex items-center gap-4">
                        <span>Pedido: {group.order_number}</span>
                        <span className="opacity-50">|</span>
                        <span>Cliente: {group.client_name}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                  {group.items.map((op) => {
                    const statusInfo = getStatusInfo(op)
                    const isConcluded = op.status === 'Concluído'
                    const opDeliveriesList = deliveries[op.id] || []

                    return (
                      <TableRow
                        key={op.id}
                        onClick={() => navigate(`/pcp/comunicacoes?orderId=${op.id}`)}
                        className={cn(
                          'cursor-pointer transition-colors group hover:bg-sky-50/70 dark:hover:bg-sky-950/30',
                          isConcluded && 'bg-slate-50/60 dark:bg-slate-900/40',
                        )}
                        title="Clique para questionar o Gestor do PCP na Central de Comunicações"
                      >
                        <TableCell className="py-1.5 pl-6 font-semibold">
                          <div className="flex items-center gap-2">
                            <span className="group-hover:text-sky-600 dark:group-hover:text-sky-400 group-hover:underline transition-colors">
                              {op.op_number || '-'}
                            </span>
                            {isConcluded && (
                              <span title="OP Concluída" className="inline-flex items-center">
                                <CheckCircle2 className="size-3.5 text-green-600 dark:text-green-400 shrink-0" />
                              </span>
                            )}
                            <span
                              title="Questionar Gestor do PCP"
                              className="inline-flex items-center"
                            >
                              <MessageSquare className="size-3.5 text-muted-foreground/40 group-hover:text-sky-600 dark:group-hover:text-sky-400 shrink-0 transition-colors" />
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex flex-col items-start gap-1">
                            <span className="text-sm font-medium">
                              {op.op_type === 'Assistência'
                                ? op.manual_product_name
                                : op.op_type === 'Especial'
                                  ? 'Produto Especial'
                                  : op.expand?.product_id?.name || '-'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Qtd: {op.quantity}
                              {(op.delivered_quantity || 0) > 0 && (
                                <span className="ml-1.5 text-blue-600 dark:text-blue-400 font-medium">
                                  (Expedido: {op.delivered_quantity}/{op.quantity})
                                </span>
                              )}
                            </span>
                            {(observations[op.id] || []).length > 0 && (
                              <div className="flex flex-col gap-1 mt-1 w-full max-w-sm">
                                {(observations[op.id] || []).map((obs) => (
                                  <span
                                    key={obs.id}
                                    className="text-[10px] text-muted-foreground whitespace-pre-wrap leading-tight border-l-2 pl-2 border-slate-200 dark:border-slate-800"
                                  >
                                    <span className="font-medium text-slate-700 dark:text-slate-300">
                                      {obs.sector}:
                                    </span>{' '}
                                    {obs.content}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell
                          className={cn(
                            'py-1.5',
                            isOrderOverdue(op.delivery_date, op.status) && 'text-red-600 font-bold',
                          )}
                        >
                          {op.delivery_date && !isNaN(parseISO(op.delivery_date).getTime())
                            ? format(parseISO(op.delivery_date), 'dd/MM/yyyy')
                            : '-'}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex flex-col gap-2">
                            <Progress value={getProgress(op)} className="h-2" />
                            <span className="text-xs text-muted-foreground text-right">
                              {Math.round(getProgress(op))}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5 font-medium">
                          {op.status === 'Concluído' ? (
                            <span className="text-xs text-green-600 dark:text-green-400 font-semibold">
                              Expedição finalizada
                            </span>
                          ) : (
                            <span className="text-sm">{op.stage}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Badge variant={statusInfo.variant} className={statusInfo.className}>
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        {showConcluded && (
                          <TableCell className="py-1.5">
                            {isConcluded ? (
                              <div className="min-w-[220px] max-w-md space-y-1.5">
                                {opDeliveriesList.length > 0 ? (
                                  opDeliveriesList.map((deliv, idx) => {
                                    const departureDate = deliv.data_saida
                                      ? format(new Date(deliv.data_saida), 'dd/MM/yyyy')
                                      : deliv.created
                                        ? format(new Date(deliv.created), 'dd/MM/yyyy')
                                        : '-'
                                    return (
                                      <div
                                        key={deliv.id || idx}
                                        className="text-xs p-2 rounded-md bg-muted/60 border border-border/60 space-y-0.5"
                                      >
                                        <div className="flex items-center justify-between gap-2 font-medium">
                                          <span className="flex items-center gap-1 text-foreground">
                                            <Truck className="size-3 text-teal-600 shrink-0" />
                                            {deliv.transportadora ||
                                              op.transportadora ||
                                              'Sem transportadora'}
                                          </span>
                                          <span className="text-[11px] text-muted-foreground font-semibold">
                                            {departureDate}
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                                          <span>
                                            <strong className="text-foreground">NF: </strong>
                                            {deliv.nf || op.nf || '-'}
                                          </span>
                                          <span className="text-foreground/80 font-medium">
                                            {deliv.quantity} un
                                          </span>
                                        </div>
                                      </div>
                                    )
                                  })
                                ) : op.data_saida || op.transportadora || op.nf ? (
                                  <div className="text-xs p-2 rounded-md bg-muted/60 border border-border/60 space-y-0.5">
                                    <div className="flex items-center justify-between gap-2 font-medium">
                                      <span className="flex items-center gap-1 text-foreground">
                                        <Truck className="size-3 text-teal-600 shrink-0" />
                                        {op.transportadora || 'Sem transportadora'}
                                      </span>
                                      <span className="text-[11px] text-muted-foreground font-semibold">
                                        {op.data_saida
                                          ? format(new Date(op.data_saida), 'dd/MM/yyyy')
                                          : op.finished_at
                                            ? format(new Date(op.finished_at), 'dd/MM/yyyy')
                                            : '-'}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground pt-0.5">
                                      <strong className="text-foreground">NF: </strong>
                                      {op.nf || '-'}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">
                                    Sem dados de expedição gravados
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
