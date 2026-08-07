import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Package, Calendar, Factory } from 'lucide-react'
import { format, parseISO, isValid } from 'date-fns'
import type { MaterialShortage } from '@/types'
import { getShortageSector } from './MaterialShortageBySectorPanel'
import { cn } from '@/lib/utils'

interface MaterialShortageBySectorModalProps {
  sector: string | null
  shortages: MaterialShortage[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STATUS_STYLES: Record<string, string> = {
  Pendente: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Cotação: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Compra: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Recebido: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Recebido_Parcial: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  Liberado_Estoque: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  Cancelado: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

function formatDateSafe(dateStr?: string): string {
  if (!dateStr) return '—'
  const d = parseISO(dateStr)
  return isValid(d) ? format(d, 'dd/MM/yyyy') : '—'
}

export function MaterialShortageBySectorModal({
  sector,
  shortages,
  open,
  onOpenChange,
}: MaterialShortageBySectorModalProps) {
  const filtered = sector
    ? shortages.filter((s) => {
        if (s.status === 'Recebido' || s.status === 'Cancelado') return false
        return getShortageSector(s) === sector
      })
    : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Factory className="w-5 h-5 text-orange-600" />
            Faltas de Material — {sector}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Nenhuma falta de material pendente para este setor.
            </p>
          ) : (
            <div className="space-y-3">
              {filtered.map((s) => {
                const order = s.expand?.order_id
                return (
                  <div
                    key={s.id}
                    className="flex flex-col gap-2 p-3 border rounded-lg bg-slate-50 dark:bg-slate-800/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 flex items-start gap-2">
                        <Package className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.description}</p>
                          {s.code && (
                            <p className="text-xs text-muted-foreground">Código: {s.code}</p>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn('shrink-0 text-xs', STATUS_STYLES[s.status] || '')}
                      >
                        {s.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    {order && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pl-6">
                        <span>
                          Pedido:{' '}
                          <span className="font-medium text-foreground">{order.order_number}</span>
                        </span>
                        {order.op_number && (
                          <span>
                            OP:{' '}
                            <span className="font-medium text-foreground">{order.op_number}</span>
                          </span>
                        )}
                        <span>
                          Cliente:{' '}
                          <span className="font-medium text-foreground">{order.client_name}</span>
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pl-6">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        Previsão de chegada:{' '}
                        <span className="font-medium text-foreground">
                          {formatDateSafe(s.expected_date)}
                        </span>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
