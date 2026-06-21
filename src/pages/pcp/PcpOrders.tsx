import { Fragment, useEffect, useState, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { PcpOrder, Product, Client } from '@/types'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { format, parseISO, isBefore, startOfDay } from 'date-fns'
import { Plus, Paperclip, Clock, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export default function PcpOrders() {
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isClientModalOpen, setIsClientModalOpen] = useState(false)
  const [selectedOp, setSelectedOp] = useState<PcpOrder | null>(null)
  const [newClientName, setNewClientName] = useState('')
  const { toast } = useToast()

  const [orderNumber, setOrderNumber] = useState('')
  const [opType, setOpType] = useState('Linha')
  const [clientId, setClientId] = useState('')
  const [quantity, setQuantity] = useState<number | string>(1)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [productId, setProductId] = useState('')
  const [manualProduct, setManualProduct] = useState('')
  const [annex, setAnnex] = useState<File | null>(null)

  const loadData = async () => {
    try {
      const [ops, prods, clis] = await Promise.all([
        pb
          .collection('pcp_orders')
          .getFullList<PcpOrder>({ sort: '-created', expand: 'product_id,client_id' }),
        pb.collection('products').getFullList<Product>({ sort: 'name', expand: 'status' }),
        pb.collection('clients').getFullList<Client>({ sort: 'name' }),
      ])
      setOrders(ops)
      setProducts(prods)
      setClients(clis)
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

  const groupedOrders = useMemo(() => {
    const groups: { order_number: string; items: PcpOrder[] }[] = []
    const map = new Map<string, PcpOrder[]>()
    orders.forEach((op) => {
      if (!map.has(op.order_number)) {
        map.set(op.order_number, [])
        groups.push({ order_number: op.order_number, items: map.get(op.order_number)! })
      }
      map.get(op.order_number)!.push(op)
    })
    return groups
  }, [orders])

  const today = startOfDay(new Date())

  const isOpDelayed = (op: PcpOrder) => {
    return op.status !== 'Concluído' && isBefore(parseISO(op.delivery_date), today)
  }

  const handleQuickClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const record = await pb.collection('clients').create({ name: newClientName })
      setClients((prev) => [...prev, record].sort((a, b) => a.name.localeCompare(b.name)))
      setClientId(record.id)
      setIsClientModalOpen(false)
      setNewClientName('')
      toast({ title: 'Sucesso', description: 'Cliente adicionado.' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const formData = new FormData()
      formData.append('order_number', orderNumber)

      const selectedClient = clients.find((c) => c.id === clientId)
      if (selectedClient) {
        formData.append('client_name', selectedClient.name)
      }
      formData.append('client_id', clientId)
      formData.append('quantity', quantity.toString())

      formData.append('delivery_date', new Date(deliveryDate).toISOString())
      formData.append('op_type', opType)
      if (opType === 'Linha' && productId) formData.append('product_id', productId)
      if (opType === 'Assistência') formData.append('manual_product_name', manualProduct)
      if (annex) formData.append('annex', annex)
      formData.append('status', 'Fila')
      formData.append('stage', 'Separação no estoque fisico')
      formData.append('bottleneck_reason', 'Nenhum')

      await pb.collection('pcp_orders').create(formData)
      toast({ title: 'Sucesso', description: 'Ordem de Produção criada com sucesso.' })
      setIsOpen(false)

      setOrderNumber('')
      setClientId('')
      setQuantity(1)
      setDeliveryDate('')
      setOpType('Linha')
      setProductId('')
      setManualProduct('')
      setAnnex(null)
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
            <DialogDescription>
              Crie um novo cliente rapidamente para vinculá-lo à OP.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleQuickClientSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                required
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Ex: Indústria Alpha"
              />
            </div>
            <Button type="submit" className="w-full">
              Adicionar
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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
                <Label>Tipo de OP</Label>
                <Select required value={opType} onValueChange={setOpType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Linha">Linha</SelectItem>
                    <SelectItem value="Especial">Especial</SelectItem>
                    <SelectItem value="Assistência">Assistência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Cliente</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setIsClientModalOpen(true)}
                  >
                    <Plus className="mr-1 size-3" />
                    Novo Cliente
                  </Button>
                </div>
                <Select required value={clientId} onValueChange={setClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {opType === 'Assistência' && (
                <div className="space-y-2 my-4">
                  <Label>Produto (Manual)</Label>
                  <Input
                    required
                    value={manualProduct}
                    onChange={(e) => setManualProduct(e.target.value)}
                    placeholder="Nome do produto ou peça..."
                  />
                </div>
              )}
              {opType === 'Linha' && (
                <div className="space-y-2 my-4">
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
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  required
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
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
              <TableHead>Cliente</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Qtd</TableHead>
              <TableHead>Data de Entrega</TableHead>
              <TableHead>Status / Etapa</TableHead>
              <TableHead>Anexo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Nenhuma OP encontrada.
                </TableCell>
              </TableRow>
            ) : (
              groupedOrders.map((group) => (
                <Fragment key={group.order_number}>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell colSpan={6} className="font-semibold text-base py-3">
                      Pedido / OP: {group.order_number}
                    </TableCell>
                  </TableRow>
                  {group.items.map((op) => (
                    <TableRow
                      key={op.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => setSelectedOp(op)}
                    >
                      <TableCell className="pl-6">
                        {op.expand?.client_id?.name || op.client_name}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] px-1.5 h-4 border-transparent text-white',
                              op.op_type === 'Assistência' && 'bg-fuchsia-500 hover:bg-fuchsia-600',
                              op.op_type === 'Especial' &&
                                'bg-slate-900 dark:bg-slate-100 dark:text-slate-900',
                              op.op_type === 'Linha' && 'bg-blue-500 hover:bg-blue-600',
                            )}
                          >
                            {op.op_type}
                          </Badge>
                          <span className="text-sm">
                            {op.op_type === 'Assistência'
                              ? op.manual_product_name
                              : op.op_type === 'Especial'
                                ? 'Produto Especial'
                                : op.expand?.product_id?.name || '-'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{op.quantity}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {format(parseISO(op.delivery_date), 'dd/MM/yyyy')}
                          {isOpDelayed(op) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Clock className="size-4 text-red-500" />
                              </TooltipTrigger>
                              <TooltipContent>Entrega atrasada</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
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
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Paperclip className="mr-1 size-4" /> Ver
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selectedOp} onOpenChange={(val) => !val && setSelectedOp(null)}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhes da OP</SheetTitle>
            <SheetDescription>Pedido: {selectedOp?.order_number}</SheetDescription>
          </SheetHeader>
          {selectedOp && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Cliente</Label>
                  <p className="font-medium text-sm mt-1">
                    {selectedOp.expand?.client_id?.name || selectedOp.client_name}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Produto</Label>
                  <p className="font-medium text-sm mt-1">
                    {selectedOp.op_type === 'Assistência'
                      ? selectedOp.manual_product_name
                      : selectedOp.op_type === 'Especial'
                        ? 'Produto Especial'
                        : selectedOp.expand?.product_id?.name || '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Quantidade</Label>
                  <p className="font-medium text-sm mt-1">{selectedOp.quantity}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Data de Entrega</Label>
                  <p className="font-medium text-sm mt-1 flex items-center gap-2">
                    {format(parseISO(selectedOp.delivery_date), 'dd/MM/yyyy')}
                    {isOpDelayed(selectedOp) && (
                      <span className="text-red-500 text-xs font-bold">(Atrasado)</span>
                    )}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <p className="font-medium text-sm mt-1">{selectedOp.status}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Etapa Atual</Label>
                  <p className="font-medium text-sm mt-1">{selectedOp.stage}</p>
                </div>
                {selectedOp.annex && (
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">Anexo</Label>
                    <div>
                      <a
                        href={pb.files.getURL(selectedOp, selectedOp.annex)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-500 hover:underline flex items-center mt-1 text-sm font-medium"
                      >
                        <Paperclip className="mr-1 size-4" /> Visualizar Documento
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {selectedOp.status === 'Parado' && (
                <div className="bg-red-50 dark:bg-red-950/20 p-4 rounded-md border border-red-200 dark:border-red-900">
                  <h3 className="font-semibold text-red-800 dark:text-red-400 mb-2 flex items-center">
                    <AlertCircle className="size-4 mr-2" /> Gargalo de Produção
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm font-medium text-red-700 dark:text-red-300">
                        Motivo:{' '}
                      </span>
                      <span className="text-sm text-red-600 dark:text-red-200">
                        {selectedOp.bottleneck_reason}
                      </span>
                    </div>
                    {selectedOp.bottleneck_details && (
                      <div>
                        <span className="text-sm font-medium text-red-700 dark:text-red-300">
                          Detalhes:{' '}
                        </span>
                        <span className="text-sm text-red-600 dark:text-red-200 whitespace-pre-wrap">
                          {selectedOp.bottleneck_details}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
