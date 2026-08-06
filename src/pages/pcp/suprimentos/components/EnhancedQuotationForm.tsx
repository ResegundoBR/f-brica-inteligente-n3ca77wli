import { useState, useEffect } from 'react'
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, Copy, Check, Loader2, Trash2 } from 'lucide-react'
import { MaterialShortage, Quotation } from '@/types'
import { toast } from 'sonner'
import pb from '@/lib/pocketbase/client'
import { selectQuotation } from '@/services/quotations'
import { SupplierSearch } from './SupplierSearch'
import { SupplierFormDialog } from './SupplierFormDialog'

interface EnhancedQuotationFormProps {
  item: MaterialShortage
  onUpdate: () => void
  onClose: () => void
}

export function EnhancedQuotationForm({ item, onUpdate, onClose }: EnhancedQuotationFormProps) {
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [desc, setDesc] = useState(item.description)
  const [qty, setQty] = useState(String(item.quantity))
  const [supplier, setSupplier] = useState('')
  const [price, setPrice] = useState('')
  const [deliveryDays, setDeliveryDays] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showSupplierForm, setShowSupplierForm] = useState(false)

  const loadQuotations = async () => {
    try {
      const quots = await pb.collection('quotations').getFullList<Quotation>({
        filter: `material_shortage_id = "${item.id}"`,
        sort: 'price',
      })
      setQuotations(quots)
    } catch {
      /* ignored */
    }
  }

  useEffect(() => {
    loadQuotations()
  }, [item.id])

  const handleAddQuotation = async () => {
    if (!supplier.trim() || !price.trim()) {
      toast.error('Preencha fornecedor e preço')
      return
    }
    setSaving(true)
    try {
      await pb.collection('quotations').create({
        material_shortage_id: item.id,
        supplier: supplier.trim(),
        price: parseFloat(price),
        delivery_days: deliveryDays ? parseInt(deliveryDays) : undefined,
        selected: false,
      })
      await loadQuotations()
      setSupplier('')
      setPrice('')
      setDeliveryDays('')
      onUpdate()
      toast.success('Cotação adicionada')
    } catch {
      toast.error('Erro ao adicionar cotação')
    } finally {
      setSaving(false)
    }
  }

  const handleSelectQuotation = async (q: Quotation) => {
    try {
      await selectQuotation(q.id, item.id)
      await loadQuotations()
      onUpdate()
      toast.success('Fornecedor selecionado e dados sincronizados')
    } catch {
      toast.error('Erro ao selecionar')
    }
  }

  const handleDeleteQuotation = async (q: Quotation) => {
    try {
      await pb.collection('quotations').delete(q.id)
      setQuotations((prev) => prev.filter((x) => x.id !== q.id))
      onUpdate()
      toast.success('Cotação removida')
    } catch {
      toast.error('Erro ao remover')
    }
  }

  const handleEditItem = async () => {
    if (desc === item.description && qty === String(item.quantity)) return
    try {
      await pb.collection('material_shortages').update(item.id, {
        description: desc,
        quantity: parseFloat(qty),
      })
      onUpdate()
      toast.success('Item atualizado')
    } catch {
      toast.error('Erro ao atualizar item')
    }
  }

  const handleCopyWhatsApp = () => {
    const text = `Solicitação de Cotação\n\nItem: ${desc}\nQuantidade: ${qty}\n\nFavor informar preço e prazo de entrega.`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Texto copiado para área de transferência')
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Gerenciar Cotações</DialogTitle>
        <DialogDescription>Adicione e compare cotações de fornecedores.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 max-h-[60vh] overflow-y-auto">
        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
          <div className="col-span-2">
            <Label className="text-xs">Descrição</Label>
            <Input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="h-8 text-sm"
              onBlur={handleEditItem}
            />
          </div>
          <div>
            <Label className="text-xs">Quantidade</Label>
            <Input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="h-8 text-sm"
              onBlur={handleEditItem}
            />
          </div>
        </div>
        <div className="space-y-2 p-3 border rounded-lg">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">Fornecedor</Label>
              <SupplierSearch value={supplier} onChange={setSupplier} />
            </div>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => setShowSupplierForm(true)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Preço (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Prazo (dias)</Label>
              <Input
                type="number"
                value={deliveryDays}
                onChange={(e) => setDeliveryDays(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <Button className="w-full" size="sm" onClick={handleAddQuotation} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Adicionar Cotação
          </Button>
        </div>
        {quotations.length > 0 && (
          <div className="space-y-1">
            {quotations.map((q) => (
              <div key={q.id} className="flex items-center gap-2 p-2 border rounded-lg">
                <Button
                  size="sm"
                  variant={q.selected ? 'default' : 'outline'}
                  className="h-6 px-2"
                  onClick={() => handleSelectQuotation(q)}
                >
                  {q.selected && <Check className="w-3 h-3 mr-1" />}
                  {q.selected ? 'Sel.' : 'Sel.'}
                </Button>
                <div className="flex-1">
                  <p className="text-sm font-medium">{q.supplier}</p>
                  <p className="text-xs text-muted-foreground">
                    R$ {q.price.toFixed(2)} • {q.delivery_days || '-'} dias
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => handleDeleteQuotation(q)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <Button variant="outline" className="w-full" onClick={handleCopyWhatsApp}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          Copiar para WhatsApp/E-mail
        </Button>
      </div>
      <SupplierFormDialog
        open={showSupplierForm}
        onOpenChange={setShowSupplierForm}
        onCreated={(name) => setSupplier(name)}
      />
    </>
  )
}
