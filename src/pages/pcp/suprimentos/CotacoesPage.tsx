import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MaterialShortage } from '@/types'
import { Tags, Copy, Check, Search } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { advanceToCompra } from '@/services/quotations'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { TriageDialog } from './components/TriageDialog'
import { NovoBadge } from '@/components/NovoBadge'
import { useViewedItems } from '@/hooks/use-viewed-items'
import { toast } from 'sonner'

export default function CotacoesPage() {
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [selectedItem, setSelectedItem] = useState<MaterialShortage | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const [search, setSearch] = useState('')
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
        {selectedIds.size > 0 && (
          <Button variant="outline" size="sm" onClick={handleCopySelected}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            Copiar ({selectedIds.size})
          </Button>
        )}
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
        <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={
                      selectedIds.size === filteredCotacaoItems.length &&
                      filteredCotacaoItems.length > 0
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-[80px]">Data</TableHead>
                <TableHead className="w-[80px]">Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-[120px]">Solicitante</TableHead>
                <TableHead className="w-[100px]">Nº do Pedido</TableHead>
                <TableHead className="w-[100px]">Nº da OP</TableHead>
                <TableHead className="text-right w-[60px]">Qtde</TableHead>
                <TableHead className="w-[80px]">Prioridade</TableHead>
                <TableHead className="w-[110px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCotacaoItems.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => handleRowClick(item)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => toggleSelect(item.id)}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(parseISO(item.created), 'dd/MM/yy')}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.code || '-'}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    <div className="flex items-center gap-2">
                      {item.description}
                      {isNew(item.id) && <NovoBadge />}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.expand?.requested_by?.name || '-'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.expand?.order_id?.order_number || '-'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.expand?.order_id?.op_number || '-'}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold">
                    {item.quantity}
                  </TableCell>
                  <TableCell>
                    {item.priority && (
                      <Badge variant="outline" className="text-[10px]">
                        {item.priority}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs whitespace-nowrap"
                      onClick={() => handleQuickCompra(item)}
                    >
                      ⏭️ Compras
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
