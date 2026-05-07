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
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Plus, Pencil, CheckCircle2, XCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { useToast } from '@/hooks/use-toast'
import { Role, User } from '@/types'

const daysOptions = [
  { label: 'Segunda-feira', value: 1 },
  { label: 'Terça-feira', value: 2 },
  { label: 'Quarta-feira', value: 3 },
  { label: 'Quinta-feira', value: 4 },
  { label: 'Sexta-feira', value: 5 },
  { label: 'Sábado', value: 6 },
  { label: 'Domingo', value: 0 },
]

export default function AdminUsers() {
  const { toast } = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: '',
    active: true,
    must_change_password: false,
    access_start_time: '',
    access_end_time: '',
    access_days: [] as number[],
  })

  const loadUsers = async () => {
    try {
      const records = await pb
        .collection('users')
        .getFullList<User>({ sort: '-created', expand: 'role' })
      setUsers(records)
    } catch (error) {
      console.error('Failed to load users:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadRoles = async () => {
    try {
      const records = await pb.collection('roles').getFullList<Role>({ sort: 'name' })
      setRoles(records)
    } catch (error) {
      console.error('Failed to load roles:', error)
    }
  }

  useEffect(() => {
    loadUsers()
    loadRoles()
  }, [])

  useRealtime('users', () => {
    loadUsers()
  })

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setFormData({
      name: user.name || '',
      email: user.email,
      role: user.role || '',
      active: user.active ?? true,
      must_change_password: user.must_change_password || false,
      access_start_time: user.access_start_time || '',
      access_end_time: user.access_end_time || '',
      access_days: Array.isArray(user.access_days) ? user.access_days : [],
    })
    setOpen(true)
  }

  const handleSave = async () => {
    try {
      if (editingUser) {
        await pb.collection('users').update(editingUser.id, formData)
        toast({ title: 'Usuário atualizado com sucesso' })
      } else {
        await pb.collection('users').create({
          ...formData,
          password: 'Password123!',
          passwordConfirm: 'Password123!',
          must_change_password: true,
        })
        toast({ title: 'Usuário criado com sucesso' })
      }
      setOpen(false)
      setEditingUser(null)
    } catch (error: any) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' })
    }
  }

  const handleCreateNew = () => {
    setEditingUser(null)
    setFormData({
      name: '',
      email: '',
      role: '',
      active: true,
      must_change_password: false,
      access_start_time: '',
      access_end_time: '',
      access_days: [],
    })
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Usuários</h1>
          <p className="text-muted-foreground">Controle de acessos e perfis do sistema.</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(val) => {
            setOpen(val)
            if (!val) setEditingUser(null)
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={handleCreateNew}>
              <Plus className="mr-2 h-4 w-4" /> Novo Usuário
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome Completo *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: João da Silva"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email corporativo *</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="joao@fabrica.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Função / Papel</Label>
                <Select
                  value={formData.role}
                  onValueChange={(v) => setFormData({ ...formData, role: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a função" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4 border p-4 rounded-md bg-muted/20">
                <Label className="text-base font-semibold">
                  Horário e Dias de Acesso (Opcional)
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Hora Inicial</Label>
                    <Input
                      type="time"
                      value={formData.access_start_time}
                      onChange={(e) =>
                        setFormData({ ...formData, access_start_time: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Hora Final</Label>
                    <Input
                      type="time"
                      value={formData.access_end_time}
                      onChange={(e) =>
                        setFormData({ ...formData, access_end_time: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2 pt-2">
                  <Label className="text-sm">Dias Permitidos</Label>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {daysOptions.map((d) => (
                      <div key={d.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`day_${d.value}`}
                          checked={formData.access_days.includes(d.value)}
                          onCheckedChange={(c) => {
                            if (c) {
                              setFormData({
                                ...formData,
                                access_days: [...formData.access_days, d.value],
                              })
                            } else {
                              setFormData({
                                ...formData,
                                access_days: formData.access_days.filter((x) => x !== d.value),
                              })
                            }
                          }}
                        />
                        <Label
                          htmlFor={`day_${d.value}`}
                          className="font-normal text-sm cursor-pointer"
                        >
                          {d.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border p-3 rounded-md">
                <div className="space-y-0.5">
                  <Label>Usuário Ativo</Label>
                  <p className="text-xs text-muted-foreground">
                    Permitir que este usuário acesse o sistema
                  </p>
                </div>
                <Switch
                  checked={formData.active}
                  onCheckedChange={(v) => setFormData({ ...formData, active: v })}
                />
              </div>

              <div className="flex items-center justify-between border p-3 rounded-md">
                <div className="space-y-0.5">
                  <Label>Forçar troca de senha</Label>
                  <p className="text-xs text-muted-foreground">
                    Exigir nova senha no próximo login
                  </p>
                </div>
                <Switch
                  checked={formData.must_change_password}
                  onCheckedChange={(v) => setFormData({ ...formData, must_change_password: v })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave}>{editingUser ? 'Salvar Alterações' : 'Salvar'}</Button>
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
                <TableHead>Email</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-[150px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[200px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[100px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-[60px] rounded-full" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-8 w-8 ml-auto rounded-md" />
                    </TableCell>
                  </TableRow>
                ))
              ) : !users || users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    Nenhum usuário encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name || '-'}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell className="capitalize">{u.expand?.role?.name || '-'}</TableCell>
                    <TableCell>
                      {u.active ? (
                        <Badge className="bg-emerald-600">Ativo</Badge>
                      ) : (
                        <Badge variant="destructive">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(u)}>
                            <Pencil className="mr-2 h-4 w-4" /> Editar Perfil
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              pb.collection('users')
                                .update(u.id, { active: !u.active })
                                .catch(console.error)
                            }}
                          >
                            {u.active ? (
                              <>
                                <XCircle className="mr-2 h-4 w-4" /> Desativar
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="mr-2 h-4 w-4" /> Ativar
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
