import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Product, ProductStatusModel } from '@/types'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { useAuth } from '@/hooks/use-auth'

export function StatusBadge({ status }: { status?: ProductStatusModel | string }) {
  if (!status) return <Badge variant="secondary">Desconhecido</Badge>

  const statusName = typeof status === 'string' ? status : status.name
  const nameLower = statusName.toLowerCase()

  if (nameLower === 'iniciado') {
    return (
      <Badge className="bg-orange-500 hover:bg-orange-600 text-white border-transparent">
        {statusName}
      </Badge>
    )
  }
  if (nameLower === 'validado') {
    return (
      <Badge className="bg-green-600 hover:bg-green-700 text-white border-transparent">
        {statusName}
      </Badge>
    )
  }

  if (typeof status === 'string') {
    return <Badge variant="secondary">{status}</Badge>
  }

  if (status.color && status.color.startsWith('bg-')) {
    return <Badge className={status.color}>{status.name}</Badge>
  }

  if (status.color === 'warning')
    return (
      <Badge className="bg-orange-500 hover:bg-orange-600 text-white border-transparent">
        {status.name}
      </Badge>
    )
  if (status.color === 'success')
    return (
      <Badge className="bg-green-600 hover:bg-green-700 text-white border-transparent">
        {status.name}
      </Badge>
    )

  const color = status.color || 'secondary'
  const variant = ['default', 'secondary', 'destructive', 'outline'].includes(color)
    ? (color as any)
    : 'secondary'

  return <Badge variant={variant}>{status.name}</Badge>
}

export default function CatalogList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')

  const loadData = async () => {
    try {
      const records = await pb.collection('products').getFullList<Product>({
        sort: '-updated',
        expand: 'status',
      })
      setProducts(records)
    } catch {
      /* intentionally ignored */
    }
  }

  useEffect(() => {
    loadData()
  }, [])
  useRealtime('products', () => {
    loadData()
  })

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      p.code?.toLowerCase().includes(search.toLowerCase()),
  )

  const role = user?.expand?.role
  const isSuperAdmin =
    role?.name?.toLowerCase() === 'admin' || role?.name?.toLowerCase() === 'administrador'
  const canCreate = isSuperAdmin || !!role?.access_catalog || !role

  const handleDelete = async (id: string) => {
    try {
      await pb.collection('products').delete(id)
      toast.success('Produto excluído com sucesso.')
    } catch (error) {
      toast.error('Erro ao excluir o produto.')
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catálogo Técnico</h1>
          <p className="text-muted-foreground">Gerencie o cadastro de produtos e especificações.</p>
        </div>
        {canCreate && (
          <Button onClick={() => navigate('/catalogo/novo')}>
            <Plus className="mr-2 h-4 w-4" /> Novo Cadastro
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="py-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por código ou nome..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome do Produto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Última Att.</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    Nenhum produto encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.code || p.id}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <StatusBadge status={p.expand?.status || p.status} />
                    </TableCell>
                    <TableCell>{new Date(p.updated).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/catalogo/${p.id}`}>Editar</Link>
                        </Button>
                        {canCreate && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Deseja realmente excluir este produto? Esta ação não pode ser
                                  desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => handleDelete(p.id)}
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
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
