import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Search } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Product } from '@/types'

export default function ConsultationList() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  const loadProducts = async () => {
    try {
      const records = await pb.collection('products').getFullList<Product>({
        expand: 'status,category',
        sort: 'name',
      })
      setProducts(records)
    } catch (error) {
      console.error('Failed to load products:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])
  useRealtime('products', () => {
    loadProducts()
  })

  const filtered = products.filter(
    (p) =>
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.code?.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold">Consulta Catálogo</h1>
        <p className="text-muted-foreground">
          Visualize produtos e reporte discrepâncias da fábrica.
        </p>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3">Código</TableHead>
                <TableHead className="w-2/3">Nome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-[80px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[200px]" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-center py-6 text-muted-foreground">
                    Nenhum produto encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow
                    key={p.id}
                    onClick={() => navigate(`/consulta/${p.id}`)}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <TableCell className="font-mono text-sm font-semibold text-primary">
                      {p.code || '-'}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                      {p.name}
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
