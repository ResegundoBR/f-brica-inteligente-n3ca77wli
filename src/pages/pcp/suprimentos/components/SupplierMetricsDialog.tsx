import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Clock, ShoppingBag, PackageCheck, FileText } from 'lucide-react'
import { Supplier, getSupplierMetrics, SupplierMetrics } from '@/services/suppliers'
import { format, parseISO } from 'date-fns'

interface SupplierMetricsDialogProps {
  supplier: Supplier | null
  open: boolean
  onOpenChange: (o: boolean) => void
}

export function SupplierMetricsDialog({
  supplier,
  open,
  onOpenChange,
}: SupplierMetricsDialogProps) {
  const [metrics, setMetrics] = useState<SupplierMetrics | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && supplier) {
      setLoading(true)
      getSupplierMetrics(supplier.name)
        .then(setMetrics)
        .catch(() => setMetrics(null))
        .finally(() => setLoading(false))
    } else {
      setMetrics(null)
    }
  }, [open, supplier])

  if (!supplier) return null

  const iconForType = (type: string) =>
    type === 'quotation' ? (
      <FileText className="size-3.5 text-blue-500" />
    ) : type === 'purchase' ? (
      <ShoppingBag className="size-3.5 text-orange-500" />
    ) : (
      <PackageCheck className="size-3.5 text-green-500" />
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-5 text-blue-600" /> Métricas — {supplier.name}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Carregando métricas...</p>
        ) : metrics ? (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-4 gap-2">
              <div className="border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{metrics.quotationCount}</p>
                <p className="text-[10px] text-muted-foreground">Cotações</p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-orange-600">{metrics.purchaseCount}</p>
                <p className="text-[10px] text-muted-foreground">Compras</p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{metrics.receivedCount}</p>
                <p className="text-[10px] text-muted-foreground">Recebidos</p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {metrics.averageLeadTime !== null ? `${metrics.averageLeadTime}d` : '-'}
                </p>
                <p className="text-[10px] text-muted-foreground">Prazo Médio</p>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2">Histórico</h4>
              {metrics.history.length > 0 ? (
                <ScrollArea className="h-[250px] rounded border p-2">
                  <div className="space-y-2">
                    {metrics.history.map((h, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        {iconForType(h.type)}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{h.description}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {format(parseISO(h.date), 'dd/MM/yyyy')} — {h.details}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[9px] shrink-0">
                          {h.type === 'quotation'
                            ? 'Cotação'
                            : h.type === 'purchase'
                              ? 'Compra'
                              : 'Recebimento'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4 border rounded">
                  Nenhum histórico disponível.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Não foi possível carregar as métricas.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
