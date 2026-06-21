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
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Pencil } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { useToast } from '@/hooks/use-toast'
import { Role } from '@/types'

export default function AdminRoles() {
  const { toast } = useToast()
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    active: true,
    access_dashboard: false,
    access_catalog: false,
    access_learning: false,
    access_users: false,
    access_suprimentos: false,
    access_ordens_producao: false,
    access_visao_comercial: false,
    access_painel_controle: false,
    access_produto_processos: false,
  })

  const loadRoles = async () => {
    try {
      const records = await pb.collection('roles').getFullList<Role>({ sort: 'name' })
      setRoles(records)
    } catch (error) {
      console.error('Failed to load roles:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRoles()
  }, [])
  useRealtime('roles', () => {
    loadRoles()
  })

  const handleEdit = (role: Role) => {
    setEditingRole(role)
    setFormData({
      name: role.name,
      description: role.description || '',
      active: role.active,
      access_dashboard: !!role.access_dashboard,
      access_catalog: !!role.access_catalog,
      access_learning: !!role.access_learning,
      access_users: !!role.access_users,
      access_suprimentos: !!role.access_suprimentos,
      access_ordens_producao: !!role.access_ordens_producao,
      access_visao_comercial: !!role.access_visao_comercial,
      access_painel_controle: !!role.access_painel_controle,
      access_produto_processos: !!role.access_produto_processos,
    })
    setOpen(true)
  }

  const handleSave = async () => {
    try {
      if (editingRole) {
        await pb.collection('roles').update(editingRole.id, formData)
        toast({ title: 'Função atualizada com sucesso' })
      } else {
        await pb.collection('roles').create(formData)
        toast({ title: 'Função criada com sucesso' })
      }
      setOpen(false)
      setEditingRole(null)
    } catch (error: any) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' })
    }
  }

  const handleCreateNew = () => {
    setEditingRole(null)
    setFormData({
      name: '',
      description: '',
      active: true,
      access_dashboard: false,
      access_catalog: false,
      access_learning: false,
      access_users: false,
      access_suprimentos: false,
      access_ordens_producao: false,
      access_visao_comercial: false,
      access_painel_controle: false,
      access_produto_processos: false,
    })
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Funções e Papéis</h1>
          <p className="text-muted-foreground">Gerencie os perfis de acesso do sistema.</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(val) => {
            setOpen(val)
            if (!val) setEditingRole(null)
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={handleCreateNew}>
              <Plus className="mr-2 h-4 w-4" /> Nova Função
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingRole ? 'Editar Função' : 'Cadastrar Função'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome da Função *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Operador Nível 1"
                />
              </div>

              <div className="space-y-3 border p-4 rounded-md bg-muted/20">
                <Label className="text-base font-semibold">Acessos e Permissões (Cascata)</Label>
                <div className="space-y-3 pt-2">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="acc_dash"
                      checked={formData.access_dashboard}
                      onCheckedChange={(c) => setFormData({ ...formData, access_dashboard: !!c })}
                    />
                    <Label htmlFor="acc_dash" className="font-normal text-sm">
                      Dashboard
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="acc_cat"
                      checked={formData.access_catalog}
                      onCheckedChange={(c) => setFormData({ ...formData, access_catalog: !!c })}
                    />
                    <Label htmlFor="acc_cat" className="font-normal text-sm">
                      Catálogo Técnico
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="acc_lear"
                      checked={formData.access_learning}
                      onCheckedChange={(c) => setFormData({ ...formData, access_learning: !!c })}
                    />
                    <Label htmlFor="acc_lear" className="font-normal text-sm">
                      Evolução Aprendizado
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="acc_usr"
                      checked={formData.access_users}
                      onCheckedChange={(c) => setFormData({ ...formData, access_users: !!c })}
                    />
                    <Label htmlFor="acc_usr" className="font-normal text-sm">
                      Gestão de Usuários
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="acc_sup"
                      checked={formData.access_suprimentos}
                      onCheckedChange={(c) => setFormData({ ...formData, access_suprimentos: !!c })}
                    />
                    <Label htmlFor="acc_sup" className="font-normal text-sm">
                      Suprimentos
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="acc_ord"
                      checked={formData.access_ordens_producao}
                      onCheckedChange={(c) =>
                        setFormData({ ...formData, access_ordens_producao: !!c })
                      }
                    />
                    <Label htmlFor="acc_ord" className="font-normal text-sm">
                      Ordens de Produção
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="acc_vis"
                      checked={formData.access_visao_comercial}
                      onCheckedChange={(c) =>
                        setFormData({ ...formData, access_visao_comercial: !!c })
                      }
                    />
                    <Label htmlFor="acc_vis" className="font-normal text-sm">
                      Visão Comercial
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="acc_pan"
                      checked={formData.access_painel_controle}
                      onCheckedChange={(c) =>
                        setFormData({ ...formData, access_painel_controle: !!c })
                      }
                    />
                    <Label htmlFor="acc_pan" className="font-normal text-sm">
                      Painel de Controle
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="acc_prod"
                      checked={formData.access_produto_processos}
                      onCheckedChange={(c) =>
                        setFormData({ ...formData, access_produto_processos: !!c })
                      }
                    />
                    <Label htmlFor="acc_prod" className="font-normal text-sm">
                      Produto / Processos
                    </Label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border p-3 rounded-md">
                <div className="space-y-0.5">
                  <Label>Ativo</Label>
                  <p className="text-xs text-muted-foreground">Permitir uso deste perfil</p>
                </div>
                <Switch
                  checked={formData.active}
                  onCheckedChange={(v) => setFormData({ ...formData, active: v })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave}>
                  {editingRole ? 'Salvar Alterações' : 'Salvar Função'}
                </Button>
              </div>
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
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-[150px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-[60px] rounded-full" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-8 w-8 ml-auto rounded-md" />
                    </TableCell>
                  </TableRow>
                ))
              ) : !roles || roles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                    Nenhuma função encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                roles.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium capitalize">{r.name}</TableCell>
                    <TableCell>
                      {r.active ? (
                        <Badge className="bg-emerald-600">Ativo</Badge>
                      ) : (
                        <Badge variant="destructive">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(r)}>
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
