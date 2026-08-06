import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MaterialShortage } from '@/types'
import { Tags, Copy, Check, Search, Layers } from 'lucide-react'
import { advanceToCompra } from '@/services/quotations'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { TriageDialog } from './components/TriageDialog'
import { CotacoesTable } from './components/CotacoesTable'
import { useViewedItems } from '@/hooks/use-viewed-items'
import { toast } from 'sonner'

export default function CotacoesPage() {
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [selectedItem, setSelectedItem] = useState<MaterialShortage | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const [search, setSearch] = useState('')
  const [grouped, setGrouped] = useState(false)
  const { isNew, markAsViewed } = useViewedItems('cotacoes')

  const fetchData = async () => {
    try {
      const shortRes = await pb.collection('material_shortages').getFullList<MaterialShortage>({
        sort: '-created',
        expand: 'order_id,order_id.product_id,requested_by',
      })
      setShortages(shortRes)
    } catch {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchData()
  }, [])
  useRealtime('material_shortages', fetchData)

  const normalizeText = (text: string | undefined | null): string =>
    (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

  const filteredCotacaoItems = useMemo(() => {
    const cotacaoItems = shortages.filter((s) => s.status === 'Cotação')
    const query = normalizeText(search.trim())
    if (!query) return cotacaoItems
    return cotacaoItems.filter((item) => {
      const productName =
        normalizeText(item.expand?.order_id?.expand?.product_id?.name) ||
        normalizeText(item.expand?.order_id?.manual_product_name)
      const requesterName = normalizeText(item.expand?.requested_by?.name)
      const orderNumber = normalizeText(item.expand?.order_id?.order_number)
      const opNumber = normalizeText(item.expand?.order_id?.op_number)
      return (
        productName.includes(query) ||
        requesterName.includes(query) ||
        orderNumber.includes(query) ||
        opNumber.includes(query)
      )
    })
  }, [shortages, search])

  const handleRowClick = (item: MaterialShortage) => {
    markAsViewed(item.id)
    setSelectedItem(item)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCotacaoItems.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredCotacaoItems.map((i) => i.id)))
    }
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

  const handleQuickCompra = async (item: MaterialShortage) => {
    try {
      await advanceToCompra(item.id)
      toast.success('Item enviado direto para Compras')
      fetchData()
    } catch {
      toast.error('Erro ao enviar item para Compras')
    }
  }

  const handleCopySelected = () => {
    const items = filteredCotacaoItems.filter((i) => selectedIds.has(i.id))
    if (items.length === 0) return
    const text = `Solicitação de Cotação\n\n${items
      .map((i, idx) => `${idx + 1}. ${i.description} - Qtde: ${i.quantity}`)
      .join('\n')}\n\nFavor informar preço e prazo de entrega.`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Texto copiado para área de transferência')
    })
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <div className="flex items-center justify-between">
        <SuprimentosHeader
          title="Cotações"
          description="Triagem e cotação de solicitações de material."
          icon={Tags}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setGrouped((g) => !g)}>
            <Layers className="w-4 h-4" />
            {grouped ? 'Lista' : 'Agrupar por fornecedor'}
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="outline" size="sm" onClick={handleCopySelected}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              Copiar ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por produto, solicitante, pedido ou OP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filteredCotacaoItems.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          {search.trim()
            ? 'Nenhum item encontrado para a busca.'
            : 'Nenhum item para triagem no momento.'}
        </div>
      ) : (
        <CotacoesTable
          items={filteredCotacaoItems}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onToggleSelectGroup={toggleSelectGroup}
          onRowClick={handleRowClick}
          onQuickCompra={handleQuickCompra}
          isNew={isNew}
          grouped={grouped}
        />
      )}

      <TriageDialog
        item={selectedItem}
        open={!!selectedItem}
        onOpenChange={(o) => !o && setSelectedItem(null)}
        onUpdate={fetchData}
      />
    </div>
  )
}
