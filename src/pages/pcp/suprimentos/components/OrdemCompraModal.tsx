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
import { Plus, Trash2, Loader2 } from 'lucide-react'

export interface OCItemInput {
  description: string
  code?: string
  quantity: number
  unit_price: number
  material_shortage_id?: string
}

interface OrdemCompraModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplierName: string
  initialItems: OCItemInput[]
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

  useEffect(() => {
    if (open) {
      setItems(initialItems)
      setDeliveryTerms('')
      setExpectedDate('')
      setPaymentTerms('')
      setDeliveryType('Entrega')
    }
  }, [open, initialItems])

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const updateCode = (idx: number, code: string) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, code } : it)))

  const updateQty = (idx: number, qty: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: qty } : it)))

  const updatePrice = (idx: number, price: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, unit_price: price } : it)))

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
      },
    ])
    setNewDesc('')
    setNewCode('')
    setNewQty('1')
    setNewPrice('')
  }

  const grandTotal = items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0)

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
                  <TableHead className="w-[100px]">Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[100px]">Qtde</TableHead>
                  <TableHead className="w-[120px]">Vl. Unit.</TableHead>
                  <TableHead className="text-right w-[120px]">Total</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Input
                        className="h-8 w-24"
                        value={item.code || ''}
                        onChange={(e) => updateCode(idx, e.target.value)}
                        placeholder="-"
                      />
                    </TableCell>
                    <TableCell className="text-sm font-medium">{item.description}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="h-8 w-20"
                        value={item.quantity}
                        onChange={(e) => updateQty(idx, Number(e.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 w-28"
                        value={item.unit_price}
                        onChange={(e) => updatePrice(idx, Number(e.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      {formatCurrency(item.quantity * item.unit_price)}
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
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-end gap-2 p-3 border-2 border-dashed rounded-lg">
            <div className="w-24 space-y-1">
              <Label className="text-xs">Código</Label>
              <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="-" />
            </div>
            <div className="flex-1 min-w-[150px] space-y-1">
              <Label className="text-xs">Nova Descrição</Label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Adicionar item..."
              />
            </div>
            <div className="w-20 space-y-1">
              <Label className="text-xs">Qtde</Label>
              <Input type="number" value={newQty} onChange={(e) => setNewQty(e.target.value)} />
            </div>
            <div className="w-28 space-y-1">
              <Label className="text-xs">Vl. Unit.</Label>
              <Input
                type="number"
                step="0.01"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
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
