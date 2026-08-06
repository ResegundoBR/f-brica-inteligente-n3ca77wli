import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MaterialShortage, Quotation } from '@/types'
import { getQuotationsByShortage, selectQuotation } from '@/services/quotations'
import { toast } from 'sonner'
import { Loader2, Save, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import pb from '@/lib/pocketbase/client'

interface ComprasItemDialogProps {
  item: MaterialShortage | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void
}

export function ComprasItemDialog({ item, open, onOpenChange, onUpdate }: ComprasItemDialogProps) {
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedQuotationId, setSelectedQuotationId] = useState('')
  const [supplier, setSupplier] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [expectedDate, setExpectedDate] = useState('')

  const fetchQuotations = useCallback(async () => {
    if (!item) return
    setLoading(true)
    try {
      const res = await getQuotationsByShortage(item.id)
      setQuotations(res)
      const selected = res.find((q) => q.selected)
      setSelectedQuotationId(selected?.id || '')
    } catch {
      /* ignored */
    } finally {
      setLoading(false)
    }
  }, [item])

  useEffect(() => {
    if (open && item) {
      fetchQuotations()
      setSupplier(item.supplier || '')
      setUnitPrice(item.unit_price ? String(item.unit_price) : '')
      setExpectedDate(item.expected_date || '')
    }
  }, [open, item, fetchQuotations])

  const handleSelectQuotation = async (quotationId: string) => {
    if (!item) return
    setSelectedQuotationId(quotationId)
    try {
      const selected = await selectQuotation(quotationId, item.id)
      setSupplier(selected.supplier)
      setUnitPrice(String(selected.price))
      if (selected.delivery_days && selected.delivery_days > 0) {
        const date = new Date(Date.now() + selected.delivery_days * 86400000)
        setExpectedDate(date.toISOString().split('T')[0])
      }
      toast.success('Cotação selecionada e campos preenchidos')
      onUpdate()
    } catch {
      toast.error('Erro ao selecionar cotação')
    }
  }

  const handleSave = async () => {
    if (!item) return
    setSaving(true)
    try {
      await pb.collection('material_shortages').update(item.id, {
        supplier,
        ...(unitPrice && { unit_price: Number(unitPrice) }),
        ...(expectedDate && { expected_date: expectedDate }),
      })
      toast.success('Dados salvos')
      onUpdate()
      onOpenChange(false)
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes da Compra</DialogTitle>
        </DialogHeader>
        {item && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{item.description}</span>
              {item.code && <span className="ml-2">— Código: {item.code}</span>}
              <span className="ml-2">— Qtde: {item.quantity}</span>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Cotações Registradas</h4>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : quotations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center border-2 border-dashed rounded-lg">
                  Nenhuma cotação registrada para este material.
                </p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        <TableHead>Fornecedor</TableHead>
                        <TableHead className="text-right">Valor Unitário</TableHead>
                        <TableHead className="text-right">Prazo (dias)</TableHead>
                        <TableHead className="text-right">Valor Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotations.map((q) => (
                        <TableRow
                          key={q.id}
                          className={cn(
                            'cursor-pointer transition-colors',
                            selectedQuotationId === q.id && 'bg-primary/5',
                          )}
                          onClick={() => handleSelectQuotation(q.id)}
                        >
                          <TableCell>
                            {selectedQuotationId === q.id && (
                              <Check className="w-4 h-4 text-primary" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium text-sm">{q.supplier}</TableCell>
                          <TableCell className="text-right text-sm">
                            {formatCurrency(q.price)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {q.delivery_days || '-'}
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold">
                            {formatCurrency(q.price * (item.quantity || 0))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
              <div className="space-y-1">
                <Label className="text-xs">Fornecedor</Label>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor Unitário</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                />
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
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
