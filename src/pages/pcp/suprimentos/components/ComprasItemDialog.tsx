import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { SupplierSearchSelect } from './SupplierSearchSelect'
import { SupplierFormDialog } from './SupplierFormDialog'
import { MaterialShortage } from '@/types'
import { toast } from 'sonner'

interface ComprasItemDialogProps {
  item: MaterialShortage | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate?: () => void
}

export function ComprasItemDialog({ item, open, onOpenChange, onUpdate }: ComprasItemDialogProps) {
  const [supplier, setSupplier] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSupplierForm, setShowSupplierForm] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (item) {
      setSupplier(item.supplier || '')
      setUnitPrice(item.unit_price ? String(item.unit_price) : '')
      setExpectedDate(item.expected_date || '')
    }
  }, [item])

  const handleSave = async () => {
    if (!item) return
    setSaving(true)
    try {
      const data: Record<string, unknown> = { supplier: supplier || undefined }
      if (unitPrice) data.unit_price = Number(unitPrice)
      if (expectedDate) data.expected_date = expectedDate
      await pb.collection('material_shortages').update(item.id, data)
      toast.success('Fornecedor atualizado')
      onOpenChange(false)
      onUpdate?.()
    } catch {
      toast.error('Erro ao atualizar fornecedor')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Fornecedor</DialogTitle>
            <DialogDescription>
              {item?.description}
              {item?.code ? ` — ${item.code}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Fornecedor</Label>
              <SupplierSearchSelect
                value={supplier}
                onChange={setSupplier}
                onQuickAdd={() => setShowSupplierForm(true)}
                refreshKey={refreshKey}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Preço Unitário</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Previsão de Entrega</Label>
                <Input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <SupplierFormDialog
        open={showSupplierForm}
        onOpenChange={setShowSupplierForm}
        onCreated={(name) => {
          setSupplier(name)
          setRefreshKey((k) => k + 1)
        }}
      />
    </>
  )
}
