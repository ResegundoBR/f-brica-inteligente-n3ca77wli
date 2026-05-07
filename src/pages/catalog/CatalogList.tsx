import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useApp } from '@/contexts/app-context'
import { ProductStatus } from '@/types'

export function StatusBadge({ status }: { status: ProductStatus }) {
  const variantMap: Record<ProductStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    Iniciado: 'secondary',
    Revisão: 'default',
    Validado: 'outline',
    Pendência: 'destructive',
  }
  return <Badge variant={variantMap[status]}>{status}</Badge>
}

export default function CatalogList() {
  const { products } = useApp()
  const navigate = useNavigate()

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catálogo Técnico</h1>
          <p className="text-muted-foreground">Gerencie o cadastro de produtos e especificações.</p>
        </div>
        <Button onClick={() => navigate('/catalogo/novo')}>
          <Plus className="mr-2 h-4 w-4" /> Novo Cadastro
        </Button>
      </div>

      <Card>
        <CardHeader className="py-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por código ou nome..." className="pl-9" />
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
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.id}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell>{p.lastUpdate}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/catalogo/${p.id}`}>Editar</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
