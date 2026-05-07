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
import { Plus, UserCog } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const loadUsers = async () => {
    try {
      setLoading(true)
      const records = await pb.collection('users').getFullList({
        sort: '-created',
      })
      setUsers(records)
    } catch (error) {
      console.error('Failed to load users:', error)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  useRealtime('users', () => {
    loadUsers()
  })

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Usuários</h1>
          <p className="text-muted-foreground">Controle de acessos e perfis do sistema.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Novo Usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar Novo Usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome Completo *</Label>
                <Input placeholder="Ex: João da Silva" />
              </div>
              <div className="space-y-2">
                <Label>Email corporativo *</Label>
                <Input type="email" placeholder="joao@fabrica.com" />
              </div>
              <div className="space-y-2">
                <Label>Função / Papel</Label>
                <Select defaultValue="Registrador">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Registrador">Registrador</SelectItem>
                    <SelectItem value="Revisador">Revisador</SelectItem>
                    <SelectItem value="Admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-muted p-3 rounded-md text-sm">
                <p className="font-semibold mb-1">Atenção:</p>
                Uma senha temporária será gerada e enviada ao e-mail. No primeiro acesso, o usuário
                deverá criar uma nova senha (mín 8 caracteres, números e letras).
              </div>
              <Button className="w-full" onClick={() => setOpen(false)}>
                Cadastrar Usuário
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
                    <TableCell className="capitalize">{u.role || '-'}</TableCell>
                    <TableCell>
                      {u.verified ? (
                        <Badge className="bg-emerald-600">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary">Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon">
                        <UserCog className="h-4 w-4" />
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
