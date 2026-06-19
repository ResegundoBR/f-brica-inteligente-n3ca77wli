import { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { PcpOrder } from '@/types'
import { useRealtime } from '@/hooks/use-realtime'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { differenceInDays, parseISO } from 'date-fns'
import { AlertTriangle, Clock, Paperclip, ChevronLeft, LayoutGrid, ListTree } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_COLUMNS = ['Fila', 'Em Andamento', 'Parado', 'Concluído'] as const
const PROCESS_COLUMNS = [
  'Corte',
  'Dobra',
  'Calandra',
  'Solda',
  'Montagem',
  'Acabamento',
  'Expedição',
] as const

const KanbanCard = ({
  op,
  viewMode,
  onDragStart,
}: {
  op: PcpOrder
  viewMode: 'status' | 'process'
  onDragStart: (e: React.DragEvent, id: string) => void
}) => {
  const daysToDelivery = differenceInDays(parseISO(op.delivery_date), new Date())
  const isSlaAlert = daysToDelivery <= 2 && op.status !== 'Concluído'
  const isLocked = op.bottleneck_reason !== 'Nenhum'

  return (
    <Card
      draggable
      onDragStart={(e) => onDragStart(e, op.id)}
      className={cn(
        'cursor-grab active:cursor-grabbing border-l-4 shadow-sm transition-shadow hover:shadow-md',
        op.is_special ? 'border-l-indigo-500' : 'border-l-transparent',
        isLocked && 'animate-pulse border-l-red-500',
      )}
    >
      <CardContent className="flex flex-col gap-1.5 p-2.5">
        <div className="flex items-start justify-between gap-1">
          <div className="text-xs font-bold leading-none">{op.order_number}</div>
          <div className="flex items-center gap-1">
            {op.annex && <Paperclip className="size-3 text-muted-foreground" />}
            {op.is_special && (
              <Badge
                variant="secondary"
                className="h-4 bg-indigo-100 px-1 py-0 text-[9px] text-indigo-800 hover:bg-indigo-100 dark:bg-indigo-900/50 dark:text-indigo-300"
              >
                ESP
              </Badge>
            )}
          </div>
        </div>

        <div className="truncate text-xs leading-none text-muted-foreground" title={op.client_name}>
          {op.client_name}
        </div>

        <div
          className="truncate text-[11px] font-medium leading-snug"
          title={op.expand?.product_id?.name}
        >
          {op.quantity}x{' '}
          {op.is_special ? 'Sob Medida' : op.expand?.product_id?.name || 'Sem Produto'}
        </div>

        <div className="mt-1 flex items-center justify-between">
          <Badge
            variant="outline"
            className="h-4 px-1 py-0 text-[9px] font-semibold uppercase text-muted-foreground"
          >
            {viewMode === 'status' ? op.stage : op.status}
          </Badge>

          {(isSlaAlert || isLocked) && (
            <div className="flex items-center gap-1 text-[10px] font-medium">
              {isLocked ? (
                <span className="flex items-center text-red-600 dark:text-red-400">
                  <AlertTriangle className="mr-0.5 size-3" />
                  {op.bottleneck_reason === 'Falta de Material'
                    ? 'Material'
                    : op.bottleneck_reason === 'Dúvida Técnica'
                      ? 'Dúvida'
                      : op.bottleneck_reason === 'Sobrecarga'
                        ? 'Sobrecarga'
                        : op.bottleneck_reason}
                </span>
              ) : (
                <span className="flex items-center text-orange-600 dark:text-orange-400">
                  <Clock className="mr-0.5 size-3" />
                  {daysToDelivery}d
                </span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function PcpKanban() {
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [viewMode, setViewMode] = useState<'status' | 'process'>('status')
  const [collapsedCols, setCollapsedCols] = useState<string[]>([])

  const loadOrders = async () => {
    try {
      const records = await pb.collection('pcp_orders').getFullList<PcpOrder>({
        sort: '-created',
        expand: 'product_id',
      })
      setOrders(records)
    } catch {
      /* intentionally ignored */
    }
  }

  useEffect(() => {
    loadOrders()
  }, [])

  useRealtime('pcp_orders', () => {
    loadOrders()
  })

  const lockedCount = orders.filter((o) => o.bottleneck_reason !== 'Nenhum').length

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('op_id', id)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (e: React.DragEvent, col: string) => {
    e.preventDefault()
    const opId = e.dataTransfer.getData('op_id')
    if (opId) {
      try {
        if (viewMode === 'status') {
          await pb.collection('pcp_orders').update(opId, { status: col })
        } else {
          await pb.collection('pcp_orders').update(opId, { stage: col })
        }
      } catch {
        /* intentionally ignored */
      }
    }
  }

  const columns = viewMode === 'status' ? STATUS_COLUMNS : PROCESS_COLUMNS

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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
              onClick={() => setViewMode('process')}
              className={cn('h-8', viewMode === 'process' && 'shadow-sm')}
            >
              <ListTree className="mr-2 size-4" />
              Por Processo
            </Button>
          </div>

          <Card
            className={cn(
              'border-0 bg-red-500 text-white shadow-none',
              lockedCount === 0 && 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white',
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

            if (isCollapsed) {
              return (
                <div
                  key={col}
                  className="flex w-12 shrink-0 cursor-pointer flex-col items-center rounded-xl border bg-slate-100/50 py-4 transition-colors hover:bg-slate-200/50 dark:bg-slate-800/50 dark:hover:bg-slate-700/50"
                  onClick={() => setCollapsedCols((prev) => prev.filter((c) => c !== col))}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, col)}
                >
                  <div className="mb-4 flex size-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    {colOrders.length}
                  </div>
                  <div
                    style={{ writingMode: 'vertical-rl' }}
                    className="rotate-180 text-sm font-semibold tracking-wider text-muted-foreground"
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
                  'flex shrink-0 flex-col gap-3 rounded-xl bg-slate-100/50 p-3 dark:bg-slate-800/50',
                  viewMode === 'status' ? 'w-80 flex-1' : 'w-72',
                )}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col)}
              >
                <div className="flex items-center justify-between pb-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{col}</h3>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {colOrders.length}
                    </Badge>
                  </div>
                  {viewMode === 'process' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-foreground"
                      onClick={() => setCollapsedCols((prev) => [...prev, col])}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
                  {colOrders.map((op) => (
                    <KanbanCard
                      key={op.id}
                      op={op}
                      viewMode={viewMode}
                      onDragStart={handleDragStart}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
