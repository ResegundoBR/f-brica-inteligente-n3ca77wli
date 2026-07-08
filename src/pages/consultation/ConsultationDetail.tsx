import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Package } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Product, ProductProcessModel } from '@/types'
import { ProcessObservationCard } from './ProcessObservationCard'
import { ConsultationFiles } from './ConsultationFiles'

export default function ConsultationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState<Product | null>(null)
  const [processes, setProcesses] = useState<ProductProcessModel[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    if (!id) return
    try {
      const found = await pb.collection('products').getOne<Product>(id, {
        expand: 'status,owner,category',
      })
      setProduct(found)
      const procs = await pb.collection('product_processes').getFullList<ProductProcessModel>({
        filter: `product_id="${id}"`,
        sort: 'order',
      })
      setProcesses(procs)
    } catch (error) {
      console.error('Failed to load product:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id])
  useRealtime('products', (e) => {
    if (e.action === 'update' && e.record.id === id) loadData()
  })
  useRealtime('product_processes', () => {
    loadData()
  })

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-[300px]" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Produto não encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/consulta')}>
          Voltar
        </Button>
      </div>
    )
  }

  const statusName = product.expand?.status?.name || ''
  const statusLower = statusName.toLowerCase()
  const composition = product.data?.composition || []
  const isPendencia = statusLower.includes('pendência') || statusLower.includes('ajuste')

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate('/consulta')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{product.name}</h1>
            {statusName && (
              <Badge
                className={
                  isPendencia
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : statusLower === 'validado'
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : ''
                }
              >
                {statusName}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            Código: {product.code || 'N/A'}
            {product.expand?.category && ` • Categoria: ${product.expand.category.name}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ConsultationFiles
          files={product.engineering_files || []}
          record={product}
          label="Arquivos de Engenharia"
        />
        <ConsultationFiles
          files={product.composition_files || []}
          record={product}
          label="Arquivos de Composição"
        />
      </div>

      {composition.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" /> Composição ({composition.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">#</TableHead>
                  <TableHead className="w-[100px]">Cód.</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[80px]">Qtd.</TableHead>
                  <TableHead className="w-[100px]">Medida</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {composition.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{item.index || ''}</TableCell>
                    <TableCell className="text-xs font-mono">{item.code || ''}</TableCell>
                    <TableCell className="text-sm">{item.description || ''}</TableCell>
                    <TableCell className="text-sm">{String(item.quantity || '')}</TableCell>
                    <TableCell className="text-sm">{item.measurements || ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Processos de Fabricação</h2>
          <p className="text-sm text-muted-foreground">
            Reporte discrepâncias diretamente do chão de fábrica.
          </p>
        </div>
        {processes.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            Nenhum processo cadastrado para este produto.
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {processes.map((proc) => (
              <ProcessObservationCard key={proc.id} process={proc} productId={product.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
