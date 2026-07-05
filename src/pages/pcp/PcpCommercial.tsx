import { Fragment, useEffect, useState, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { PcpOrder, PcpOrderObservation } from '@/types'
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
import { Search, MessageCircle, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PcpFilters } from './components/PcpFilters'
import { filterByDeadline, isOrderOverdue } from '@/lib/pcp-utils'
import { OrderMessagesPanel } from '@/components/OrderMessagesPanel'
import { useOrderMessages } from '@/hooks/use-order-messages'

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
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [observations, setObservations] = useState<Record<string, PcpOrderObservation[]>>({})
  const [search, setSearch] = useState('')
  const [opTypeFilter, setOpTypeFilter] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [clientTypeFilter, setClientTypeFilter] = useState('all')
  const [deadlineFilter, setDeadlineFilter] = useState('all')
  const [pendingOnly, setPendingOnly] = useState(false)
  const [messageOrder, setMessageOrder] = useState<{
    id: string
    orderNumber: string
    opNumber: string
  } | null>(null)
  const { getOrderMessageInfo, markOrderAsRead } = useOrderMessages()

  const loadData = async () => {
    try {
      const [records, obs] = await Promise.all([
        pb.collection('pcp_orders').getFullList<PcpOrder>({
          sort: 'delivery_date',
          expand: 'product_id,client_id',
        }),
        pb.collection('pcp_order_observations').getFullList<PcpOrderObservation>({
          sort: 'created',
        }),
      ])

      setOrders(records)

      const obsMap: Record<string, PcpOrderObservation[]> = {}
      obs.forEach((o) => {
        if (!obsMap[o.order_id]) obsMap[o.order_id] = []
        obsMap[o.order_id].push(o)
      })
      setObservations(obsMap)
    } catch {
      /* intentionally ignored */
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useRealtime('pcp_orders', loadData)
  useRealtime('pcp_order_observations', loadData)

  const filteredOrders = orders.filter((op) => {
    if (!search) return true
    const q = search.toLowerCase()
    const clientName = (op.expand?.client_id?.name || op.client_name || '').toLowerCase()
    const productName = (
      op.op_type === 'Assistência'
        ? op.manual_product_name || ''
        : op.expand?.product_id?.name || ''
    ).toLowerCase()
    const orderNum = (op.order_number || '').toLowerCase()
    const opNum = (op.op_number || '').toLowerCase()
    const obsSector = (op.observation_sector || '').toLowerCase()

    return (
      clientName.includes(q) ||
      productName.includes(q) ||
      orderNum.includes(q) ||
      opNum.includes(q) ||
      obsSector.includes(q)
    )
  })

  const groupedOrders = useMemo(() => {
    const filteredByCustom = filteredOrders.filter((op) => {
      if (opTypeFilter !== 'all' && op.op_type !== opTypeFilter) return false
      if (clientFilter !== 'all' && op.client_id !== clientFilter) return false
      if (clientTypeFilter !== 'all' && op.expand?.client_id?.type !== clientTypeFilter)
        return false
      if (!filterByDeadline(op.delivery_date, deadlineFilter)) return false
      if (pendingOnly) {
        const msgState = getOrderMessageInfo(op.id).indicatorState
        if (msgState !== 'blue' && msgState !== 'green') return false
      }
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
  }, [
    filteredOrders,
    opTypeFilter,
    clientFilter,
    clientTypeFilter,
    deadlineFilter,
    pendingOnly,
    getOrderMessageInfo,
  ])

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
          setClientType={setClientType}
          deadline={deadlineFilter}
          setDeadline={setDeadlineFilter}
        />
        <Button
          variant={pendingOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPendingOnly(!pendingOnly)}
          className="gap-2"
        >
          <Bell className="size-4" />
          Mensagens Pendentes
        </Button>
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OP</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Previsão</TableHead>
              <TableHead className="w-[200px]">Progresso</TableHead>
              <TableHead>Etapa Atual</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[60px]">Mensagens</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-24">
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
                    <TableCell colSpan={7} className="font-semibold text-sm py-1">
                      <div className="flex items-center gap-4">
                        <span>Pedido: {group.order_number}</span>
                        <span className="opacity-50">|</span>
                        <span>Cliente: {group.client_name}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                  {group.items.map((op) => {
                    const statusInfo = getStatusInfo(op)
                    return (
                      <TableRow key={op.id}>
                        <TableCell className="py-1 pl-6 font-semibold">
                          {op.op_number || '-'}
                        </TableCell>
                        <TableCell className="py-1">
                          <div className="flex flex-col items-start gap-1">
                            <span className="text-sm">
                              {op.op_type === 'Assistência'
                                ? op.manual_product_name
                                : op.op_type === 'Especial'
                                  ? 'Produto Especial'
                                  : op.expand?.product_id?.name || '-'}
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
                            'py-1',
                            isOrderOverdue(op.delivery_date, op.status) && 'text-red-600 font-bold',
                          )}
                        >
                          {op.delivery_date && !isNaN(parseISO(op.delivery_date).getTime())
                            ? format(parseISO(op.delivery_date), 'dd/MM/yyyy')
                            : '-'}
                        </TableCell>
                        <TableCell className="py-1">
                          <div className="flex flex-col gap-2">
                            <Progress value={getProgress(op)} className="h-2" />
                            <span className="text-xs text-muted-foreground text-right">
                              {Math.round(getProgress(op))}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-1 font-medium">
                          {op.status === 'Concluído' ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            <span className="text-sm">{op.stage}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1">
                          <Badge variant={statusInfo.variant} className={statusInfo.className}>
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 relative"
                            onClick={() =>
                              setMessageOrder({
                                id: op.id,
                                orderNumber: op.order_number,
                                opNumber: op.op_number || '',
                              })
                            }
                          >
                            {(() => {
                              const info = getOrderMessageInfo(op.id)
                              const state = info.indicatorState
                              const iconColor =
                                state === 'green'
                                  ? 'text-green-500 animate-pulse'
                                  : state === 'blue'
                                    ? 'text-blue-500'
                                    : 'text-gray-400 dark:text-gray-500'
                              return (
                                <>
                                  <MessageCircle className={cn('size-4', iconColor)} />
                                  {info.count > 0 ? (
                                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-blue-500 text-white text-[9px] font-bold">
                                      {info.count > 99 ? '99+' : info.count}
                                    </span>
                                  ) : null}
                                </>
                              )
                            })()}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <OrderMessagesPanel
        orderId={messageOrder?.id || null}
        orderNumber={messageOrder?.orderNumber || ''}
        opNumber={messageOrder?.opNumber || ''}
        open={!!messageOrder}
        onOpenChange={(open) => !open && setMessageOrder(null)}
        onMessagesRead={markOrderAsRead}
      />
    </div>
  )
}
