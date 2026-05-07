import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { useToast } from '@/hooks/use-toast'
import { ProductStatusModel } from '@/types'

export default function AdminStatuses() {
  const { toast } = useToast()
  const [statuses, setStatuses] = useState<ProductStatusModel[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingStatus, setEditingStatus] = useState<ProductStatusModel | null>(null)

  const [formData, setFormData] = useState({ name: '', color: 'default', active: true })

  const loadStatuses = async () => {
    try {
      const records = await pb
        .collection('product_statuses')
        .getFullList<ProductStatusModel>({ sort: 'name' })
      setStatuses(records)
    } catch (error) {
      console.error('Failed to load statuses:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatuses()
  }, [])
  useRealtime('product_statuses', () => {
    loadStatuses()
  })

  const handleEdit = (status: ProductStatusModel) => {
    setEditingStatus(status)
    setFormData({ name: status.name, color: status.color, active: status.active })
    setOpen(true)
  }

  const handleSave = async () => {
    try {
      if (editingStatus) {
        await pb.collection('product_statuses').update(editingStatus.id, formData)
        toast({ title: 'Status atualizado com sucesso' })
      } else {
        await pb.collection('product_statuses').create(formData)
        toast({ title: 'Status criado com sucesso' })
      }
      setOpen(false)
      setEditingStatus(null)
    } catch (error: any) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Status de Produtos</h1>
          <p className="text-muted-foreground">Configure as etapas do fluxo do catálogo.</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(val) => {
            setOpen(val)
            if (!val) setEditingStatus(null)
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => setFormData({ name: '', color: 'default', active: true })}>
              <Plus className="mr-2 h-4 w-4" /> Novo Status
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingStatus ? 'Editar Status' : 'Cadastrar Status'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome do Status *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: revisão"
                />
              </div>
              <div className="space-y-2">
                <Label>Cor da Badge (UI)</Label>
                <Select
                  value={formData.color}
                  onValueChange={(v) => setFormData({ ...formData, color: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma cor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Padrão (Primária)</SelectItem>
                    <SelectItem value="secondary">Secundária (Cinza)</SelectItem>
                    <SelectItem value="destructive">Destrutiva (Vermelho)</SelectItem>
                    <SelectItem value="outline">Contorno (Bordada)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between border p-3 rounded-md">
                <div className="space-y-0.5">
                  <Label>Ativo</Label>
                  <p className="text-xs text-muted-foreground">Permitir uso deste status</p>
                </div>
                <Switch
                  checked={formData.active}
                  onCheckedChange={(v) => setFormData({ ...formData, active: v })}
                />
              </div>

              <Button className="w-full" onClick={handleSave}>
                {editingStatus ? 'Salvar Alterações' : 'Criar Status'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Exemplo Visual</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-[150px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-[80px] rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-[60px] rounded-full" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-8 w-8 ml-auto rounded-md" />
                    </TableCell>
                  </TableRow>
                ))
              ) : !statuses || statuses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                    Nenhum status encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                statuses.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium capitalize">{s.name}</TableCell>
                    <TableCell>
                      <Badge variant={s.color as any}>{s.name}</Badge>
                    </TableCell>
                    <TableCell>
                      {s.active ? (
                        <Badge className="bg-emerald-600">Ativo</Badge>
                      ) : (
                        <Badge variant="destructive">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
