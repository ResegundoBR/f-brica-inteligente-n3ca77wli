import { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { PcpOrder, Product } from '@/types'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { format, parseISO } from 'date-fns'
import { Plus, Paperclip } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function PcpOrders() {
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const { toast } = useToast()

  const [orderNumber, setOrderNumber] = useState('')
  const [clientName, setClientName] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [isSpecial, setIsSpecial] = useState(false)
  const [productId, setProductId] = useState('')
  const [annex, setAnnex] = useState<File | null>(null)

  const loadData = async () => {
    try {
      const [ops, prods] = await Promise.all([
        pb
          .collection('pcp_orders')
          .getFullList<PcpOrder>({ sort: '-created', expand: 'product_id' }),
        pb.collection('products').getFullList<Product>({ sort: 'name' }),
      ])
      setOrders(ops)
      setProducts(prods)
    } catch {
      /* intentionally ignored */
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useRealtime('pcp_orders', () => {
    loadData()
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const formData = new FormData()
      formData.append('order_number', orderNumber)
      formData.append('client_name', clientName)
      formData.append('delivery_date', new Date(deliveryDate).toISOString())
      formData.append('is_special', isSpecial ? 'true' : 'false')
      if (!isSpecial && productId) formData.append('product_id', productId)
      if (annex) formData.append('annex', annex)
      formData.append('status', 'Fila')
      formData.append('stage', 'Corte')
      formData.append('bottleneck_reason', 'Nenhum')

      await pb.collection('pcp_orders').create(formData)
      toast({ title: 'Sucesso', description: 'Ordem de Produção criada com sucesso.' })
      setIsOpen(false)

      setOrderNumber('')
      setClientName('')
      setDeliveryDate('')
      setIsSpecial(false)
      setProductId('')
      setAnnex(null)
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ordens de Produção</h1>
          <p className="text-muted-foreground">Gerencie as OPs e integre documentos externos.</p>
        </div>
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button>
              <Plus className="mr-2 size-4" /> Nova OP
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Criar Ordem de Produção</SheetTitle>
              <SheetDescription>
                Preencha os dados ou anexe o documento do sistema externo.
              </SheetDescription>
            </SheetHeader>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label>Número da OP</Label>
                <Input
                  required
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="Ex: OP-2026-100"
                />
              </div>
              <div className="space-y-2">
                <Label>Nome do Cliente</Label>
                <Input
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Data de Entrega</Label>
                <Input
                  type="date"
                  required
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </div>
              <div className="flex items-center space-x-2 my-4">
                <Checkbox
                  id="special"
                  checked={isSpecial}
                  onCheckedChange={(c) => setIsSpecial(c as boolean)}
                />
                <Label htmlFor="special">Item Especial (Sob Medida)</Label>
              </div>
              {!isSpecial && (
                <div className="space-y-2">
                  <Label>Produto</Label>
                  <Select required value={productId} onValueChange={setProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Anexo (PDF/Imagem)</Label>
                <Input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setAnnex(e.target.files?.[0] || null)}
                />
              </div>
              <Button type="submit" className="w-full mt-4">
                Salvar OP
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Data de Entrega</TableHead>
              <TableHead>Status / Etapa</TableHead>
              <TableHead>Anexo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Nenhuma OP encontrada.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((op) => (
                <TableRow key={op.id}>
                  <TableCell className="font-medium">{op.order_number}</TableCell>
                  <TableCell>{op.client_name}</TableCell>
                  <TableCell>
                    {op.is_special ? (
                      <Badge variant="secondary">Especial</Badge>
                    ) : (
                      op.expand?.product_id?.name
                    )}
                  </TableCell>
                  <TableCell>{format(parseISO(op.delivery_date), 'dd/MM/yyyy')}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">{op.status}</span>
                      <span className="text-xs text-muted-foreground">{op.stage}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {op.annex && (
                      <a
                        href={pb.files.getURL(op, op.annex)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-500 hover:underline flex items-center"
                      >
                        <Paperclip className="mr-1 size-4" /> Ver
                      </a>
                    )}
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
