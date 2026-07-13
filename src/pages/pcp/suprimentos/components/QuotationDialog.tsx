import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Trash2, Check, ShoppingCart, Pencil, Save, X, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MaterialShortage, Quotation } from '@/types'
import {
  getQuotationsByShortage,
  createQuotation,
  selectQuotation,
  deleteQuotation,
  advanceToCompra,
  updateShortageItem,
} from '@/services/quotations'
import { SupplierSearchSelect } from './SupplierSearchSelect'
import { SupplierFormDialog } from './SupplierFormDialog'
import { useToast } from '@/hooks/use-toast'

export function QuotationDialog({
  item,
  open,
  onOpenChange,
  onUpdate,
}: {
  item: MaterialShortage | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onUpdate?: () => void
}) {
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [supplier, setSupplier] = useState('')
  const [price, setPrice] = useState('')
  const [deliveryDays, setDeliveryDays] = useState('')
  const [editing, setEditing] = useState(false)
  const [editDesc, setEditDesc] = useState('')
  const [editQty, setEditQty] = useState('')
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false)
  const [supplierRefreshKey, setSupplierRefreshKey] = useState(0)
  const { toast } = useToast()

  useEffect(() => {
    if (open && item) {
      getQuotationsByShortage(item.id)
        .then(setQuotations)
        .catch(() => {})
      setSupplier('')
      setPrice('')
      setDeliveryDays('')
      setEditing(false)
      setEditDesc(item.description)
      setEditQty(String(item.quantity))
    }
  }, [open, item])

  const handleAdd = async () => {
    if (!item || !supplier.trim()) return
    const numPrice = Number(price)
    if (!Number.isFinite(numPrice) || numPrice <= 0) {
      toast({ title: 'Erro', description: 'Preço inválido', variant: 'destructive' })
      return
    }
    try {
      await createQuotation({
        material_shortage_id: item.id,
        supplier: supplier.trim(),
        price: numPrice,
        delivery_days: deliveryDays ? Number(deliveryDays) : undefined,
      })
      setQuotations(await getQuotationsByShortage(item.id))
      setSupplier('')
      setPrice('')
      setDeliveryDays('')
      toast({ title: 'Cotação adicionada' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleSelect = async (qId: string) => {
    if (!item) return
    try {
      await selectQuotation(qId, item.id)
      setQuotations(await getQuotationsByShortage(item.id))
      toast({ title: 'Fornecedor selecionado' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleDelete = async (qId: string) => {
    try {
      await deleteQuotation(qId)
      if (item) setQuotations(await getQuotationsByShortage(item.id))
      toast({ title: 'Cotação removida' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleAdvance = async () => {
    if (!item || !quotations.some((q) => q.selected)) {
      toast({
        title: 'Atenção',
        description: 'Selecione uma cotação primeiro',
        variant: 'destructive',
      })
      return
    }
    try {
      await advanceToCompra(item.id)
      toast({ title: 'Item enviado para Compras' })
      onOpenChange(false)
      onUpdate?.()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleSaveEdit = async () => {
    if (!item) return
    const qty = Number(editQty)
    if (!Number.isFinite(qty) || qty <= 0) {
      toast({ title: 'Erro', description: 'Quantidade inválida', variant: 'destructive' })
      return
    }
    try {
      await updateShortageItem(item.id, { description: editDesc.trim(), quantity: qty })
      toast({ title: 'Item atualizado' })
      setEditing(false)
      onUpdate?.()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleCopy = () => {
    if (!item) return
    navigator.clipboard.writeText(`Item: ${item.description} - Quantidade: ${item.quantity}`)
    toast({ title: 'Copiado!', description: 'Texto copiado para área de transferência.' })
  }

  if (!item) return null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="size-5 text-blue-600" /> Cotações — {item.description}
              <Button size="sm" variant="ghost" className="h-7 ml-auto" onClick={handleCopy}>
                <Copy className="size-3.5 mr-1" /> Copiar
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Código:</span>{' '}
                <span className="font-medium">{item.code || '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                {editing ? (
                  <>
                    <span className="text-muted-foreground">Qtde:</span>
                    <Input
                      type="number"
                      min="1"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value)}
                      className="h-7 w-20 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={handleSaveEdit}
                    >
                      <Save className="size-3.5 text-green-600" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => setEditing(false)}
                    >
                      <X className="size-3.5 text-red-500" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-muted-foreground">Quantidade:</span>
                    <span className="font-medium">{item.quantity}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => setEditing(true)}
                    >
                      <Pencil className="size-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">Descrição:</span>
                <Input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="h-7 text-sm"
                />
              </div>
            )}
            {quotations.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead className="text-center">Prazo (dias)</TableHead>
                      <TableHead className="text-center">Sel.</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotations.map((q) => (
                      <TableRow
                        key={q.id}
                        className={cn(q.selected && 'bg-blue-50 dark:bg-blue-900/20')}
                      >
                        <TableCell className="font-medium text-sm">{q.supplier}</TableCell>
                        <TableCell className="text-right font-semibold text-sm">
                          R$ {Number(q.price).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {q.delivery_days || '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {q.selected ? (
                            <Badge className="bg-blue-600 text-white">Selecionado</Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs"
                              onClick={() => handleSelect(q.id)}
                            >
                              <Check className="size-3 mr-1" /> Selecionar
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-red-500"
                            onClick={() => handleDelete(q.id)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4 border rounded-md">
                Nenhuma cotação registrada ainda.
              </p>
            )}
            <div className="border-t pt-4 space-y-3">
              <Label className="font-semibold">Adicionar Cotação</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Fornecedor</Label>
                  <SupplierSearchSelect
                    value={supplier}
                    onChange={setSupplier}
                    onQuickAdd={() => setQuickSupplierOpen(true)}
                    refreshKey={supplierRefreshKey}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Preço Unit. (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Prazo (dias)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={deliveryDays}
                    onChange={(e) => setDeliveryDays(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <Button size="sm" onClick={handleAdd} disabled={!supplier.trim() || !price}>
                <Plus className="size-4 mr-1" /> Adicionar Cotação
              </Button>
            </div>
            <div className="flex justify-end pt-2 border-t">
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleAdvance}
                disabled={!quotations.some((q) => q.selected)}
              >
                <ShoppingCart className="size-4 mr-2" /> Avançar para Compras
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <SupplierFormDialog
        open={quickSupplierOpen}
        onOpenChange={setQuickSupplierOpen}
        onSaved={(s) => {
          setSupplierRefreshKey((k) => k + 1)
          setSupplier(s.name)
        }}
      />
    </>
  )
}
