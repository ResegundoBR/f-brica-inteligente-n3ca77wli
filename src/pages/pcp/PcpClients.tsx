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
    }
  }

  const handleEdit = (client: Client) => {
    setEditClient(client)
    setName(client.name)
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
        await pb.collection('clients').update(editClient.id, { name })
        toast({ title: 'Sucesso', description: 'Cliente atualizado com sucesso.' })
      } else {
        await pb.collection('clients').create({ name })
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
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            Gerencie a lista de clientes para ordens de produção.
          </p>
        </div>
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
              <Button type="submit" className="w-full">
                {editClient ? 'Salvar Alterações' : 'Criar Cliente'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="w-[100px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  Nenhum cliente encontrado.
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell className="text-right">
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
