import { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { PcpOrder } from '@/types'
import { useRealtime } from '@/hooks/use-realtime'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { differenceInDays, parseISO } from 'date-fns'
import { AlertTriangle, Clock, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'

const COLUMNS = ['Fila', 'Em Andamento', 'Revisão', 'Concluído'] as const

export default function PcpKanban() {
  const [orders, setOrders] = useState<PcpOrder[]>([])

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

  const handleDrop = async (e: React.DragEvent, status: string) => {
    e.preventDefault()
    const opId = e.dataTransfer.getData('op_id')
    if (opId) {
      try {
        await pb.collection('pcp_orders').update(opId, { status })
      } catch {
        /* intentionally ignored */
      }
    }
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Painel de Controle (Kanban)</h1>
          <p className="text-muted-foreground">Acompanhamento de Ordens de Produção</p>
        </div>
        <Card
          className={cn(
            'bg-red-500 text-white',
            lockedCount === 0 && 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white',
          )}
        >
          <CardHeader className="py-2 pb-0">
            <CardTitle className="text-sm font-medium">OPs Travadas (Gargalo)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lockedCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid h-full grid-cols-1 gap-6 md:grid-cols-4">
        {COLUMNS.map((col) => (
          <div
            key={col}
            className="flex flex-col gap-4 rounded-xl bg-slate-100/50 p-4 dark:bg-slate-800/50"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col)}
          >
            <h3 className="font-semibold">{col}</h3>
            <div className="flex flex-1 flex-col gap-3">
              {orders
                .filter((o) => o.status === col)
                .map((op) => {
                  const daysToDelivery = differenceInDays(parseISO(op.delivery_date), new Date())
                  const isSlaAlert = daysToDelivery <= 2 && op.status !== 'Concluído'
                  const isLocked = op.bottleneck_reason !== 'Nenhum'

                  return (
                    <Card
                      key={op.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, op.id)}
                      className={cn(
                        'cursor-grab active:cursor-grabbing border-2',
                        op.is_special
                          ? 'border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                          : 'border-transparent',
                        isLocked &&
                          'animate-pulse border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]',
                      )}
                    >
                      <CardContent className="p-4 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-sm">{op.order_number}</div>
                          {op.is_special && (
                            <Badge variant="secondary" className="bg-indigo-100 text-indigo-800">
                              Especial
                            </Badge>
                          )}
                        </div>

                        <div className="text-sm text-muted-foreground truncate">
                          {op.client_name}
                        </div>
                        <div className="text-sm font-medium truncate">
                          {op.is_special
                            ? 'Produto Sob Medida'
                            : op.expand?.product_id?.name || 'Sem Produto'}
                        </div>

                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline">{op.stage}</Badge>
                          {op.annex && <Paperclip className="size-3 text-muted-foreground" />}
                        </div>

                        {(isSlaAlert || isLocked) && (
                          <div className="mt-2 flex items-center gap-2 text-xs font-medium">
                            {isLocked ? (
                              <span className="flex items-center text-red-600 dark:text-red-400">
                                <AlertTriangle className="mr-1 size-3" />
                                {op.bottleneck_reason}
                              </span>
                            ) : (
                              <span className="flex items-center text-orange-600 dark:text-orange-400">
                                <Clock className="mr-1 size-3" />
                                Prazo Curto ({daysToDelivery} dias)
                              </span>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
