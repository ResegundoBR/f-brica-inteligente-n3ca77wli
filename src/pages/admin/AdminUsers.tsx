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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  MoreHorizontal,
  Plus,
  Pencil,
  CheckCircle2,
  XCircle,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { useToast } from '@/hooks/use-toast'
import { Role, User } from '@/types'
import { extractFieldErrors, getErrorMessage } from '@/lib/pocketbase/errors'

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
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [showPassword, setShowPassword] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: '',
    password: '',
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

  const loadLogs = async () => {
    try {
      const records = await pb.collection('activity_logs').getFullList({
        filter: "action ~ 'USER_'",
        sort: '-created',
        expand: 'user_id',
      })
      setLogs(records)
    } catch (error) {
      console.error('Failed to load logs:', error)
    } finally {
      setLoadingLogs(false)
    }
  }

  useEffect(() => {
    loadUsers()
    loadRoles()
    loadLogs()
  }, [])

  useRealtime('users', () => {
    loadUsers()
  })

  useRealtime('activity_logs', (e) => {
    if (e.record.action && String(e.record.action).startsWith('USER_')) {
      loadLogs()
    }
  })

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setFieldErrors({})
    setShowPassword(false)
    setFormData({
      name: user.name || '',
      email: user.email,
      role: user.role || '',
      password: '',
      active: user.active ?? true,
      must_change_password: user.must_change_password || false,
      access_start_time: user.access_start_time || '',
      access_end_time: user.access_end_time || '',
      access_days: Array.isArray(user.access_days) ? user.access_days : [],
    })
    setOpen(true)
  }

  const handleSave = async () => {
    setFieldErrors({})

    if (!formData.name.trim()) {
      setFieldErrors((prev) => ({ ...prev, name: 'Nome é obrigatório.' }))
      return
    }

    if (!/^\S+@\S+\.\S+$/.test(formData.email)) {
      setFieldErrors((prev) => ({ ...prev, email: 'Formato de e-mail inválido.' }))
      return
    }

    if (!editingUser && !formData.password) {
      setFieldErrors((prev) => ({ ...prev, password: 'Senha é obrigatória para novos usuários.' }))
      return
    }

    if (formData.password && formData.password.length < 8) {
      setFieldErrors((prev) => ({ ...prev, password: 'A senha deve ter no mínimo 8 caracteres.' }))
      return
    }

    try {
      const payload: any = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        // PocketBase relation fields require null instead of empty string to clear or skip
        role: formData.role || null,
        active: formData.active,
        must_change_password: formData.must_change_password,
        access_start_time: formData.access_start_time || null,
        access_end_time: formData.access_end_time || null,
        access_days: formData.access_days,
        emailVisibility: true,
      }

      if (editingUser) {
        const emailChanged = editingUser.email !== formData.email
        const roleChanged = editingUser.role !== formData.role

        const savedUser = await pb.collection('users').update(editingUser.id, payload)

        if (formData.password) {
          try {
            await pb.send(`/backend/v1/users/${savedUser.id}/password`, {
              method: 'POST',
              body: JSON.stringify({
                password: formData.password,
                must_change_password: formData.must_change_password,
              }),
            })
          } catch (pwError: unknown) {
            console.error('Password update failed', pwError)
            toast({
              title: 'Erro ao atualizar a senha',
              description: getErrorMessage(pwError),
              variant: 'destructive',
            })
          }
        }

        toast({ title: 'Usuário atualizado com sucesso' })

        if (pb.authStore.record?.id) {
          await pb.collection('activity_logs').create({
            user_id: pb.authStore.record.id,
            action: 'USER_UPDATE',
            details: {
              target_user_id: savedUser.id,
              target_user_name: savedUser.name,
              changes: {
                email: emailChanged ? formData.email : undefined,
                role: roleChanged ? formData.role : undefined,
                password: formData.password ? 'updated' : undefined,
              },
            },
          })
        }
      } else {
        if (formData.password) {
          payload.password = formData.password
          payload.passwordConfirm = formData.password
        }

        const savedUser = await pb.collection('users').create(payload)
        toast({ title: 'Usuário criado com sucesso' })

        if (pb.authStore.record?.id) {
          await pb.collection('activity_logs').create({
            user_id: pb.authStore.record.id,
            action: 'USER_CREATE',
            details: {
              target_user_id: savedUser.id,
              target_user_name: savedUser.name,
              email: formData.email,
            },
          })
        }
      }
      setOpen(false)
      setEditingUser(null)
    } catch (error: unknown) {
      const fErrors = extractFieldErrors(error)
      const msg = getErrorMessage(error)

      if (
        fErrors.email &&
        (fErrors.email.includes('already in use') ||
          fErrors.email.includes('invalid or already in use') ||
          fErrors.email.includes('taken') ||
          fErrors.email.includes('Validation'))
      ) {
        fErrors.email = 'Este e-mail já está em uso por outro usuário.'
      }

      setFieldErrors(fErrors)

      // Ensure all field errors are visible to the user if the generic message is confusing
      const errorDetails = Object.entries(fErrors)
        .map(([k, v]) => `${k === 'role' ? 'Função' : k}: ${v}`)
        .join(', ')

      toast({
        title: 'Erro ao salvar',
        description:
          errorDetails ||
          msg ||
          'Não foi possível atualizar o registro. Verifique os dados e tente novamente.',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteUser = async (userToDelete: User) => {
    try {
      await pb.collection('users').delete(userToDelete.id)
      toast({ title: 'Usuário excluído com sucesso' })

      if (pb.authStore.record?.id) {
        await pb.collection('activity_logs').create({
          user_id: pb.authStore.record.id,
          action: 'USER_DELETE',
          details: {
            target_user_id: userToDelete.id,
            target_user_name: userToDelete.name,
            target_user_email: userToDelete.email,
          },
        })
      }
    } catch (error) {
      console.error(error)
      toast({
        title: 'Erro ao excluir',
        description: getErrorMessage(error),
        variant: 'destructive',
      })
    }
  }

  const handleCreateNew = () => {
    setEditingUser(null)
    setFieldErrors({})
    setShowPassword(false)
    setFormData({
      name: '',
      email: '',
      role: '',
      password: '',
      active: true,
      must_change_password: false,
      access_start_time: '',
      access_end_time: '',
      access_days: [],
    })
  }

  return (
    <Tabs defaultValue="users" className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Usuários</h1>
          <p className="text-muted-foreground">Controle de acessos e perfis do sistema.</p>
        </div>
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
          <TabsList>
            <TabsTrigger value="users">Usuários</TabsTrigger>
            <TabsTrigger value="logs">Audit Logs</TabsTrigger>
          </TabsList>

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
                    <Label className={fieldErrors.name ? 'text-destructive' : ''}>
                      Nome Completo *
                    </Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: João da Silva"
                      className={
                        fieldErrors.name ? 'border-destructive focus-visible:ring-destructive' : ''
                      }
                    />
                    {fieldErrors.name && (
                      <p className="text-xs text-destructive">{fieldErrors.name}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className={fieldErrors.email ? 'text-destructive' : ''}>
                      Email corporativo *
                    </Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="joao@fabrica.com"
                      className={
                        fieldErrors.email ? 'border-destructive focus-visible:ring-destructive' : ''
                      }
                    />
                    {fieldErrors.email && (
                      <p className="text-xs text-destructive">{fieldErrors.email}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className={fieldErrors.password ? 'text-destructive' : ''}>
                      Senha {editingUser ? '(deixe em branco para manter)' : '*'}
                    </Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className={
                          fieldErrors.password
                            ? 'border-destructive focus-visible:ring-destructive pr-10'
                            : 'pr-10'
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    {fieldErrors.password && (
                      <p className="text-xs text-destructive">{fieldErrors.password}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className={fieldErrors.role ? 'text-destructive' : ''}>
                      Função / Papel
                    </Label>
                    <Select
                      value={formData.role}
                      onValueChange={(v) => setFormData({ ...formData, role: v })}
                    >
                      <SelectTrigger
                        className={
                          fieldErrors.role ? 'border-destructive focus:ring-destructive' : ''
                        }
                      >
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
                    {fieldErrors.role && (
                      <p className="text-xs text-destructive">{fieldErrors.role}</p>
                    )}
                  </div>
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
                  <Button onClick={handleSave}>
                    {editingUser ? 'Salvar Alterações' : 'Salvar'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <TabsContent value="users" className="mt-0">
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
                        <div className="flex justify-end items-center gap-2">
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

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir permanentemente este usuário? Esta
                                  ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => handleDeleteUser(u)}
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="logs" className="mt-0">
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Alterações de Usuários</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingLogs ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-[120px]" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-[150px]" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-[100px]" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-[250px]" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : !logs || logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                      Nenhum registro de auditoria encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {new Date(log.created).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.expand?.user_id?.name || log.user_id || 'Sistema'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            log.action === 'USER_DELETE'
                              ? 'border-destructive text-destructive'
                              : log.action === 'USER_CREATE'
                                ? 'border-emerald-600 text-emerald-600'
                                : 'border-blue-600 text-blue-600'
                          }
                        >
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.details?.target_user_name && (
                          <span className="font-semibold mr-1">{log.details.target_user_name}</span>
                        )}
                        {log.action === 'USER_DELETE' && 'foi excluído do sistema.'}
                        {log.action === 'USER_CREATE' && 'foi criado.'}
                        {log.action === 'USER_UPDATE' && 'foi atualizado.'}
                        {log.details?.changes && (
                          <span className="text-muted-foreground ml-2">
                            (Alterações:{' '}
                            {Object.keys(log.details.changes)
                              .filter((k) => log.details.changes[k] !== undefined)
                              .join(', ')}
                            )
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
