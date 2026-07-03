import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Clock, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDeadline, isOrderOverdue, getStageDelay, formatOpIdentifier } from '@/lib/pcp-utils'
import { format, parseISO } from 'date-fns'

export function KanbanCardHover({
  order,
  observations = [],
  shortages = [],
  children,
}: {
  order: any
  observations?: any[]
  shortages?: any[]
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  const handleEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpen(true)
  }

  const handleLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 200)
  }

  const productName =
    order.op_type === 'Assistência'
      ? order.manual_product_name
      : order.op_type === 'Especial'
        ? 'Produto Especial'
        : order.expand?.product_id?.name || 'S/Produto'

  const clientName = order.expand?.client_id?.name || order.client_name || 'S/Cliente'
  const overdue = isOrderOverdue(order.delivery_date, order.status)
  const stageDelay = getStageDelay(order)
  const isEmergency = order.manual_priority === 1

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <div onMouseEnter={handleEnter} onMouseLeave={handleLeave} onClick={() => setOpen(false)}>
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-3 text-xs z-50"
        side="top"
        align="center"
        sideOffset={6}
        collisionPadding={8}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 border-b pb-2">
            <span className="font-bold text-sm">{formatOpIdentifier(order)}</span>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] shrink-0',
                order.status === 'Parado' && 'border-orange-400 text-orange-600',
                order.status === 'Concluído' && 'border-green-400 text-green-600',
                order.status === 'Em Andamento' && 'border-blue-400 text-blue-600',
              )}
            >
              {order.status}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <div>
              <span className="text-muted-foreground">Cliente</span>
              <p className="font-medium line-clamp-2">{clientName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Produto</span>
              <p className="font-medium line-clamp-2">{productName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Quantidade</span>
              <p className="font-medium">{order.quantity}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Tipo OP</span>
              <p className="font-medium">{order.op_type}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Entrega</span>
              <p className={cn('font-medium', overdue && 'text-red-500')}>
                {order.delivery_date ? format(parseISO(order.delivery_date), 'dd/MM/yyyy') : '-'}
                <span className="ml-1 text-[10px]">
                  ({formatDeadline(order.delivery_date, order.status)})
                </span>
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Etapa</span>
              <p className="font-medium">{order.stage}</p>
            </div>
          </div>

          {order.bottleneck_reason && order.bottleneck_reason !== 'Nenhum' && (
            <div className="bg-orange-50 dark:bg-orange-950/30 rounded-md p-2 border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-1 text-orange-700 dark:text-orange-400 font-semibold">
                <AlertCircle className="size-3" />
                {order.bottleneck_reason}
              </div>
              {order.bottleneck_details && (
                <p className="mt-1 text-orange-600 dark:text-orange-300 whitespace-pre-wrap">
                  {order.bottleneck_details}
                </p>
              )}
            </div>
          )}

          {order.observations && (
            <div>
              <span className="text-muted-foreground font-medium">Observação Geral</span>
              <p className="mt-0.5 whitespace-pre-wrap bg-slate-50 dark:bg-slate-900 rounded p-1.5">
                {order.observations}
              </p>
            </div>
          )}

          {order.observation_sector && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Setor de Obs.:</span>
              <Badge variant="secondary" className="text-[10px]">
                {order.observation_sector}
              </Badge>
            </div>
          )}

          {observations.length > 0 && (
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium">Observações Setoriais</span>
              {observations.map((obs: any) => (
                <div
                  key={obs.id}
                  className="bg-yellow-100 dark:bg-yellow-900/30 rounded p-1.5 border-l-2 border-yellow-400"
                >
                  <span className="font-semibold">{obs.sector}:</span>{' '}
                  <span className="whitespace-pre-wrap">{obs.content}</span>
                </div>
              ))}
            </div>
          )}

          {shortages.length > 0 && (
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium">Materiais</span>
              {shortages.map((s: any) => {
                const isResolved = s.status === 'Recebido' || s.status === 'Liberado_Estoque'
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 rounded p-1.5"
                  >
                    {isResolved ? (
                      <span className="text-green-500 text-[10px]">✅</span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">⭕</span>
                    )}
                    <span
                      className={cn(
                        'text-[11px] flex-1 truncate',
                        isResolved && 'line-through opacity-60',
                      )}
                    >
                      {s.description}
                    </span>
                    <span className="text-[9px] text-muted-foreground shrink-0">
                      {s.status.replace('_', ' ')}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {(stageDelay.delayed || isEmergency) && (
            <div className="flex flex-wrap gap-1.5 pt-1 border-t">
              {isEmergency && (
                <Badge variant="destructive" className="text-[10px] bg-red-600">
                  🚨 Emergência
                </Badge>
              )}
              {stageDelay.delayed && (
                <Badge
                  variant="outline"
                  className="text-[10px] text-orange-600 border-orange-300 dark:text-orange-400"
                >
                  <Clock className="size-2.5 mr-0.5" />⏰ Atrasada há {stageDelay.formatted}
                </Badge>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
