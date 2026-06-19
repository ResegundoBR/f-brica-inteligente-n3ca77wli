import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertCircle,
  Maximize2,
  Minimize2,
  ChevronRight,
  Clock,
  Layers,
  Columns,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const MACRO_GROUPS = [
  {
    name: 'Suprimentos',
    stages: [
      'Separação no estoque fisico',
      'Levantamento de faltas (Comprado fora)',
      'Levantamento de faltas (Fabricado internamente)',
      'Cotação',
      'Compra',
      'Retirada',
      'Aguardar chegar',
      'Entrega',
    ],
  },
  {
    name: 'Fabricação',
    stages: [
      'Corte',
      'Acabamento corte',
      'Dobra',
      'Calandra',
      'Solda',
      'Acabamento de solda',
      'Furação',
      'Rosca',
      'Bases de concreto',
    ],
  },
  {
    name: 'Acabamento',
    stages: ['Preparação (wash primer, primer e lixamento)', 'Pintura', 'Verniz', 'Retoques'],
  },
  {
    name: 'Montagem',
    stages: ['Montagem', 'Testes (Montagem)', 'Controle de qualidade'],
  },
  {
    name: 'Expedição',
    stages: ['Testes (Expedição)', 'Fotos', 'Embalagem'],
  },
]

const STAGES = MACRO_GROUPS.flatMap((g) => g.stages)
const STATUSES = ['Fila', 'Em Andamento', 'Parado', 'Concluído']

export default function PcpKanban() {
  const [orders, setOrders] = useState<any[]>([])
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set())
  const [stuckModalOpen, setStuckModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [viewMode, setViewMode] = useState<'status' | 'process'>('process')

  const fetchOrders = async () => {
    const res = await pb.collection('pcp_orders').getFullList({
      expand: 'product_id,client_id,operator_id',
      sort: '-created',
    })
    setOrders(res)
  }

  useEffect(() => {
    fetchOrders()
  }, [])
  useRealtime('pcp_orders', fetchOrders)

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

  const toggleStage = (stage: string) => {
    const next = new Set(collapsedStages)
    if (next.has(stage)) next.delete(stage)
    else next.add(stage)
    setCollapsedStages(next)
  }

  const stuckOrders = orders.filter((o) => o.status === 'Parado')

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] p-4 md:p-6 overflow-hidden bg-slate-50/50 dark:bg-background">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 shrink-0 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Painel de Controle</h1>
          <p className="text-muted-foreground mt-1">Gerencie as OPs por processo ou status.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-md">
            <Button
              variant={viewMode === 'status' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('status')}
              className="gap-2"
            >
              <Layers className="size-4" />
              Por Status
            </Button>
            <Button
              variant={viewMode === 'process' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('process')}
              className="gap-2"
            >
              <Columns className="size-4" />
              Por Processo
            </Button>
          </div>
          {stuckOrders.length > 0 && (
            <Button variant="destructive" className="gap-2" onClick={() => setStuckModalOpen(true)}>
              <AlertCircle className="size-4" />
              Travadas ({stuckOrders.length})
            </Button>
          )}
          {viewMode === 'process' && (
            <>
              <Button variant="outline" size="sm" onClick={() => setCollapsedStages(new Set())}>
                <Maximize2 className="mr-2 size-4" /> Expandir tudo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCollapsedStages(new Set(STAGES))}
              >
                <Minimize2 className="mr-2 size-4" /> Recolher tudo
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto pb-4 items-start">
        {viewMode === 'status' &&
          STATUSES.map((status) => {
            const statusOrders = orders.filter((o) => o.status === status)
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

        {viewMode === 'process' &&
          MACRO_GROUPS.map((group) => (
            <div key={group.name} className="flex flex-col shrink-0">
              <div className="font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                {group.name}
              </div>
              <div className="flex gap-4 flex-1 items-start">
                {group.stages.map((stage) => {
                  const stageOrders = orders.filter((o) => o.stage === stage)
                  const isCollapsed = collapsedStages.has(stage)
                  const hasStuck = stageOrders.some((o) => o.status === 'Parado')

                  if (isCollapsed) {
                    return (
                      <div
                        key={stage}
                        onClick={() => toggleStage(stage)}
                        className={cn(
                          'w-12 shrink-0 h-full max-h-full rounded-xl border flex flex-col items-center py-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors',
                          hasStuck
                            ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900'
                            : 'bg-white dark:bg-slate-900',
                        )}
                      >
                        <div className="flex flex-col items-center gap-2 mb-4">
                          <Badge variant="secondary" className="px-1.5">
                            {stageOrders.length}
                          </Badge>
                          {hasStuck && <AlertCircle className="size-4 text-red-500" />}
                        </div>
                        <div className="rotate-180 mt-2" style={{ writingMode: 'vertical-rl' }}>
                          <span className="text-sm font-semibold tracking-wider whitespace-nowrap text-slate-700 dark:text-slate-300">
                            {stage}
                          </span>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={stage}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDropStage(e, stage)}
                      className={cn(
                        'w-80 shrink-0 flex flex-col max-h-full rounded-xl border bg-slate-100/50 dark:bg-slate-900/50 p-3 mr-2',
                        hasStuck &&
                          'border-red-200 bg-red-50/30 dark:border-red-900/50 dark:bg-red-950/10',
                      )}
                    >
                      <div className="flex items-center justify-between mb-3 px-1">
                        <div className="flex items-center gap-2 font-semibold text-sm">
                          {stage}
                          <Badge variant="outline" className="px-1.5 font-normal bg-background">
                            {stageOrders.length}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => toggleStage(stage)}
                        >
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </Button>
                      </div>

                      <ScrollArea className="flex-1 -mx-3 px-3">
                        <div className="flex flex-col gap-2 pb-4">
                          {stageOrders.map((order) => (
                            <KanbanCard
                              key={order.id}
                              order={order}
                              onDragStart={handleDragStart}
                              onClick={() => setSelectedOrder(order)}
                            />
                          ))}
                          {stageOrders.length === 0 && (
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
            </div>
          ))}
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
                      {o.expand?.product_id?.name || 'S/Produto'}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes da OP: {selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block text-xs">Cliente</span>
                  <span className="font-medium">
                    {selectedOrder.expand?.client_id?.name || selectedOrder.client_name}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Produto</span>
                  <span className="font-medium">
                    {selectedOrder.expand?.product_id?.name || 'S/Produto'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Quantidade</span>
                  <span className="font-medium">{selectedOrder.quantity}</span>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KanbanCard({
  order,
  onDragStart,
  onClick,
}: {
  order: any
  onDragStart: any
  onClick: any
}) {
  const [time, setTime] = useState('')
  const isStuck = order.status === 'Parado'

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
        isStuck
          ? 'border-l-red-500 bg-red-50/50 dark:bg-red-950/10'
          : 'border-l-slate-300 dark:border-l-slate-700',
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
          title={order.expand?.product_id?.name || 'S/Produto'}
        >
          {order.expand?.product_id?.name || 'S/Produto'}
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t">
          <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-background">
            Qtd: {order.quantity}
          </Badge>
          <div
            className="flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-200/50 dark:bg-slate-800 rounded px-1.5 py-0.5"
            title="Tempo neste estágio"
          >
            <Clock className="size-3" /> {time}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
