import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Plus, Trash2, Loader2, Link2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { MaterialShortage } from '@/types'
import { findOtherOpDemands } from '@/services/material-consolidation'

export interface OCItemInput {
  description: string
  code?: string
  quantity: number
  unit_price: number
  st_value?: number
  ipi_value?: number
  material_shortage_id?: string
  suggestedTotal?: number
  otherOpsCount?: number
  otherOpsExtraQty?: number
}

interface OrdemCompraModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplierName: string
  initialItems: OCItemInput[]
  allShortages?: MaterialShortage[]
  onConfirm: (
    items: OCItemInput[],
    deliveryTerms: string,
    expectedDate: string,
    paymentTerms: string,
    deliveryType: string,
  ) => Promise<void>
}

export function OrdemCompraModal({
  open,
  onOpenChange,
  supplierName,
  initialItems,
  allShortages = [],
  onConfirm,
}: OrdemCompraModalProps) {
  const [items, setItems] = useState<OCItemInput[]>(initialItems)
  const [deliveryTerms, setDeliveryTerms] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [deliveryType, setDeliveryType] = useState('Entrega')
  const [saving, setSaving] = useState(false)
  const [newDesc, setNewDesc] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newQty, setNewQty] = useState('1')
  const [newPrice, setNewPrice] = useState('')
  const [newSt, setNewSt] = useState('')
  const [newIpi, setNewIpi] = useState('')

  useEffect(() => {
    if (open) {
      // Calcula consolidação para cada item da OC com base em allShortages
      const enriched = initialItems.map((it) => {
        if (!it.material_shortage_id || allShortages.length === 0) return it
        const originalShortage = allShortages.find((s) => s.id === it.material_shortage_id)
        if (!originalShortage) return it
        const consolidation = findOtherOpDemands(originalShortage, allShortages)
        if (consolidation.otherDemands.length > 0) {
          return {
            ...it,
            suggestedTotal: consolidation.totalConsolidatedQuantity,
            otherOpsCount: consolidation.otherDemands.length,
            otherOpsExtraQty: consolidation.totalOtherQuantity,
          }
        }
        return it
      })

      setItems(enriched)
      setDeliveryTerms('')
      setExpectedDate('')
      setPaymentTerms('')
      setDeliveryType('Entrega')
    }
  }, [open, initialItems, allShortages])

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const updateCode = (idx: number, code: string) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, code } : it)))

  const updateQty = (idx: number, qty: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: qty } : it)))

  const updatePrice = (idx: number, price: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, unit_price: price } : it)))

  const updateSt = (idx: number, st: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, st_value: st } : it)))

  const updateIpi = (idx: number, ipi: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ipi_value: ipi } : it)))

  const applySuggestedTotal = (idx: number, suggestedQty: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: suggestedQty } : it)))

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx))

  const handleAddItem = () => {
    if (!newDesc.trim()) return
    setItems((prev) => [
      ...prev,
      {
        description: newDesc.trim(),
        ...(newCode.trim() && { code: newCode.trim() }),
        quantity: Number(newQty) || 1,
        unit_price: Number(newPrice) || 0,
        st_value: Number(newSt) || 0,
        ipi_value: Number(newIpi) || 0,
      },
    ])
    setNewDesc('')
    setNewCode('')
    setNewQty('1')
    setNewPrice('')
    setNewSt('')
    setNewIpi('')
  }

  const getItemTotal = (it: OCItemInput) =>
    it.quantity * it.unit_price + (Number(it.st_value) || 0) + (Number(it.ipi_value) || 0)

  const grandTotal = items.reduce((sum, it) => sum + getItemTotal(it), 0)

  const handleConfirm = async () => {
    setSaving(true)
    try {
      await onConfirm(items, deliveryTerms, expectedDate, paymentTerms, deliveryType)
      onOpenChange(false)
    } catch {
      /* handled by parent */
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar Ordem de Compra</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Fornecedor</Label>
              <p className="font-semibold">{supplierName}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Previsão de Entrega</Label>
              <Input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Condições de Pagamento</Label>
              <Input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Ex.: À vista, 30 dias..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Entrega / Retira</Label>
              <Select value={deliveryType} onValueChange={setDeliveryType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Entrega">Entrega</SelectItem>
                  <SelectItem value="Retira">Retira</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[80px]">Qtde</TableHead>
                  <TableHead className="w-[105px]">Vl. Unit.</TableHead>
                  <TableHead className="w-[95px]">ST</TableHead>
                  <TableHead className="w-[95px]">IPI</TableHead>
                  <TableHead className="text-right w-[115px]">Total</TableHead>
                  <TableHead className="w-[36px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => {
                  const hasSuggestion =
                    item.suggestedTotal != null &&
                    item.suggestedTotal > item.quantity &&
                    (item.otherOpsCount || 0) > 0

                  return (
                    <TableRow
                      key={idx}
                      className={hasSuggestion ? 'bg-amber-50/40 dark:bg-amber-950/20' : undefined}
                    >
                      <TableCell>
                        <Input
                          className="h-8 w-20"
                          value={item.code || ''}
                          onChange={(e) => updateCode(idx, e.target.value)}
                          placeholder="-"
                        />
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        <div>
                          <span>{item.description}</span>
                          {hasSuggestion && (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200"
                              >
                                <Link2 className="size-3 mr-1" />+{item.otherOpsExtraQty} un em{' '}
                                {item.otherOpsCount} outra(s) OP(s)
                              </Badge>
                              <button
                                type="button"
                                onClick={() => applySuggestedTotal(idx, item.suggestedTotal!)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800 underline dark:text-amber-300"
                              >
                                <Sparkles className="size-3" />
                                Sugerir total: adotar {item.suggestedTotal} un
                              </button>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8 w-16"
                          value={item.quantity}
                          onChange={(e) => updateQty(idx, Number(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 w-24"
                          value={item.unit_price}
                          onChange={(e) => updatePrice(idx, Number(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 w-20"
                          value={item.st_value ?? ''}
                          placeholder="0,00"
                          onChange={(e) => updateSt(idx, Number(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 w-20"
                          value={item.ipi_value ?? ''}
                          placeholder="0,00"
                          onChange={(e) => updateIpi(idx, Number(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        {formatCurrency(getItemTotal(item))}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => removeItem(idx)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-end gap-2 p-3 border-2 border-dashed rounded-lg">
            <div className="w-20 space-y-1">
              <Label className="text-xs">Código</Label>
              <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="-" />
            </div>
            <div className="flex-1 min-w-[140px] space-y-1">
              <Label className="text-xs">Nova Descrição</Label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Adicionar item..."
              />
            </div>
            <div className="w-16 space-y-1">
              <Label className="text-xs">Qtde</Label>
              <Input type="number" value={newQty} onChange={(e) => setNewQty(e.target.value)} />
            </div>
            <div className="w-24 space-y-1">
              <Label className="text-xs">Vl. Unit.</Label>
              <Input
                type="number"
                step="0.01"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="w-20 space-y-1">
              <Label className="text-xs">ST</Label>
              <Input
                type="number"
                step="0.01"
                value={newSt}
                onChange={(e) => setNewSt(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="w-20 space-y-1">
              <Label className="text-xs">IPI</Label>
              <Input
                type="number"
                step="0.01"
                value={newIpi}
                onChange={(e) => setNewIpi(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleAddItem}>
              <Plus className="w-4 h-4" /> Adicionar
            </Button>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Condições de Entrega</Label>
            <Textarea
              value={deliveryTerms}
              onChange={(e) => setDeliveryTerms(e.target.value)}
              placeholder="Condições de pagamento, frete, etc."
              rows={2}
            />
          </div>

          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-sm text-muted-foreground">Total Geral</span>
            <span className="text-xl font-bold">{formatCurrency(grandTotal)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={saving || items.length === 0}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirmar OC
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
