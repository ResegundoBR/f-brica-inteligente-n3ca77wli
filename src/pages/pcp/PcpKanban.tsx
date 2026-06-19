import { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LayoutGrid, ListTree, AlertCircle, Minimize2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { format } from 'date-fns'

const STATUSES = ['Fila', 'Em Andamento', 'Parado', 'Concluído']
const PROCESS_STAGES = [
  'Separação no estoque fisico',
  'Corte',
  'Acabamento corte',
  'Dobra',
  'Calandra',
  'Solda',
  'Acabamento de solda',
  'Furação',
  'Rosca',
  'Bases de concreto',
  'Preparação (wash primer, primer e lixamento)',
  'Pintura',
  'Verniz',
  'Retoques',
  'Montagem',
  'Controle de qualidade',
  'Embalagem',
]

export default function PcpKanban() {
  const [orders, setOrders] = useState<any[]>([])
  const [viewMode, setViewMode] = useState<'status' | 'process'>('process')
  const [collapsedCols, setCollapsedCols] = useState<string[]>(PROCESS_STAGES)

  const [isStuckModalOpen, setIsStuckModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)

  const loadOrders = async () => {
    try {
      const res = await pb
        .collection('pcp_orders')
        .getFullList({ expand: 'client_id,product_id,operator_id', sort: '-created' })
      setOrders(res)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadOrders()
  }, [])
  useRealtime('pcp_orders', () => loadOrders())

  const lockedOrders = orders.filter((o) => o.bottleneck_reason && o.bottleneck_reason !== 'Nenhum')
  const lockedCount = lockedOrders.length

  const columns = viewMode === 'status' ? STATUSES : PROCESS_STAGES

  const handleDragStart = (e: React.DragEvent, orderId: string) => {
    e.dataTransfer.setData('orderId', orderId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (e: React.DragEvent, targetCol: string) => {
    e.preventDefault()
    const orderId = e.dataTransfer.getData('orderId')
    if (!orderId) return
    const order = orders.find((o) => o.id === orderId)
    if (!order) return

    try {
      if (viewMode === 'status' && order.status !== targetCol) {
        await pb.collection('pcp_orders').update(orderId, { status: targetCol })
      } else if (viewMode === 'process' && order.stage !== targetCol) {
        await pb.collection('pcp_orders').update(orderId, { stage: targetCol })
      }
    } catch (err) {
      console.error(err)
    }
  }

  const toggleCollapse = (col: string) => {
    setCollapsedCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    )
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Painel de Controle</h1>
          <p className="text-muted-foreground">Acompanhamento de Ordens de Produção</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <Button
              variant={viewMode === 'status' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('status')}
              className={cn('h-8', viewMode === 'status' && 'shadow-sm')}
            >
              <LayoutGrid className="mr-2 size-4" />
              Por Status
            </Button>
            <Button
              variant={viewMode === 'process' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setViewMode('process')
                setCollapsedCols(PROCESS_STAGES)
              }}
              className={cn('h-8', viewMode === 'process' && 'shadow-sm')}
            >
              <ListTree className="mr-2 size-4" />
              Por Processo
            </Button>
          </div>

          <Card
            onClick={() => lockedCount > 0 && setIsStuckModalOpen(true)}
            className={cn(
              'border-0 shadow-none transition-all',
              lockedCount > 0
                ? 'bg-red-500 text-white cursor-pointer hover:bg-red-600'
                : 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white',
            )}
          >
            <CardContent className="flex items-center gap-3 p-3">
              <div className="text-sm font-medium">Travadas</div>
              <div className="text-xl font-bold leading-none">{lockedCount}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="-mx-6 min-h-0 flex-1 overflow-x-auto px-6">
        <div
          className={cn(
            'flex h-full gap-4 pb-4',
            viewMode === 'status' ? 'min-w-full' : 'w-max min-w-full',
          )}
        >
          {columns.map((col) => {
            const isCollapsed = viewMode === 'process' && collapsedCols.includes(col)
            const colOrders = orders.filter((o) =>
              viewMode === 'status' ? o.status === col : o.stage === col,
            )
            const hasBottleneck = colOrders.some(
              (o) => o.bottleneck_reason && o.bottleneck_reason !== 'Nenhum',
            )

            if (isCollapsed) {
              return (
                <div
                  key={col}
                  className="flex w-14 shrink-0 cursor-pointer flex-col items-center rounded-xl border bg-slate-100/50 py-4 transition-colors hover:bg-slate-200/50 dark:bg-slate-800/50 dark:hover:bg-slate-700/50"
                  onClick={() => toggleCollapse(col)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, col)}
                >
                  <div
                    className={cn(
                      'mb-4 flex size-8 items-center justify-center rounded-full text-xs font-bold transition-colors',
                      hasBottleneck
                        ? 'bg-red-500 text-white ring-2 ring-red-500/20 shadow-md'
                        : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
                    )}
                  >
                    {colOrders.length}
                  </div>
                  <div
                    style={{ writingMode: 'vertical-rl' }}
                    className="rotate-180 text-sm font-semibold tracking-wider text-muted-foreground whitespace-nowrap"
                  >
                    {col}
                  </div>
                </div>
              )
            }

            return (
              <div
                key={col}
                className={cn(
                  'flex shrink-0 flex-col gap-3 rounded-xl bg-slate-100/50 p-3 dark:bg-slate-800/50 h-full',
                  viewMode === 'status' ? 'w-80 flex-1' : 'w-72',
                )}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col)}
              >
                <div className="flex items-center justify-between pb-1 shrink-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{col}</h3>
                    <Badge
                      variant={hasBottleneck ? 'destructive' : 'secondary'}
                      className="h-5 px-1.5 text-[10px]"
                    >
                      {colOrders.length}
                    </Badge>
                  </div>
                  {viewMode === 'process' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-foreground"
                      onClick={() => toggleCollapse(col)}
                    >
                      <Minimize2 className="size-4" />
                    </Button>
                  )}
                </div>

                <ScrollArea className="flex-1 -mx-1 px-1">
                  <div className="flex flex-col gap-2 pb-4">
                    {colOrders.map((order) => (
                      <KanbanCard
                        key={order.id}
                        order={order}
                        onDragStart={handleDragStart}
                        onClick={() => setSelectedOrder(order)}
                      />
                    ))}
                    {colOrders.length === 0 && (
                      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground bg-slate-50/50 dark:bg-slate-900/50">
                        Nenhuma ordem
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )
          })}
        </div>
      </div>

      <StuckOrdersModal
        open={isStuckModalOpen}
        onOpenChange={setIsStuckModalOpen}
        lockedOrders={lockedOrders}
        onClickOrder={(o: any) => {
          setIsStuckModalOpen(false)
          setSelectedOrder(o)
        }}
      />
      {selectedOrder && (
        <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
    </div>
  )
}

function KanbanCard({
  order,
  onDragStart,
  onClick,
}: {
  order: any
  onDragStart: (e: any, id: string) => void
  onClick: () => void
}) {
  const isStuck = order.bottleneck_reason && order.bottleneck_reason !== 'Nenhum'
  return (
    <Card
      draggable
      onDragStart={(e) => onDragStart(e, order.id)}
      onClick={onClick}
      className={cn(
        'cursor-grab active:cursor-grabbing hover:shadow-md transition-all border-l-4',
        isStuck
          ? 'border-l-red-500 bg-red-50/50 dark:bg-red-950/10'
          : 'border-l-slate-300 dark:border-l-slate-700',
      )}
    >
      <CardContent className="p-3 flex flex-col gap-2">
        <div className="flex items-start justify-between">
          <div className="font-semibold text-sm">{order.order_number}</div>
          {isStuck && <AlertCircle className="size-4 text-red-500 shrink-0" />}
        </div>
        <div className="text-xs text-muted-foreground line-clamp-1">
          {order.expand?.client_id?.name || order.client_name}
        </div>
        <div className="flex items-center justify-between mt-1">
          <Badge variant="outline" className="text-[10px] h-4 px-1">
            {order.expand?.product_id?.code || 'S/Produto'}
          </Badge>
          <div className="text-[10px] text-muted-foreground">{order.stage}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function StuckOrdersModal({ open, onOpenChange, lockedOrders, onClickOrder }: any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="size-5" />
            Ordens Travadas ({lockedOrders.length})
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] -mx-4 px-4">
          <div className="flex flex-col gap-3 py-4">
            {lockedOrders.map((o: any) => (
              <div
                key={o.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer gap-3"
                onClick={() => onClickOrder(o)}
              >
                <div>
                  <div className="font-semibold">
                    {o.order_number}{' '}
                    <span className="text-sm font-normal text-muted-foreground">
                      - {o.expand?.client_id?.name || o.client_name}
                    </span>
                  </div>
                  <div className="text-sm text-red-500 font-medium mt-1">
                    Motivo: {o.bottleneck_reason}
                  </div>
                </div>
                <Badge variant="outline" className="w-fit">
                  {o.stage}
                </Badge>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function OrderDetailModal({ order, onClose }: { order: any; onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([])

  const loadLogs = async () => {
    try {
      const res = await pb
        .collection('pcp_order_logs')
        .getFullList({ filter: `order_id="${order.id}"`, sort: '-created', expand: 'user_id' })
      setLogs(res)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [order.id])
  useRealtime('pcp_order_logs', () => loadLogs())

  const handleBottleneckChange = async (val: string) => {
    try {
      await pb.collection('pcp_orders').update(order.id, { bottleneck_reason: val })
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <Sheet open={true} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        <SheetHeader className="p-6 pb-2 shrink-0">
          <SheetTitle className="text-xl">OP {order.order_number}</SheetTitle>
          <div className="text-sm text-muted-foreground">
            {order.expand?.client_id?.name || order.client_name}
          </div>
        </SheetHeader>

        <Tabs defaultValue="detalhes" className="flex-1 flex flex-col min-h-0">
          <div className="px-6 border-b shrink-0">
            <TabsList className="w-full justify-start h-auto p-0 bg-transparent rounded-none">
              <TabsTrigger
                value="detalhes"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none py-3"
              >
                Detalhes
              </TabsTrigger>
              <TabsTrigger
                value="historico"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none py-3"
              >
                Histórico
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-6">
              <TabsContent value="detalhes" className="m-0 flex flex-col gap-6 outline-none">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Status</div>
                    <Badge variant={order.status === 'Parado' ? 'destructive' : 'default'}>
                      {order.status}
                    </Badge>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Etapa Atual</div>
                    <div className="font-medium">{order.stage}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm text-muted-foreground mb-1">Produto</div>
                    <div className="font-medium">{order.expand?.product_id?.name || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Quantidade</div>
                    <div className="font-medium">{order.quantity}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Motivo de Parada (Gargalo)</div>
                  <Select
                    value={order.bottleneck_reason || 'Nenhum'}
                    onValueChange={handleBottleneckChange}
                  >
                    <SelectTrigger
                      className={cn(
                        order.bottleneck_reason &&
                          order.bottleneck_reason !== 'Nenhum' &&
                          'border-red-500 text-red-600 focus:ring-red-500',
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Nenhum">Nenhum</SelectItem>
                      <SelectItem value="Falta de Material">Falta de Material</SelectItem>
                      <SelectItem value="Dúvida Técnica">Dúvida Técnica</SelectItem>
                      <SelectItem value="Sobrecarga">Sobrecarga</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="historico" className="m-0 space-y-6 outline-none">
                {logs.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    Nenhum histórico registrado.
                  </div>
                ) : (
                  <div className="relative pl-4 border-l border-slate-200 dark:border-slate-800 space-y-6">
                    {logs.map((log) => (
                      <div key={log.id} className="relative">
                        <div
                          className={cn(
                            'absolute -left-[21px] size-2.5 rounded-full border-2 border-background',
                            log.action === 'Parada'
                              ? 'bg-red-500'
                              : log.action === 'Retomada'
                                ? 'bg-green-500'
                                : 'bg-primary',
                          )}
                        />
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">{log.action}</span>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {format(new Date(log.created), 'dd/MM HH:mm')}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground">{log.details}</div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                            <span className="font-medium text-foreground">
                              {log.expand?.user_id?.name || 'Sistema'}
                            </span>{' '}
                            • {log.stage}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
