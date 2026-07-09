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
import { Plus, Trash2, Check, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MaterialShortage, Quotation } from '@/types'
import {
  getQuotationsByShortage,
  createQuotation,
  selectQuotation,
  deleteQuotation,
  advanceToCompra,
} from '@/services/quotations'
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
  const { toast } = useToast()

  useEffect(() => {
    if (open && item) {
      getQuotationsByShortage(item.id)
        .then(setQuotations)
        .catch(() => {})
      setSupplier('')
      setPrice('')
      setDeliveryDays('')
    }
  }, [open, item])

  const handleAdd = async () => {
    if (!item || !supplier.trim()) return
    const numPrice = Number(price)
    const numDays = deliveryDays ? Number(deliveryDays) : undefined
    if (!Number.isFinite(numPrice) || numPrice <= 0) {
      toast({ title: 'Erro', description: 'Preco invalido', variant: 'destructive' })
      return
    }
    try {
      await createQuotation({
        material_shortage_id: item.id,
        supplier: supplier.trim(),
        price: numPrice,
        delivery_days: numDays,
      })
      const refreshed = await getQuotationsByShortage(item.id)
      setQuotations(refreshed)
      setSupplier('')
      setPrice('')
      setDeliveryDays('')
      toast({ title: 'Cotacao adicionada' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleSelect = async (qId: string) => {
    if (!item) return
    try {
      await selectQuotation(qId, item.id)
      const refreshed = await getQuotationsByShortage(item.id)
      setQuotations(refreshed)
      toast({ title: 'Fornecedor selecionado' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleDelete = async (qId: string) => {
    try {
      await deleteQuotation(qId)
      if (item) {
        const refreshed = await getQuotationsByShortage(item.id)
        setQuotations(refreshed)
      }
      toast({ title: 'Cotacao removida' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleAdvance = async () => {
    if (!item) return
    const hasSelected = quotations.some((q) => q.selected)
    if (!hasSelected) {
      toast({
        title: 'Atencao',
        description: 'Selecione uma cotacao primeiro',
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

  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="size-5 text-blue-600" />
            Cotacoes - {item.description}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Codigo:</span>{' '}
              <span className="font-medium">{item.code || '-'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Quantidade:</span>{' '}
              <span className="font-medium">{item.quantity}</span>
            </div>
          </div>

          {quotations.length > 0 ? (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead className="text-right">Preco</TableHead>
                    <TableHead className="text-center">Prazo (dias)</TableHead>
                    <TableHead className="text-center">Sel.</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
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
              Nenhuma cotacao registrada ainda.
            </p>
          )}

          <div className="border-t pt-4 space-y-3">
            <Label className="font-semibold">Adicionar Cotacao</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fornecedor</Label>
                <Input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Nome do fornecedor"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Preco Unit. (R$)</Label>
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
              <Plus className="size-4 mr-1" /> Adicionar Cotacao
            </Button>
          </div>

          <div className="flex justify-end pt-2 border-t">
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleAdvance}
              disabled={!quotations.some((q) => q.selected)}
            >
              <ShoppingCart className="size-4 mr-2" /> Avancar para Compras
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
