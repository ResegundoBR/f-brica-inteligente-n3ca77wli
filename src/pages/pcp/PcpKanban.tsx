import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertCircle, Layers, Columns, Clock, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { format, parseISO, differenceInDays, startOfDay } from 'date-fns'
import { formatDeadline } from '@/lib/pcp-utils'
import { OutsourcingPanel } from './components/OutsourcingPanel'

const MACRO_GROUPS = [
  {
    name: 'Suprimentos',
    color: 'bg-blue-100/50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300',
    borderColor: 'border-blue-200 dark:border-blue-800',
    stages: ['Separação', 'Cotação', 'Compra', 'Retirada', 'Aguardando'],
  },
  {
    name: 'Fabricação',
    color: 'bg-orange-100/50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300',
    borderColor: 'border-orange-200 dark:border-orange-800',
    stages: ['Corte', 'Dobra', 'Calandra', 'Solda', 'Acab. Solda', 'Furação', 'Rosca', 'Concreto'],
  },
  {
    name: 'Terceirização',
    color: 'bg-rose-100/50 dark:bg-rose-900/20 text-rose-800 dark:text-rose-300',
    borderColor: 'border-rose-200 dark:border-rose-800',
    stages: ['Terceirização'],
  },
  {
    name: 'Acabamento',
    color: 'bg-purple-100/50 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300',
    borderColor: 'border-purple-200 dark:border-purple-800',
    stages: ['Preparação', 'Pintura', 'Verniz', 'Retoques'],
  },
  {
    name: 'Montagem',
    color: 'bg-green-100/50 dark:bg-green-900/20 text-green-800 dark:text-green-300',
    borderColor: 'border-green-200 dark:border-green-800',
    stages: ['Montagem', 'Qualidade'],
  },
  {
    name: 'Expedição',
    color: 'bg-teal-100/50 dark:bg-teal-900/20 text-teal-800 dark:text-teal-300',
    borderColor: 'border-teal-200 dark:border-teal-800',
    stages: ['Embalagem'],
  },
]

const STATUSES = ['Fila', 'Em Andamento', 'Parado', 'Concluído']

export default function PcpKanban() {
  const [orders, setOrders] = useState<any[]>([])
  const [observations, setObservations] = useState<Record<string, any[]>>({})
  const [stuckModalOpen, setStuckModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [viewMode, setViewMode] = useState<'status' | 'process'>('process')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchOrders = async () => {
    const res = await pb.collection('pcp_orders').getFullList({
      expand: 'product_id,client_id,operator_id',
      sort: '-created',
    })
    setOrders(res)
    if (selectedOrder) {
      const updated = res.find((o) => o.id === selectedOrder.id)
      if (updated) setSelectedOrder(updated)
    }
  }

  const fetchObservations = async () => {
    const obs = await pb.collection('pcp_order_observations').getFullList({ sort: 'created' })
    const obsMap: Record<string, any[]> = {}
    obs.forEach((o) => {
      if (!obsMap[o.order_id]) obsMap[o.order_id] = []
      obsMap[o.order_id].push(o)
    })
    setObservations(obsMap)
  }

  useEffect(() => {
    fetchOrders()
    fetchObservations()
  }, [])
  useRealtime('pcp_orders', fetchOrders)
  useRealtime('pcp_order_observations', fetchObservations)

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('orderId', id)
  }

  const handleDropStage = async (e: React.DragEvent, stage: string) => {
    e.preventDefault()
    const orderId = e.dataTransfer.getData('orderId')
    if (!orderId) return
    const order = orders.find((o) => o.id === orderId)
    if (order && order.stage !== stage) {
      await pb.collection('pcp_orders').update(orderId, { stage })
      fetchOrders()
    }
  }

  const handleDropStatus = async (e: React.DragEvent, status: string) => {
    e.preventDefault()
    const orderId = e.dataTransfer.getData('orderId')
    if (!orderId) return
    const order = orders.find((o) => o.id === orderId)
    if (order && order.status !== status) {
      await pb.collection('pcp_orders').update(orderId, { status })
      fetchOrders()
    }
  }

  const filteredOrders = orders.filter((o) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    const clientName = (o.expand?.client_id?.name || o.client_name || '').toLowerCase()
    const productName = (
      o.op_type === 'Assistência' ? o.manual_product_name : o.expand?.product_id?.name || ''
    ).toLowerCase()
    const date = o.delivery_date ? format(parseISO(o.delivery_date), 'dd/MM/yyyy') : ''
    const orderNum = (o.order_number || '').toLowerCase()

    return (
      clientName.includes(q) || productName.includes(q) || date.includes(q) || orderNum.includes(q)
    )
  })

  const stuckOrders = filteredOrders.filter((o) => o.status === 'Parado')

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] p-4 md:p-6 overflow-hidden bg-slate-50/50 dark:bg-background">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 shrink-0 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Painel de Controle</h1>
          <p className="text-muted-foreground mt-1">Gerencie as OPs por processo ou status.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar OPs..."
              className="pl-8 w-[200px] md:w-[300px] h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-md">
            <Button
              variant={viewMode === 'status' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('status')}
              className="gap-2"
            >
              <Layers className="size-4" /> Por Status
            </Button>
            <Button
              variant={viewMode === 'process' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('process')}
              className="gap-2"
            >
              <Columns className="size-4" /> Por Processo
            </Button>
          </div>
          {stuckOrders.length > 0 && (
            <Button variant="destructive" className="gap-2" onClick={() => setStuckModalOpen(true)}>
              <AlertCircle className="size-4" />
              Travadas ({stuckOrders.length})
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex gap-4 items-start w-full">
        {viewMode === 'status' && (
          <div className="flex gap-4 overflow-x-auto h-full pb-4 w-full">
            {STATUSES.map((status) => {
              const statusOrders = filteredOrders.filter((o) => o.status === status)
              return (
                <div
                  key={status}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDropStatus(e, status)}
                  className={cn(
                    'w-80 shrink-0 flex flex-col max-h-full rounded-xl border bg-slate-100/50 dark:bg-slate-900/50 p-3',
                    status === 'Parado' &&
                      'border-red-200 bg-red-50/30 dark:border-red-900/50 dark:bg-red-950/10',
                  )}
                >
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2 font-semibold text-sm">
                      {status}
                      <Badge variant="outline" className="px-1.5 font-normal bg-background">
                        {statusOrders.length}
                      </Badge>
                    </div>
                  </div>

                  <ScrollArea className="flex-1 -mx-3 px-3">
                    <div className="flex flex-col gap-2 pb-4">
                      {statusOrders.map((order) => (
                        <KanbanCard
                          key={order.id}
                          order={order}
                          observations={observations[order.id] || []}
                          onDragStart={handleDragStart}
                          onClick={() => setSelectedOrder(order)}
                        />
                      ))}
                      {statusOrders.length === 0 && (
                        <div className="text-center text-sm text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                          Nenhuma OP
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )
            })}
          </div>
        )}

        {viewMode === 'process' && (
          <div className="flex w-full h-full border rounded-xl overflow-hidden bg-white dark:bg-slate-950 shadow-sm">
            {MACRO_GROUPS.map((group) => (
              <div
                key={group.name}
                className={cn('flex flex-col border-r last:border-r-0 min-h-0', group.borderColor)}
                style={{ flexGrow: group.stages.length, flexBasis: 0, minWidth: 0 }}
              >
                <div
                  className={cn(
                    'text-[10px] md:text-xs font-bold text-center p-1 truncate border-b',
                    group.color,
                    group.borderColor,
                  )}
                >
                  {group.name}
                </div>
                <div className="flex flex-1 min-h-0 divide-x divide-slate-100 dark:divide-slate-800">
                  {group.stages.map((stage) => {
                    const stageOrders = filteredOrders.filter((o) => o.stage === stage)
                    return (
                      <div
                        key={stage}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDropStage(e, stage)}
                        className="flex-1 flex flex-col min-w-0 min-h-0"
                      >
                        <div className="h-28 w-full flex flex-col items-center justify-end pb-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
                          <div
                            className="rotate-180 text-[10px] leading-tight font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap overflow-hidden"
                            style={{ writingMode: 'vertical-rl' }}
                          >
                            {stage}
                          </div>
                        </div>
                        <div className="flex-1 w-full p-0.5 md:p-1 overflow-y-auto overflow-x-hidden space-y-1 bg-white dark:bg-slate-950 min-h-0">
                          {stageOrders.map((order) => (
                            <CompactKanbanCard
                              key={order.id}
                              order={order}
                              observations={observations[order.id] || []}
                              onDragStart={handleDragStart}
                              onClick={() => setSelectedOrder(order)}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={stuckModalOpen} onOpenChange={setStuckModalOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="size-5" />
              Ordens Travadas ({stuckOrders.length})
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] -mx-4 px-4">
            <div className="flex flex-col gap-3 py-4">
              {stuckOrders.map((o) => (
                <div
                  key={o.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer gap-4"
                  onClick={() => {
                    setSelectedOrder(o)
                    setStuckModalOpen(false)
                  }}
                >
                  <div className="space-y-1.5">
                    <div className="font-semibold text-base">
                      {o.order_number}{' '}
                      <span className="text-sm font-normal text-muted-foreground">
                        - {o.expand?.client_id?.name || o.client_name}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium text-foreground">Produto:</span>{' '}
                      {o.op_type === 'Assistência'
                        ? o.manual_product_name
                        : o.op_type === 'Especial'
                          ? 'Produto Especial'
                          : o.expand?.product_id?.name || 'S/Produto'}
                      <span className="ml-4 font-medium text-foreground">Qtd:</span> {o.quantity}
                    </div>
                    <div className="text-sm font-medium text-red-600 dark:text-red-400 mt-2">
                      Motivo: {o.bottleneck_reason}
                    </div>
                    {o.bottleneck_details && (
                      <div className="text-xs text-muted-foreground italic border-l-2 border-red-200 pl-2 mt-1">
                        {o.bottleneck_details}
                      </div>
                    )}
                  </div>
                  <Badge variant="outline" className="w-fit shrink-0 bg-background">
                    {o.stage}
                  </Badge>
                </div>
              ))}
              {stuckOrders.length === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                  Nenhuma ordem travada no momento.
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedOrder} onOpenChange={(v) => !v && setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Detalhes da OP: {selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <Tabs defaultValue="detalhes" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="grid w-full grid-cols-2 shrink-0">
                <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
                <TabsTrigger value="historico">Log / Histórico</TabsTrigger>
              </TabsList>
              <TabsContent value="detalhes" className="flex-1 overflow-y-auto pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border">
                  <div>
                    <span className="text-muted-foreground block text-xs">Tipo de OP</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'mt-1 text-white border-transparent',
                        selectedOrder.op_type === 'Assistência' && 'bg-fuchsia-500',
                        selectedOrder.op_type === 'Especial' &&
                          'bg-slate-900 dark:bg-slate-100 dark:text-slate-900',
                        selectedOrder.op_type === 'Linha' && 'bg-blue-500',
                      )}
                    >
                      {selectedOrder.op_type}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Cliente</span>
                    <span className="font-medium">
                      {selectedOrder.expand?.client_id?.name || selectedOrder.client_name}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Produto</span>
                    <span className="font-medium">
                      {selectedOrder.op_type === 'Assistência'
                        ? selectedOrder.manual_product_name
                        : selectedOrder.op_type === 'Especial'
                          ? 'Produto Especial'
                          : selectedOrder.expand?.product_id?.name || 'S/Produto'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Quantidade e Prazo</span>
                    <span className="font-medium flex items-center gap-2">
                      {selectedOrder.quantity}
                      <span
                        className={cn(
                          'text-xs font-semibold px-1.5 py-0.5 rounded',
                          (() => {
                            if (selectedOrder.status === 'Concluído')
                              return 'bg-slate-100 text-slate-600'
                            const daysDiff = differenceInDays(
                              startOfDay(parseISO(selectedOrder.delivery_date)),
                              startOfDay(new Date()),
                            )
                            if (daysDiff < 0)
                              return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          })(),
                        )}
                      >
                        {formatDeadline(selectedOrder.delivery_date, selectedOrder.status)}
                      </span>
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Status Atual</span>
                    <Badge
                      variant={selectedOrder.status === 'Parado' ? 'destructive' : 'default'}
                      className="mt-1"
                    >
                      {selectedOrder.status}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Processo Atual</span>
                    <span className="font-medium">{selectedOrder.stage}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <span className="text-muted-foreground block text-xs mb-2">Observações</span>
                  <div className="space-y-3">
                    {(observations[selectedOrder.id] || []).length > 0 ? (
                      (observations[selectedOrder.id] || []).map((obs: any) => {
                        return (
                          <div
                            key={obs.id}
                            className="p-3 rounded-md text-sm border whitespace-pre-wrap bg-yellow-200 border-yellow-400 text-yellow-950 shadow-sm"
                          >
                            <span className="font-semibold block mb-1 opacity-80">
                              {obs.sector}
                            </span>
                            {obs.content}
                          </div>
                        )
                      })
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nenhuma observação cadastrada.
                      </p>
                    )}
                  </div>
                </div>

                <OutsourcingPanel op={selectedOrder} />
              </TabsContent>
              <TabsContent value="historico" className="flex-1 overflow-y-auto pt-4">
                <OrderLogsList orderId={selectedOrder.id} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KanbanCard({ order, observations = [], onDragStart, onClick }: any) {
  const [time, setTime] = useState('')
  const isStuck = order.status === 'Parado'
  const borderClass =
    order.op_type === 'Assistência'
      ? 'border-l-fuchsia-500'
      : order.op_type === 'Especial'
        ? 'border-l-slate-900 dark:border-l-slate-100'
        : 'border-l-blue-500'

  useEffect(() => {
    const update = () => {
      const diff = new Date().getTime() - new Date(order.updated).getTime()
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
      const minutes = Math.floor((diff / 1000 / 60) % 60)
      if (days > 0) setTime(`${days}d ${hours}h`)
      else if (hours > 0) setTime(`${hours}h ${minutes}m`)
      else setTime(`${minutes}m`)
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [order.updated])

  return (
    <Card
      draggable
      onDragStart={(e) => onDragStart(e, order.id)}
      onClick={onClick}
      className={cn(
        'cursor-grab active:cursor-grabbing hover:shadow-md transition-all border-l-4 group',
        isStuck ? 'border-l-red-500 bg-red-50/50 dark:bg-red-950/10' : borderClass,
      )}
    >
      <CardContent className="p-3 flex flex-col gap-1.5">
        <div className="flex items-start justify-between">
          <div className="font-semibold text-sm">{order.order_number}</div>
          {isStuck && <AlertCircle className="size-4 text-red-500 shrink-0" />}
        </div>
        <div
          className="text-xs text-muted-foreground line-clamp-1"
          title={order.expand?.client_id?.name || order.client_name}
        >
          {order.expand?.client_id?.name || order.client_name}
        </div>
        <div
          className="text-xs font-medium text-foreground line-clamp-1"
          title={
            order.op_type === 'Assistência'
              ? order.manual_product_name
              : order.op_type === 'Especial'
                ? 'Produto Especial'
                : order.expand?.product_id?.name || 'S/Produto'
          }
        >
          {order.op_type === 'Assistência'
            ? order.manual_product_name
            : order.op_type === 'Especial'
              ? 'Produto Especial'
              : order.expand?.product_id?.name || 'S/Produto'}
        </div>
        {observations.length > 0 && (
          <div className="flex flex-col gap-0.5 mt-0.5 w-full">
            {observations.map((obs: any) => (
              <span
                key={obs.id}
                className="text-[10px] text-muted-foreground whitespace-pre-wrap leading-tight border-l-2 pl-1.5 border-slate-200 dark:border-slate-800 line-clamp-2"
                title={`${obs.sector}: ${obs.content}`}
              >
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {obs.sector}:
                </span>{' '}
                {obs.content}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mt-2 pt-2 border-t gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Badge
              variant="outline"
              className="text-[10px] h-5 px-1.5 bg-background whitespace-nowrap flex gap-1 items-center"
            >
              <span>Qtd: {order.quantity}</span>
              <span className="opacity-50">|</span>
              <span
                className={cn(
                  differenceInDays(
                    startOfDay(parseISO(order.delivery_date)),
                    startOfDay(new Date()),
                  ) < 0 && order.status !== 'Concluído'
                    ? 'text-red-500 font-bold'
                    : '',
                )}
              >
                {formatDeadline(order.delivery_date, order.status)}
              </span>
            </Badge>
          </div>
          <div
            className="flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-200/50 dark:bg-slate-800 rounded px-1.5 py-0.5 shrink-0"
            title="Tempo neste estágio"
          >
            <Clock className="size-3" /> {time}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function CompactKanbanCard({ order, observations = [], onDragStart, onClick }: any) {
  const isStuck = order.status === 'Parado'
  const isAssist = order.op_type === 'Assistência'
  const isEspecial = order.op_type === 'Especial'

  const bgClass = isStuck
    ? 'bg-red-500 text-white animate-pulse'
    : isAssist
      ? 'bg-fuchsia-500 text-white'
      : isEspecial
        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
        : 'bg-blue-500 text-white'

  const prodName =
    order.op_type === 'Assistência'
      ? order.manual_product_name
      : order.op_type === 'Especial'
        ? 'Produto Especial'
        : order.expand?.product_id?.name || 'S/Produto'

  const daysDiff = differenceInDays(
    startOfDay(parseISO(order.delivery_date)),
    startOfDay(new Date()),
  )
  const isOverdue = order.status !== 'Concluído' && daysDiff < 0
  const deadlineText = formatDeadline(order.delivery_date, order.status)

  const titleText = `${order.order_number}\n${order.op_type}\n${prodName}\nQtd: ${order.quantity} | ${deadlineText}`

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, order.id)}
      onClick={onClick}
      title={titleText}
      className={cn(
        'text-[8px] md:text-[9px] font-bold p-0.5 md:p-1 rounded-sm w-full text-center flex flex-col items-center cursor-grab active:cursor-grabbing transition-all hover:opacity-80 shadow-sm border border-black/10 dark:border-white/10',
        bgClass,
      )}
    >
      <div className="flex items-center justify-between w-full gap-1">
        <span className="block truncate flex-1 text-left">{order.order_number}</span>
        {order.status !== 'Concluído' && (
          <span
            className={cn(
              'text-[6px] px-0.5 rounded-sm whitespace-nowrap shrink-0 leading-tight',
              isOverdue ? 'bg-red-600 text-white' : 'bg-white/20 text-white',
            )}
          >
            {deadlineText}
          </span>
        )}
      </div>
      <span className="block truncate w-full font-normal opacity-90 text-[7px] text-left">
        {prodName}
      </span>
      {observations.length > 0 && (
        <div className="flex flex-col items-start text-left w-full gap-0.5 mt-0.5 border-t border-black/10 dark:border-white/10 pt-0.5">
          {observations.map((obs: any) => (
            <span
              key={obs.id}
              className="block w-full truncate font-normal opacity-80 text-[7px]"
              title={`${obs.sector}: ${obs.content}`}
            >
              {obs.sector[0]}: {obs.content}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function OrderLogsList({ orderId }: { orderId: string }) {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLogs = async () => {
    try {
      const res = await pb.collection('pcp_order_logs').getFullList({
        filter: `order_id="${orderId}"`,
        sort: '-created',
        expand: 'user_id',
      })
      setLogs(res)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [orderId])

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Carregando logs...</div>
  }

  if (logs.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">Nenhum log encontrado.</div>
  }

  return (
    <div className="space-y-4 pr-4">
      {logs.map((log) => (
        <div key={log.id} className="text-sm border-b pb-3 last:border-0">
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold">{log.expand?.user_id?.name || 'Sistema'}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(log.created).toLocaleString()}
            </span>
          </div>
          <div className="text-foreground">
            {log.action}{' '}
            {log.stage && (
              <span className="font-medium text-slate-600 dark:text-slate-400">({log.stage})</span>
            )}
          </div>
          {log.details && (
            <div className="text-xs text-muted-foreground mt-1 bg-slate-50 dark:bg-slate-900 p-2 rounded">
              {log.details}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
