import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { useShortageStore } from '@/stores/useShortageStore'
import { MaterialShortage } from '@/types'
import { CheckCircle, ShoppingCart, AlertCircle, TrendingUp, AlertTriangle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

function HistoryPanel({ history }: { history: any[] }) {
  if (history.length === 0) return null
  return (
    <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 w-full">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <ShoppingCart className="size-4" /> Histórico de Compras (Últimas 3)
      </h3>
      <div className="space-y-2">
        {history.map((h, i) => (
          <div
            key={i}
            className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 p-3 rounded-md text-sm"
          >
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {h.supplier || 'N/A'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {h.purchase_date
                  ? new Date(h.purchase_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
                  : h.created
                    ? new Date(h.created).toLocaleDateString('pt-BR')
                    : '-'}
              </p>
            </div>
            <div className="text-right">
              <p className="font-medium text-slate-900 dark:text-slate-100">{h.quantity || 0} un</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {h.unit_price ? `R$ ${Number(h.unit_price).toFixed(2)}` : '-'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ShortageDetailsModal({
  item,
  allShortages,
  onClose,
}: {
  item: MaterialShortage
  allShortages: MaterialShortage[]
  onClose: () => void
}) {
  const [quantity, setQuantity] = useState(item.quantity)
  const [status, setStatus] = useState(item.status)
  const [unitPrice, setUnitPrice] = useState<number | ''>(item.unit_price || '')
  const [purchaseDate, setPurchaseDate] = useState(
    item.purchase_date ? item.purchase_date.substring(0, 10) : '',
  )
  const [supplier, setSupplier] = useState(item.supplier || '')
  const [expectedDate, setExpectedDate] = useState(
    item.expected_date ? item.expected_date.substring(0, 10) : '',
  )
  const { toast } = useToast()

  const [history, setHistory] = useState<MaterialShortage[]>([])

  useEffect(() => {
    const fetchHistory = async () => {
      if (!item.code && !item.description) return
      try {
        const filter = item.code ? `code = "${item.code}"` : `description ~ "${item.description}"`
        const res = await pb.collection('material_shortages').getList<MaterialShortage>(1, 3, {
          filter: `(${filter}) && status = "Recebido" && id != "${item.id}"`,
          sort: '-purchase_date',
        })
        setHistory(res.items)
      } catch {
        /* intentionally ignored */
      }
    }
    fetchHistory()
  }, [item])

  const handleSave = async () => {
    try {
      await pb.collection('material_shortages').update(item.id, {
        quantity,
        status,
        unit_price: unitPrice === '' ? null : Number(unitPrice),
        purchase_date: purchaseDate ? new Date(purchaseDate).toISOString() : null,
        supplier,
        expected_date: expectedDate ? new Date(expectedDate).toISOString() : null,
      })
      toast({ title: 'Item atualizado com sucesso' })
      onClose()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleQuickAction = async (newStatus: string) => {
    try {
      await pb.collection('material_shortages').update(item.id, { status: newStatus })
      toast({ title: 'Status atualizado com sucesso' })
      onClose()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const pastPurchases = allShortages
    .filter(
      (s) =>
        s.status === 'Recebido' &&
        s.id !== item.id &&
        (s.code === item.code || s.description === item.description) &&
        s.unit_price != null &&
        s.unit_price > 0,
    )
    .sort(
      (a, b) =>
        new Date(b.purchase_date || b.updated).getTime() -
        new Date(a.purchase_date || a.updated).getTime(),
    )

  const lastPurchase = pastPurchases[0]

  const last3Purchases = pastPurchases.slice(0, 3)
  const avgPrice =
    last3Purchases.length > 0
      ? last3Purchases.reduce((acc, curr) => acc + (curr.unit_price || 0), 0) /
        last3Purchases.length
      : 0

  const isPriceHigher = unitPrice !== '' && avgPrice > 0 && Number(unitPrice) > avgPrice

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden">
      <div
        className={cn(
          'shrink-0 h-1.5 w-full',
          item.priority === 'Urgente' ? 'bg-red-500' : 'bg-blue-500',
        )}
      />
      <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
        <DialogTitle className="text-xl font-bold flex items-center justify-between">
          <span>{item.description}</span>
          <Badge variant="outline" className="text-sm">
            {item.status.replace('_', ' ')}
          </Badge>
        </DialogTitle>
        <div className="flex gap-4 items-center text-sm text-muted-foreground mt-2">
          <span>Código: {item.code || '-'}</span>
          <Badge
            variant={item.priority === 'Urgente' ? 'destructive' : 'secondary'}
            className="text-[10px]"
          >
            {item.priority || 'Sem pressa'}
          </Badge>
        </div>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
              Solicitante
            </span>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {item.expand?.requested_by?.name || 'Sistema'}
            </span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
              Origem
            </span>
            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              {item.order_id && item.expand?.order_id?.order_number
                ? `OP: ${item.expand.order_id.order_number}`
                : 'Req. Geral'}
            </span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
              Tipo / Setor
            </span>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {item.request_type || item.sector}
            </span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
              Data Req.
            </span>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {new Date(item.created).toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>

        {item.observation && (
          <div className="text-sm text-slate-700 dark:text-slate-300 bg-yellow-50/50 dark:bg-yellow-900/10 p-3 rounded border border-yellow-100 dark:border-yellow-900/30">
            <span className="font-semibold text-yellow-700 dark:text-yellow-500 mr-2">Obs:</span>
            {item.observation}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Quantidade (Editável)</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="bg-white dark:bg-slate-950"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus as any}>
              <SelectTrigger className="bg-white dark:bg-slate-950">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pendente">Pendente</SelectItem>
                <SelectItem value="Liberado_Estoque">Liberado Estoque</SelectItem>
                <SelectItem value="Cotação">Cotação</SelectItem>
                <SelectItem value="Compra">Compra</SelectItem>
                <SelectItem value="Recebido">Recebido</SelectItem>
                <SelectItem value="Cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Fornecedor</Label>
            <Input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Nome do Fornecedor..."
              className="bg-white dark:bg-slate-950"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Preço Unitário (R$)</Label>
              {isPriceHigher && (
                <div className="flex items-center text-[10px] text-amber-600 dark:text-amber-500 font-bold bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">
                  <TrendingUp className="size-3 mr-1" />
                  Acima da média (R$ {avgPrice.toFixed(2)})
                </div>
              )}
            </div>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value ? Number(e.target.value) : '')}
                placeholder="0.00"
                className={cn(
                  'bg-white dark:bg-slate-950',
                  isPriceHigher && 'border-amber-400 focus-visible:ring-amber-400',
                )}
              />
              {isPriceHigher && (
                <AlertTriangle className="size-4 text-amber-500 absolute right-3 top-1/2 -translate-y-1/2" />
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Data da Compra</Label>
            <Input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="bg-white dark:bg-slate-950"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Previsão de Entrega (Retorno)</Label>
            <Input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="bg-white dark:bg-slate-950"
            />
          </div>
        </div>

        <HistoryPanel history={history} />
      </div>

      <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex gap-2">
          {item.status === 'Pendente' && (
            <>
              <Button
                variant="outline"
                className="border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/30"
                onClick={() => handleQuickAction('Liberado_Estoque')}
              >
                <CheckCircle className="size-4 mr-1.5" /> No Estoque
              </Button>
              <Button
                variant="outline"
                className="border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/30"
                onClick={() => handleQuickAction('Cotação')}
              >
                <ShoppingCart className="size-4 mr-1.5" /> Para Cotação
              </Button>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="bg-white dark:bg-slate-950">
            Cancelar
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSave}>
            Salvar Alterações
          </Button>
        </div>
      </div>
    </div>
  )
}

function ShortageRow({
  item,
  allShortages,
  editableQuantity,
}: {
  item: MaterialShortage
  allShortages: MaterialShortage[]
  editableQuantity?: boolean
}) {
  const [open, setOpen] = useState(false)
  const isUrgent = item.priority === 'Urgente'
  const selectedIds = useShortageStore((state) => state.selectedIds)
  const toggle = useShortageStore((state) => state.toggle)

  return (
    <>
      <TableRow
        onClick={() => setOpen(true)}
        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        <TableCell onClick={(e) => e.stopPropagation()} className="w-[40px]">
          <Checkbox
            checked={selectedIds.includes(item.id)}
            onCheckedChange={() => toggle(item.id)}
          />
        </TableCell>
        <TableCell className="font-medium text-xs text-slate-500">{item.code || '-'}</TableCell>
        <TableCell className="font-semibold text-slate-900 dark:text-slate-100">
          {item.description}
        </TableCell>
        <TableCell
          className="text-right"
          onClick={(e) => {
            if (editableQuantity) e.stopPropagation()
          }}
        >
          {editableQuantity ? (
            <Input
              type="number"
              min={1}
              step={0.01}
              className="w-20 text-right ml-auto h-8 font-black bg-white dark:bg-slate-950"
              defaultValue={item.quantity}
              onBlur={async (e) => {
                const val = Number(e.target.value)
                if (val > 0 && val !== item.quantity) {
                  try {
                    await pb.collection('material_shortages').update(item.id, { quantity: val })
                  } catch (err) {
                    /* ignore */
                  }
                }
              }}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur()
                }
              }}
            />
          ) : (
            <span className="font-black text-slate-700 dark:text-slate-300">{item.quantity}</span>
          )}
        </TableCell>
        <TableCell className="text-xs text-slate-600 dark:text-slate-400">
          {item.request_type || item.sector}
        </TableCell>
        <TableCell>
          <Badge
            variant={
              isUrgent ? 'destructive' : item.priority === 'Próximos dias' ? 'secondary' : 'outline'
            }
            className="text-[10px] whitespace-nowrap"
          >
            {item.priority || 'Sem pressa'}
          </Badge>
        </TableCell>
        <TableCell className="text-xs text-slate-600 dark:text-slate-400 font-medium">
          {item.expand?.requested_by?.name ? (
            item.expand.requested_by.name
          ) : (
            <span className="flex items-center gap-1 opacity-70">
              <AlertCircle className="size-3" /> Sistema
            </span>
          )}
        </TableCell>
        <TableCell>
          <Badge
            variant="outline"
            className={cn(
              'whitespace-nowrap',
              item.status === 'Recebido' &&
                'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
              item.status === 'Pendente' &&
                'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
              (item.status === 'Cotação' || item.status === 'Compra') &&
                'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
              item.status === 'Cancelado' &&
                'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
              item.status === 'Liberado_Estoque' &&
                'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800',
            )}
          >
            {item.status.replace('_', ' ')}
          </Badge>
        </TableCell>
      </TableRow>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[700px] h-auto max-h-[90vh] overflow-hidden p-0 flex flex-col">
          <ShortageDetailsModal
            item={item}
            allShortages={allShortages}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ShortageTable({
  items,
  allShortages,
  editableQuantity,
}: {
  items: MaterialShortage[]
  allShortages: MaterialShortage[]
  editableQuantity?: boolean
}) {
  const selectedIds = useShortageStore((state) => state.selectedIds)
  const availableIds = useShortageStore((state) => state.availableIds)
  const setAvailableIds = useShortageStore((state) => state.setAvailableIds)
  const toggleAll = useShortageStore((state) => state.toggleAll)

  useEffect(() => {
    setAvailableIds(items.map((i) => i.id))
  }, [items, setAvailableIds])

  if (items.length === 0) {
    return (
      <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
        Nenhum item encontrado.
      </div>
    )
  }
  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
          <TableRow>
            <TableHead className="w-[40px]">
              <Checkbox
                checked={availableIds.length > 0 && selectedIds.length === availableIds.length}
                onCheckedChange={() => toggleAll()}
              />
            </TableHead>
            <TableHead className="w-[100px]">Código</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="text-right w-[80px]">Qtd</TableHead>
            <TableHead className="w-[120px]">Tipo / Setor</TableHead>
            <TableHead className="w-[120px]">Prioridade</TableHead>
            <TableHead className="w-[150px]">Solicitante</TableHead>
            <TableHead className="w-[120px]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <ShortageRow
              key={item.id}
              item={item}
              allShortages={allShortages}
              editableQuantity={editableQuantity}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export default ShortageTable
