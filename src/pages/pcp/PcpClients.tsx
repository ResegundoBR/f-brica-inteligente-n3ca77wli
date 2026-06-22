import { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { Client } from '@/types'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { extractFieldErrors } from '@/lib/pocketbase/errors'

export default function PcpClients() {
  const [clients, setClients] = useState<Client[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState('B2B')
  const [typeFilter, setTypeFilter] = useState('all')
  const { toast } = useToast()

  const loadClients = async () => {
    try {
      const records = await pb.collection('clients').getFullList<Client>({ sort: 'name' })
      setClients(records)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadClients()
  }, [])

  useRealtime('clients', () => {
    loadClients()
  })

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      setEditClient(null)
      setName('')
      setType('B2B')
    }
  }

  const handleEdit = (client: Client) => {
    setEditClient(client)
    setName(client.name)
    setType(client.type || 'B2B')
    setIsOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este cliente?')) return
    try {
      await pb.collection('clients').delete(id)
      toast({ title: 'Sucesso', description: 'Cliente removido com sucesso.' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editClient) {
        await pb.collection('clients').update(editClient.id, { name, type })
        toast({ title: 'Sucesso', description: 'Cliente atualizado com sucesso.' })
      } else {
        await pb.collection('clients').create({ name, type })
        toast({ title: 'Sucesso', description: 'Cliente criado com sucesso.' })
      }
      handleOpenChange(false)
    } catch (err: any) {
      const errors = extractFieldErrors(err)
      toast({
        title: 'Erro ao salvar',
        description: errors.name || err.message,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            Gerencie a lista de clientes para ordens de produção.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] bg-background">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="B2B">B2B</SelectItem>
              <SelectItem value="B2C">B2C</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 size-4" /> Novo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editClient ? 'Editar Cliente' : 'Criar Cliente'}</DialogTitle>
                <DialogDescription>Preencha os dados do cliente abaixo.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Cliente</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Ex: Indústria XYZ"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Tipo de Cliente</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="B2B">B2B</SelectItem>
                      <SelectItem value="B2C">B2C</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full">
                  {editClient ? 'Salvar Alterações' : 'Criar Cliente'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="w-[100px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.filter((c) => typeFilter === 'all' || c.type === typeFilter).length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Nenhum cliente encontrado.
                </TableCell>
              </TableRow>
            ) : (
              clients
                .filter((c) => typeFilter === 'all' || c.type === typeFilter)
                .map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium py-2">{client.name}</TableCell>
                    <TableCell className="py-2">
                      {client.type && (
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {client.type}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right py-2">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(client)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(client.id)}>
                          <Trash2 className="size-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
