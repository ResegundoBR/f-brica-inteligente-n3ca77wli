import { useState } from 'react'
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
import { createSupplier } from '@/services/suppliers'
import { toast } from 'sonner'

interface SupplierFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (name: string) => void
  onSaved?: (supplier: any) => void
}

export function SupplierFormDialog({
  open,
  onOpenChange,
  onCreated,
  onSaved,
}: SupplierFormDialogProps) {
  const [form, setForm] = useState({
    name: '',
    contact_name: '',
    email: '',
    phone: '',
    whatsapp: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    setSaving(true)
    try {
      const created = await createSupplier(form)
      toast.success('Fornecedor cadastrado')
      onCreated?.(form.name)
      onSaved?.(created)
      setForm({ name: '', contact_name: '', email: '', phone: '', whatsapp: '' })
      onOpenChange(false)
    } catch {
      toast.error('Erro ao cadastrar fornecedor')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Fornecedor</DialogTitle>
          <DialogDescription>Cadastre um fornecedor rapidamente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Contato</Label>
            <Input
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              className="h-9 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">WhatsApp</Label>
            <Input
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              className="h-9 text-sm"
            />
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Cadastrar Fornecedor
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
