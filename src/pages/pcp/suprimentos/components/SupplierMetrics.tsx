import { useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp,
  Clock,
  ShoppingCart,
  CheckCircle,
  AlertTriangle,
  Truck,
  FileText,
} from 'lucide-react'
import { format, parseISO, differenceInDays, isValid, isBefore, startOfDay } from 'date-fns'
import type { Supplier, Quotation, MaterialShortage, OrdemCompra } from '@/types'

interface SupplierMetricsProps {
  supplier: Supplier | null
  quotations: Quotation[]
  shortages: MaterialShortage[]
  ocs?: OrdemCompra[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SupplierMetrics({
  supplier,
  quotations,
  shortages,
  ocs = [],
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

  const ocMetrics = useMemo(() => {
    const today = startOfDay(new Date())
    const supplierOCs = ocs.filter(
      (o) => o.supplier === supplier?.name || (supplier?.id && o.supplier_id === supplier.id),
    )
    const received = supplierOCs.filter((o) => o.status === 'Recebida')
    const cancelled = supplierOCs.filter((o) => o.status === 'Cancelada')
    const delayed = supplierOCs.filter((o) => {
      if (o.status === 'Recebida' || o.status === 'Cancelada' || !o.expected_date) return false
      const d = parseISO(o.expected_date)
      return isValid(d) && isBefore(startOfDay(d), today)
    })
    return {
      total: supplierOCs.length,
      onTime: received.length,
      delayed: delayed.length,
      received: received.length,
    }
  }, [ocs, supplier])

  if (!supplier) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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

          {ocMetrics.total > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Performance de Ordens de Compra
              </h4>
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 border p-3 text-center">
                  <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                    {ocMetrics.total}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Total</p>
                </div>
                <div className="rounded-md bg-green-50 dark:bg-green-900/20 border p-3 text-center">
                  <CheckCircle className="w-4 h-4 mx-auto text-green-600 mb-1" />
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                    {ocMetrics.onTime}
                  </p>
                  <p className="text-[10px] text-muted-foreground">No Prazo</p>
                </div>
                <div className="rounded-md bg-red-50 dark:bg-red-900/20 border p-3 text-center">
                  <AlertTriangle className="w-4 h-4 mx-auto text-red-600 mb-1" />
                  <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                    {ocMetrics.delayed}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Atrasadas</p>
                </div>
                <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border p-3 text-center">
                  <Truck className="w-4 h-4 mx-auto text-blue-600 mb-1" />
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                    {ocMetrics.received}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Recebidas</p>
                </div>
              </div>
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
