import { useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Clock, ShoppingCart } from 'lucide-react'
import { format, parseISO, differenceInDays } from 'date-fns'
import type { Supplier, Quotation, MaterialShortage } from '@/types'

interface SupplierMetricsProps {
  supplier: Supplier | null
  quotations: Quotation[]
  shortages: MaterialShortage[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SupplierMetrics({
  supplier,
  quotations,
  shortages,
  open,
  onOpenChange,
}: SupplierMetricsProps) {
  const metrics = useMemo(() => {
    const purchases = shortages.filter(
      (s) => s.status === 'Recebido' || s.status === 'Recebido_Parcial' || s.status === 'Compra',
    )
    const delivered = shortages.filter(
      (s) => s.status === 'Recebido' || s.status === 'Recebido_Parcial',
    )
    const leadTimes = delivered
      .filter((s) => s.purchase_date && s.expected_date)
      .map((s) => differenceInDays(parseISO(s.expected_date!), parseISO(s.purchase_date!)))
    const avgDelivery =
      leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : null
    return { purchases, delivered, avgDelivery }
  }, [shortages])

  if (!supplier) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supplier.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {(supplier.contact_name || supplier.email || supplier.phone) && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-1">
              {supplier.contact_name && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Contato:</span> {supplier.contact_name}
                </p>
              )}
              {supplier.email && (
                <p className="text-sm">
                  <span className="text-muted-foreground">E-mail:</span> {supplier.email}
                </p>
              )}
              {supplier.phone && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Telefone:</span> {supplier.phone}
                </p>
              )}
              {supplier.whatsapp && (
                <p className="text-sm">
                  <span className="text-muted-foreground">WhatsApp:</span> {supplier.whatsapp}
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 border rounded-lg text-center">
              <TrendingUp className="w-4 h-4 mx-auto text-blue-500 mb-1" />
              <p className="text-2xl font-bold">{quotations.length}</p>
              <p className="text-xs text-muted-foreground">Cotações</p>
            </div>
            <div className="p-3 border rounded-lg text-center">
              <ShoppingCart className="w-4 h-4 mx-auto text-green-500 mb-1" />
              <p className="text-2xl font-bold">{metrics.purchases.length}</p>
              <p className="text-xs text-muted-foreground">Compras</p>
            </div>
            <div className="p-3 border rounded-lg text-center">
              <Clock className="w-4 h-4 mx-auto text-orange-500 mb-1" />
              <p className="text-2xl font-bold">
                {metrics.avgDelivery !== null ? metrics.avgDelivery.toFixed(0) : '-'}
              </p>
              <p className="text-xs text-muted-foreground">Prazo Médio (dias)</p>
            </div>
          </div>
          {metrics.delivered.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Histórico de Entregas</h4>
              <div className="space-y-1">
                {metrics.delivered.map((d) => {
                  const leadTime =
                    d.purchase_date && d.expected_date
                      ? differenceInDays(parseISO(d.expected_date), parseISO(d.purchase_date))
                      : null
                  return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between p-2 border rounded-lg text-xs"
                    >
                      <span className="font-medium">{d.description}</span>
                      <div className="flex gap-3">
                        <span className="text-muted-foreground">
                          Compra:{' '}
                          {d.purchase_date ? format(parseISO(d.purchase_date), 'dd/MM/yy') : '-'}
                        </span>
                        <span className="text-muted-foreground">
                          Prev:{' '}
                          {d.expected_date ? format(parseISO(d.expected_date), 'dd/MM/yy') : '-'}
                        </span>
                        {leadTime !== null && (
                          <Badge variant="outline" className="text-[10px]">
                            {leadTime} dias
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {quotations.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Histórico de Cotações</h4>
              <div className="space-y-1">
                {quotations.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between p-2 border rounded-lg text-xs"
                  >
                    <span className="font-medium">R$ {q.price.toFixed(2)}</span>
                    <div className="flex gap-3">
                      <span className="text-muted-foreground">{q.delivery_days || '-'} dias</span>
                      <span className="text-muted-foreground">
                        {format(parseISO(q.created), 'dd/MM/yy')}
                      </span>
                      {q.selected && <Badge className="text-[10px]">Selecionado</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
