import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MaterialShortage, OrdemCompra, OrdemCompraItem } from '@/types'
import { ShoppingCart, FileText, Layers } from 'lucide-react'
import { parseISO, isBefore, startOfDay, isValid } from 'date-fns'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { ComprasTable } from './components/ComprasTable'
import { ComprasItemDialog } from './components/ComprasItemDialog'
import { OrdemCompraModal, type OCItemInput } from './components/OrdemCompraModal'
import { OrdemCompraDocument } from './components/OrdemCompraDocument'
import { createOrdemCompra, getOrdemCompraItens } from '@/services/ordens-compra'
import { useShortageStore } from '@/stores/useShortageStore'
import { toast } from 'sonner'

export default function ComprasPage() {
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [editItem, setEditItem] = useState<MaterialShortage | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [ocModalOpen, setOcModalOpen] = useState(false)
  const [ocItems, setOcItems] = useState<OCItemInput[]>([])
  const [ocSupplier, setOcSupplier] = useState('')
  const [ocDocument, setOcDocument] = useState<OrdemCompra | null>(null)
  const [ocDocumentItems, setOcDocumentItems] = useState<OrdemCompraItem[]>([])
  const [ocDocOpen, setOcDocOpen] = useState(false)
  const clear = useShortageStore((s) => s.clear)
  const { user } = useAuth()
  const [grouped, setGrouped] = useState(false)

  const fetchShortages = async () => {
    try {
      const res = await pb.collection('material_shortages').getFullList<MaterialShortage>({
        sort: '-created',
        expand: 'order_id,order_id.product_id,requested_by',
      })
      setShortages(res)
    } catch {
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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === comprasItems.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(comprasItems.map((i) => i.id)))
  }

  const toggleSelectGroup = (ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = ids.every((id) => next.has(id))
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const handleGerarOC = () => {
    const selected = comprasItems.filter((i) => selectedIds.has(i.id))
    if (selected.length === 0) return
    const suppliers = new Set(selected.map((s) => s.supplier || '').filter(Boolean))
    if (suppliers.size === 0) {
      toast.error('Selecione itens com fornecedor definido')
      return
    }
    if (suppliers.size > 1) {
      toast.error('Selecione itens do mesmo fornecedor para gerar uma OC')
      return
    }
    const supplierName = selected[0].supplier || ''
    const items: OCItemInput[] = selected.map((s) => ({
      description: s.description,
      code: s.code,
      quantity: Number(s.quantity) || 0,
      unit_price: Number(s.unit_price) || 0,
      material_shortage_id: s.id,
    }))
    setOcSupplier(supplierName)
    setOcItems(items)
    setOcModalOpen(true)
  }

  const handleConfirmOC = async (
    items: OCItemInput[],
    deliveryTerms: string,
    expectedDate: string,
  ) => {
    const total = items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0)
    try {
      const oc = await createOrdemCompra({
        supplier: ocSupplier,
        expected_date: expectedDate || undefined,
        delivery_terms: deliveryTerms || undefined,
        total,
        ...(user?.id && { user_id: user.id }),
        itens: items.map((it) => ({
          description: it.description,
          code: it.code,
          quantity: it.quantity,
          unit_price: it.unit_price,
          total: it.quantity * it.unit_price,
          material_shortage_id: it.material_shortage_id,
        })),
      })
      const ocItens = await getOrdemCompraItens(oc.id)
      setOcDocument(oc)
      setOcDocumentItems(ocItens)
      setOcDocOpen(true)
      setSelectedIds(new Set())
      toast.success('Ordem de Compra gerada com sucesso!')
    } catch {
      toast.error('Erro ao gerar Ordem de Compra')
      throw new Error('OC creation failed')
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <div className="flex items-center justify-between">
        <SuprimentosHeader
          title="Compras"
          description="Monitoramento de pedidos de compra ativos e previsão de entrega."
          icon={ShoppingCart}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setGrouped((g) => !g)}>
            <Layers className="w-4 h-4" />
            {grouped ? 'Lista' : 'Agrupar por fornecedor'}
          </Button>
          {selectedIds.size > 0 && (
            <Button onClick={handleGerarOC}>
              <FileText className="w-4 h-4" />
              Gerar OC ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>

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
        <ComprasTable
          items={comprasItems}
          onEdit={setEditItem}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onToggleSelectGroup={toggleSelectGroup}
          grouped={grouped}
        />
      )}

      <ComprasItemDialog
        item={editItem}
        open={!!editItem}
        onOpenChange={(o) => !o && setEditItem(null)}
        onUpdate={fetchShortages}
      />
      <OrdemCompraModal
        open={ocModalOpen}
        onOpenChange={setOcModalOpen}
        supplierName={ocSupplier}
        initialItems={ocItems}
        onConfirm={handleConfirmOC}
      />
      <OrdemCompraDocument
        oc={ocDocument}
        items={ocDocumentItems}
        open={ocDocOpen}
        onOpenChange={setOcDocOpen}
      />
    </div>
  )
}
