import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MaterialShortage } from '@/types'
import { ShoppingCart } from 'lucide-react'
import { parseISO, isBefore, startOfDay, isValid } from 'date-fns'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import ShortageTable from '@/pages/pcp/components/ShortageTable'
import { useShortageStore } from '@/stores/useShortageStore'

export default function ComprasPage() {
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const clear = useShortageStore((s) => s.clear)

  const fetchShortages = async () => {
    try {
      const res = await pb.collection('material_shortages').getFullList<MaterialShortage>({
        sort: '-created',
        expand: 'order_id,order_id.product_id,requested_by',
      })
      setShortages(res)
    } catch (err) {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchShortages()
    return () => clear()
  }, [clear])

  useRealtime('material_shortages', fetchShortages)

  const comprasItems = useMemo(
    () =>
      shortages.filter((s) => {
        if (s.status !== 'Compra' && s.status !== 'Recebido_Parcial') return false
        const total = Number(s.quantity) || 0
        const received = Number(s.received_quantity) || 0
        return total === 0 || received < total
      }),
    [shortages],
  )

  const summary = useMemo(() => {
    const today = startOfDay(new Date())
    let totalValue = 0
    let overdue = 0
    comprasItems.forEach((s) => {
      const total = Number(s.quantity) || 0
      const received = Number(s.received_quantity) || 0
      const pendingQty = Math.max(0, total - received)
      const price = Number(s.unit_price) || 0
      totalValue += pendingQty * price
      if (s.expected_date) {
        const d = parseISO(s.expected_date)
        if (isValid(d) && isBefore(startOfDay(d), today)) overdue++
      }
    })
    return { count: comprasItems.length, totalValue, overdue }
  }, [comprasItems])

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <SuprimentosHeader
        title="Compras"
        description="Monitoramento de pedidos de compra ativos e previsao de entrega."
        icon={ShoppingCart}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Compras Ativas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Valor Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              R${' '}
              {summary.totalValue.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Entregas Atrasadas</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${summary.overdue > 0 ? 'text-red-600' : 'text-slate-700 dark:text-slate-300'}`}
            >
              {summary.overdue}
            </p>
          </CardContent>
        </Card>
      </div>

      {comprasItems.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          Nenhuma compra ativa no momento.
        </div>
      ) : (
        <ShortageTable items={comprasItems} allShortages={shortages} editableQuantity />
      )}
    </div>
  )
}
