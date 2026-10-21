import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { NoTranslate } from '@/components/NoTranslate'
import { Calendar, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseLocalDate, formatShortDate } from '@/lib/pcp-utils'
import { differenceInDays, startOfDay } from 'date-fns'

export interface DeadlineOrderItem {
  id: string
  order_number?: string
  op_number?: string
  client_name?: string
  quantity: number
  op_type?: string
  manual_product_name?: string
  delivery_date?: string | null
  status?: string
  stage?: string
  expand?: {
    client_id?: { name?: string }
    product_id?: { name?: string }
    [key: string]: any
  }
  [key: string]: any
}

interface DeadlineOrdersModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orders: DeadlineOrderItem[]
  onSelectOrder: (order: DeadlineOrderItem) => void
}

export function DeadlineOrdersModal({
  open,
  onOpenChange,
  orders,
  onSelectOrder,
}: DeadlineOrdersModalProps) {
  // Excluir OPs com status 'Concluído' internamente e ordenar do vencimento
  // MAIS ANTIGO (mais atrasado) para o mais recente (a vencer). OPs sem delivery_date vão para o final.
  const sortedOrders = useMemo(() => {
    return orders
      .filter((op) => op.status !== 'Concluído')
      .sort((a, b) => {
        const da = parseLocalDate(a.delivery_date)
        const db = parseLocalDate(b.delivery_date)
        const timeA = da && !isNaN(da.getTime()) ? da.getTime() : Infinity
        const timeB = db && !isNaN(db.getTime()) ? db.getTime() : Infinity

        if (timeA !== timeB) return timeA - timeB

        // Desempate estável por data de criação / id / número do pedido
        const ca = a.created ? new Date(a.created).getTime() : 0
        const cb = b.created ? new Date(b.created).getTime() : 0
        if (ca !== cb) return ca - cb

        return String(a.id || '').localeCompare(String(b.id || ''))
      })
  }, [orders])

  const today = startOfDay(new Date())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[850px] max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                <Calendar className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  OPs por Vencimento
                  <Badge
                    variant="secondary"
                    className="font-semibold text-xs bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-200 border border-purple-200 dark:border-purple-800"
                  >
                    {sortedOrders.length}{' '}
                    {sortedOrders.length === 1 ? 'OP em aberto' : 'OPs em aberto'}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Ordenadas do vencimento mais antigo (mais atrasado) para o mais recente / a
                  vencer. Clique para abrir a OP.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* Cabeçalho da tabela */}
          <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-slate-100/70 dark:bg-slate-800/70 text-xs font-semibold text-muted-foreground border-b select-none shrink-0">
            <div className="col-span-2">Pedido</div>
            <div className="col-span-3">Cliente</div>
            <div className="col-span-1 text-center">OP</div>
            <div className="col-span-1 text-center">Qtd</div>
            <div className="col-span-3">Produto</div>
            <div className="col-span-2 text-right">Prazo / Vencimento</div>
          </div>

          <ScrollArea className="flex-1">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedOrders.map((op) => {
                const clientName = op.expand?.client_id?.name || op.client_name || '-'
                const productName =
                  op.op_type === 'Assistência'
                    ? op.manual_product_name || 'Assistência'
                    : op.op_type === 'Especial'
                      ? op.manual_product_name || 'Produto Especial'
                      : op.expand?.product_id?.name || 'S/Produto'

                const dateObj = parseLocalDate(op.delivery_date)
                const hasDate = dateObj && !isNaN(dateObj.getTime())
                const daysDiff = hasDate ? differenceInDays(startOfDay(dateObj), today) : null

                const isDelayed = daysDiff !== null && daysDiff < 0
                const isToday = daysDiff !== null && daysDiff === 0
                const isDueSoon = daysDiff !== null && daysDiff > 0

                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => {
                      onSelectOrder(op)
                      onOpenChange(false)
                    }}
                    className={cn(
                      'w-full grid grid-cols-12 gap-2 px-5 py-3 text-xs text-left transition-colors items-center hover:bg-slate-100/70 dark:hover:bg-slate-900/60 focus:outline-hidden focus:bg-slate-100 dark:focus:bg-slate-900 cursor-pointer',
                      isDelayed && 'bg-red-50/30 dark:bg-red-950/10',
                    )}
                  >
                    {/* 1. Número do pedido */}
                    <div className="col-span-2 font-bold text-foreground">
                      <NoTranslate as="span">{op.order_number || '-'}</NoTranslate>
                    </div>

                    {/* 2. Nome do cliente */}
                    <div
                      className="col-span-3 truncate text-foreground font-medium"
                      title={clientName}
                    >
                      {clientName}
                    </div>

                    {/* 3. Número da OP */}
                    <div className="col-span-1 text-center font-mono font-medium text-slate-700 dark:text-slate-300">
                      <NoTranslate as="span">{op.op_number ? `${op.op_number}` : '-'}</NoTranslate>
                    </div>

                    {/* 4. Quantidade */}
                    <div className="col-span-1 text-center font-semibold text-foreground">
                      {op.quantity ?? 0}
                    </div>

                    {/* 5. Produto */}
                    <div
                      className="col-span-3 truncate text-muted-foreground font-medium"
                      title={productName}
                    >
                      <NoTranslate as="span">{productName}</NoTranslate>
                    </div>

                    {/* 6. Total de dias atrasados/a vencer + Data de vencimento (dd/MM) */}
                    <div className="col-span-2 flex flex-col items-end gap-1 shrink-0">
                      {hasDate ? (
                        <>
                          {isDelayed && (
                            <Badge className="bg-red-600 hover:bg-red-600 text-white border-transparent text-[10px] px-1.5 py-0 h-4 font-semibold">
                              {Math.abs(daysDiff!)}{' '}
                              {Math.abs(daysDiff!) === 1 ? 'dia atrasado' : 'dias atrasados'}
                            </Badge>
                          )}
                          {isToday && (
                            <Badge className="bg-amber-500 hover:bg-amber-500 text-white border-transparent text-[10px] px-1.5 py-0 h-4 font-semibold">
                              Vence hoje
                            </Badge>
                          )}
                          {isDueSoon && (
                            <Badge
                              variant="outline"
                              className="text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-[10px] px-1.5 py-0 h-4 font-semibold"
                            >
                              {daysDiff} {daysDiff === 1 ? 'dia a vencer' : 'dias a vencer'}
                            </Badge>
                          )}
                          <span className="text-[11px] font-bold text-foreground">
                            {formatShortDate(op.delivery_date)}
                          </span>
                        </>
                      ) : (
                        <>
                          <Badge
                            variant="outline"
                            className="text-slate-500 border-slate-200 dark:border-slate-800 text-[10px] px-1.5 py-0 h-4"
                          >
                            Sem prazo
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">-</span>
                        </>
                      )}
                    </div>
                  </button>
                )
              })}

              {sortedOrders.length === 0 && (
                <div className="py-12 px-4 text-center flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <AlertCircle className="size-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium">Nenhuma OP em aberto encontrada</p>
                  <p className="text-xs text-muted-foreground">
                    Tente ajustar os filtros aplicados no topo do painel.
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
