import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, AlertTriangle } from 'lucide-react'
import { parseISO, isBefore, startOfDay, isValid, format } from 'date-fns'
import type { OrdemCompra } from '@/types'
import { cn } from '@/lib/utils'

interface PendingReceivingPanelProps {
  ocs: OrdemCompra[]
}

export function PendingReceivingPanel({ ocs }: PendingReceivingPanelProps) {
  const today = startOfDay(new Date())

  const pending = useMemo(
    () => ocs.filter((o) => o.status === 'Pendente' || o.status === 'Enviada'),
    [ocs],
  )

  const overdueCount = useMemo(
    () =>
      pending.filter((o) => {
        if (!o.expected_date) return false
        const d = parseISO(o.expected_date)
        return isValid(d) && isBefore(startOfDay(d), today)
      }).length,
    [pending, today],
  )

  const sorted = useMemo(
    () =>
      [...pending].sort((a, b) => {
        const da = a.expected_date ? parseISO(a.expected_date).getTime() : Infinity
        const db = b.expected_date ? parseISO(b.expected_date).getTime() : Infinity
        return da - db
      }),
    [pending],
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            OCs a Receber
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{pending.length}</Badge>
            {overdueCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="w-3 h-3" />
                {overdueCount} atrasada{overdueCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-72 overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma OC pendente de recebimento.
          </p>
        ) : (
          sorted.map((o) => {
            const isOverdue = (() => {
              if (!o.expected_date) return false
              const d = parseISO(o.expected_date)
              return isValid(d) && isBefore(startOfDay(d), today)
            })()
            return (
              <div
                key={o.id}
                className={cn(
                  'flex items-center justify-between gap-2 p-2 rounded-md border text-sm',
                  isOverdue
                    ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20'
                    : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{o.oc_number}</p>
                  <p className="text-xs text-muted-foreground truncate">{o.supplier}</p>
                </div>
                <div className="text-right shrink-0">
                  <Badge
                    variant={o.status === 'Enviada' ? 'secondary' : 'outline'}
                    className="text-[10px]"
                  >
                    {o.status}
                  </Badge>
                  <p
                    className={cn(
                      'text-xs mt-1',
                      isOverdue ? 'text-red-600 font-semibold' : 'text-muted-foreground',
                    )}
                  >
                    {o.expected_date ? format(parseISO(o.expected_date), 'dd/MM/yy') : 'Sem data'}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
