import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MaterialShortage, PcpOrder } from '@/types'
import { Package, CheckCircle, ShoppingCart, Truck, AlertCircle } from 'lucide-react'
import { format, isBefore, startOfDay } from 'date-fns'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export default function PcpMaterials() {
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [outsourcedOrders, setOutsourcedOrders] = useState<PcpOrder[]>([])
  const { toast } = useToast()

  const fetchShortages = async () => {
    try {
      const res = await pb.collection('material_shortages').getFullList<MaterialShortage>({
        sort: '-created',
        expand: 'order_id,order_id.product_id',
      })
      setShortages(res)
    } catch (err) {
      /* ignored */
    }
  }

  const fetchOutsourcedOrders = async () => {
    try {
      const res = await pb.collection('pcp_orders').getFullList<PcpOrder>({
        filter: 'stage = "Terceirização"',
        sort: 'delivery_date',
        expand: 'product_id,client_id',
      })
      setOutsourcedOrders(res)
    } catch (err) {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchShortages()
    fetchOutsourcedOrders()
  }, [])

  useRealtime('material_shortages', fetchShortages)
  useRealtime('pcp_orders', fetchOutsourcedOrders)

  const handleConfirmOutsourcingReceipt = async (op: PcpOrder) => {
    try {
      await pb.collection('pcp_orders').update(op.id, {
        stage: 'Preparação',
        status: 'Em Andamento',
      })

      const userId = pb.authStore.isValid ? pb.authStore.record?.id : undefined
      if (userId) {
        await pb.collection('pcp_order_logs').create({
          order_id: op.id,
          user_id: userId,
          action: 'Recebimento de Terceirização',
          stage: 'Preparação',
          details: 'Material recebido da terceirização e OP movida para Preparação.',
        })
      }

      toast({ title: 'Recebimento confirmado', description: 'A OP foi movida para Preparação.' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      await pb.collection('material_shortages').update(id, { status: newStatus })
      toast({ title: 'Status atualizado com sucesso' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleGroupUpdate = async (
    group: any,
    updates: { status: string; supplier: string; expected_date: string },
  ) => {
    try {
      await Promise.all(
        group.items.map((item: any) =>
          pb.collection('material_shortages').update(item.id, {
            status: updates.status,
            supplier: updates.supplier,
            expected_date: updates.expected_date,
          }),
        ),
      )
      toast({ title: 'Grupo atualizado com sucesso' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const triagemItems = shortages.filter((s) => s.status === 'Pendente')
  const comprasItems = shortages.filter((s) => s.status === 'Cotação' || s.status === 'Compra')
  const historicoItems = shortages.filter(
    (s) => s.status === 'Recebido' || s.status === 'Liberado_Estoque' || s.status === 'Cancelado',
  )

  const groupedCompras = useMemo(() => {
    const groups: Record<
      string,
      {
        description: string
        code: string
        priority: string
        totalQuantity: number
        items: MaterialShortage[]
        status: string
        supplier: string
        expected_date: string
      }
    > = {}
    comprasItems.forEach((item) => {
      const key = `${item.code}-${item.description}-${item.priority || 'Sem pressa'}`
      if (!groups[key]) {
        groups[key] = {
          description: item.description,
          code: item.code,
          priority: item.priority || 'Sem pressa',
          totalQuantity: 0,
          items: [],
          status: item.status,
          supplier: item.supplier || '',
          expected_date: item.expected_date || '',
        }
      }
      groups[key].totalQuantity += item.quantity
      groups[key].items.push(item)
      if (item.status === 'Compra') groups[key].status = 'Compra'
      if (item.supplier) groups[key].supplier = item.supplier
      if (item.expected_date) groups[key].expected_date = item.expected_date
    })
    return Object.values(groups)
  }, [comprasItems])

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-3">
          <Package className="size-8 text-blue-600" /> Gestão de Faltas e Materiais
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 mt-1">
          Triagem de solicitações da fábrica, compras e recebimento.
        </p>
      </div>

      <Tabs defaultValue="triagem" className="w-full">
        <TabsList className="grid w-full max-w-4xl grid-cols-1 sm:grid-cols-4 mb-6 h-auto sm:h-12">
          <TabsTrigger value="triagem" className="text-base py-2">
            Triagem ({triagemItems.length})
          </TabsTrigger>
          <TabsTrigger value="compras" className="text-base py-2">
            Compras ({groupedCompras.length})
          </TabsTrigger>
          <TabsTrigger value="terceirizacao" className="text-base py-2">
            Terceirização ({outsourcedOrders.length})
          </TabsTrigger>
          <TabsTrigger value="historico" className="text-base py-2">
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="triagem" className="space-y-4">
          {triagemItems.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
              Nenhuma solicitação de material pendente.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {triagemItems.map((item) => (
                <Card
                  key={item.id}
                  className={cn(
                    'border-l-4 flex flex-col shadow-sm bg-white dark:bg-slate-900',
                    item.priority === 'Urgente'
                      ? 'border-l-red-500'
                      : item.priority === 'Próximos dias'
                        ? 'border-l-yellow-500'
                        : 'border-l-blue-500',
                  )}
                >
                  <div className="p-3 space-y-2 flex-1">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h3 className="font-semibold leading-tight text-sm text-slate-800 dark:text-slate-200">
                          {item.description}
                        </h3>
                        <div className="flex gap-2 items-center mt-1">
                          <p className="text-[11px] text-muted-foreground font-medium">
                            Cód: {item.code || '-'}
                          </p>
                          {item.priority && (
                            <Badge
                              variant={item.priority === 'Urgente' ? 'destructive' : 'secondary'}
                              className="text-[9px] px-1 py-0 h-4"
                            >
                              {item.priority}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className="font-bold text-xs bg-slate-100 dark:bg-slate-800"
                      >
                        {item.quantity} un
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded border border-slate-100 dark:border-slate-800">
                        <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider mb-0.5">
                          Origem
                        </span>
                        {item.order_id && item.expand?.order_id?.order_number ? (
                          <span className="font-semibold text-blue-600 dark:text-blue-400 truncate block">
                            OP: {item.expand.order_id.order_number}
                          </span>
                        ) : (
                          <span className="font-semibold text-indigo-600 dark:text-indigo-400 truncate block flex items-center gap-1">
                            <AlertCircle className="size-3" /> Req. Geral
                          </span>
                        )}
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded border border-slate-100 dark:border-slate-800">
                        <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider mb-0.5">
                          Setor/Tipo
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate block">
                          {item.request_type || item.sector}
                        </span>
                      </div>
                    </div>

                    {item.observation && (
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 bg-yellow-50/50 dark:bg-yellow-900/10 p-1.5 rounded border border-yellow-100 dark:border-yellow-900/30">
                        <span className="font-semibold text-yellow-700 dark:text-yellow-500">
                          Obs:
                        </span>{' '}
                        {item.observation}
                      </div>
                    )}
                  </div>
                  <div className="p-2 border-t border-slate-100 dark:border-slate-800 flex gap-2 bg-slate-50/50 dark:bg-slate-900/50">
                    <Button
                      variant="outline"
                      className="flex-1 h-8 text-[11px] px-2 bg-white dark:bg-slate-950"
                      onClick={() => handleUpdateStatus(item.id, 'Liberado_Estoque')}
                    >
                      <CheckCircle className="size-3 mr-1.5 text-green-600" /> No Estoque
                    </Button>
                    <Button
                      className="flex-1 bg-blue-600 hover:bg-blue-700 h-8 text-white text-[11px] px-2 shadow-sm"
                      onClick={() => handleUpdateStatus(item.id, 'Cotação')}
                    >
                      <ShoppingCart className="size-3 mr-1.5" /> Comprar
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="compras" className="space-y-4">
          {groupedCompras.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
              Nenhum material pendente de compra.
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                  <TableRow>
                    <TableHead>Item / Descrição</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead className="text-right">Qtd Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Previsão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedCompras.map((group, idx) => (
                    <GroupRow key={idx} group={group} onUpdate={handleGroupUpdate} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="terceirizacao" className="space-y-4">
          {outsourcedOrders.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
              Nenhuma OP em terceirização no momento.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {outsourcedOrders.map((op) => {
                const today = startOfDay(new Date())
                const isOverdue =
                  op.delivery_date && isBefore(startOfDay(new Date(op.delivery_date)), today)
                return (
                  <Card
                    key={op.id}
                    className={cn(
                      'border-l-4',
                      isOverdue ? 'border-l-red-500' : 'border-l-indigo-500',
                      'bg-white dark:bg-slate-900',
                    )}
                  >
                    <CardHeader className="pb-2 flex flex-row items-start justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          OP: {op.op_number || op.order_number}
                          {isOverdue && (
                            <Badge variant="destructive" className="text-[10px]">
                              Atrasado
                            </Badge>
                          )}
                        </CardTitle>
                        <div className="text-sm text-muted-foreground font-medium mt-1">
                          {op.op_type === 'Assistência'
                            ? op.manual_product_name
                            : op.op_type === 'Especial'
                              ? 'Produto Especial'
                              : op.expand?.product_id?.name || '-'}
                        </div>
                      </div>
                      <Badge variant="outline">
                        {op.expand?.client_id?.name || op.client_name}
                      </Badge>
                    </CardHeader>
                    <CardContent className="pb-3 text-sm space-y-3">
                      <div className="flex justify-between items-center text-xs bg-slate-50 dark:bg-slate-800/50 p-2 rounded border">
                        <span className="text-muted-foreground font-medium flex items-center gap-1">
                          <CheckCircle className="size-3.5" /> Entrega OP:
                        </span>
                        <span
                          className={cn(
                            'font-bold',
                            isOverdue
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-700 dark:text-slate-300',
                          )}
                        >
                          {op.delivery_date
                            ? format(new Date(op.delivery_date), 'dd/MM/yyyy')
                            : '-'}
                        </span>
                      </div>

                      <div className="space-y-2 mt-3 pt-3 border-t">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          <Truck className="size-3.5" /> Detalhes da Terceirização
                        </span>
                        {Array.isArray(op.outsourcing_data) && op.outsourcing_data.length > 0 ? (
                          <div className="space-y-2">
                            {op.outsourcing_data.map((out: any, idx: number) => {
                              const outOverdue =
                                out.expected_date &&
                                isBefore(startOfDay(new Date(out.expected_date)), today)
                              return (
                                <div
                                  key={idx}
                                  className="bg-white dark:bg-slate-950 p-2.5 rounded border flex flex-col gap-1.5 shadow-sm"
                                >
                                  <div className="flex justify-between items-start gap-2">
                                    <span className="font-semibold text-sm leading-tight">
                                      {out.service}
                                    </span>
                                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded whitespace-nowrap">
                                      {out.supplier}
                                    </span>
                                  </div>
                                  <div className="text-[11px] flex justify-between items-center">
                                    <span className="text-muted-foreground">Previsão Retorno:</span>
                                    <span
                                      className={cn(
                                        'px-1.5 py-0.5 rounded',
                                        outOverdue
                                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-bold'
                                          : 'text-slate-600 dark:text-slate-300',
                                      )}
                                    >
                                      {out.expected_date
                                        ? format(new Date(out.expected_date), 'dd/MM/yyyy')
                                        : '-'}
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground italic border border-dashed rounded p-3 bg-slate-50 dark:bg-slate-800/50 text-center">
                            Nenhum fornecedor/serviço registrado.
                          </div>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                        onClick={() => handleConfirmOutsourcingReceipt(op)}
                      >
                        <CheckCircle className="size-4 mr-2" /> Confirmar Recebimento e Avançar OP
                      </Button>
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historico" className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border shadow-sm">
            <ScrollArea className="h-[600px] p-4">
              <div className="space-y-3">
                {historicoItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div>
                      <div className="font-bold text-base flex items-center gap-2">
                        {item.description}
                        {item.priority && item.priority !== 'Sem pressa' && (
                          <Badge
                            variant={item.priority === 'Urgente' ? 'destructive' : 'secondary'}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {item.priority}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        Origem:{' '}
                        <span className="font-medium text-slate-900 dark:text-slate-200">
                          {item.order_id && item.expand?.order_id?.order_number
                            ? `OP: ${item.expand.order_id.order_number}`
                            : 'Requisição Geral'}
                        </span>{' '}
                        | Cód: {item.code || '-'} | Qtd: {item.quantity} | Fornecedor:{' '}
                        {item.supplier || '-'}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 mt-2 sm:mt-0 shrink-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          'border-transparent',
                          item.status === 'Recebido' &&
                            'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
                          item.status === 'Liberado_Estoque' &&
                            'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
                          item.status === 'Cancelado' &&
                            'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
                        )}
                      >
                        {item.status.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(item.updated), 'dd/MM/yyyy HH:mm')}
                      </span>
                    </div>
                  </div>
                ))}
                {historicoItems.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    Nenhum histórico encontrado.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function GroupRow({ group, onUpdate }: { group: any; onUpdate: any }) {
  const [open, setOpen] = useState(false)
  const isCotação = group.status === 'Cotação'

  return (
    <>
      <TableRow
        onClick={() => setOpen(true)}
        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 group transition-colors"
      >
        <TableCell className="py-2.5">
          <div className="font-semibold text-slate-900 dark:text-slate-100">
            {group.description}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{group.code || 'Sem código'}</div>
        </TableCell>
        <TableCell className="py-2.5">
          <Badge
            variant={
              group.priority === 'Urgente'
                ? 'destructive'
                : group.priority === 'Próximos dias'
                  ? 'secondary'
                  : 'outline'
            }
            className="text-[10px]"
          >
            {group.priority}
          </Badge>
        </TableCell>
        <TableCell className="py-2.5 text-right font-black text-slate-700 dark:text-slate-300">
          {group.totalQuantity}
        </TableCell>
        <TableCell className="py-2.5">
          <Badge
            variant="outline"
            className={cn(
              'border-transparent text-white',
              isCotação ? 'bg-orange-500' : 'bg-blue-600',
            )}
          >
            {group.status}
          </Badge>
        </TableCell>
        <TableCell className="py-2.5 text-slate-600 dark:text-slate-400 text-sm">
          {group.expected_date ? format(new Date(group.expected_date), 'dd/MM/yyyy') : '-'}
        </TableCell>
      </TableRow>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden">
          <GroupedCompraDetails
            group={group}
            onUpdate={(g: any, updates: any) => {
              onUpdate(g, updates)
              setOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

function GroupedCompraDetails({ group, onUpdate }: { group: any; onUpdate: any }) {
  const [status, setStatus] = useState(group.status)
  const [supplier, setSupplier] = useState(group.supplier)
  const [expectedDate, setExpectedDate] = useState(
    group.expected_date ? group.expected_date.substring(0, 10) : '',
  )

  const handleSave = () => {
    onUpdate(group, {
      status,
      supplier,
      expected_date: expectedDate ? new Date(expectedDate).toISOString() : '',
    })
  }

  return (
    <div className="flex flex-col bg-white dark:bg-slate-900">
      <div className={cn('h-1.5 w-full', status === 'Cotação' ? 'bg-orange-400' : 'bg-blue-500')} />
      <DialogHeader className="px-6 pt-6 pb-2">
        <DialogTitle className="text-xl font-bold">{group.description}</DialogTitle>
        <div className="flex gap-2 items-center text-sm text-muted-foreground mt-1">
          <span>Código: {group.code || '-'}</span>
          <span>•</span>
          <Badge
            variant={group.priority === 'Urgente' ? 'destructive' : 'secondary'}
            className="text-[10px]"
          >
            {group.priority}
          </Badge>
        </div>
      </DialogHeader>

      <div className="px-6 py-4 flex flex-col gap-6">
        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div className="space-y-1">
            <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">
              Quantidade Total
            </span>
            <div className="text-2xl font-black text-blue-600 dark:text-blue-400 leading-none">
              {group.totalQuantity} <span className="text-sm font-semibold text-slate-500">un</span>
            </div>
          </div>
          <div className="text-right space-y-1">
            <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">
              Origens
            </span>
            <div className="flex flex-wrap justify-end gap-1.5 max-w-[200px]">
              {group.items.map((item: any) => (
                <Badge
                  key={item.id}
                  variant="secondary"
                  className="px-1.5 py-0.5 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm"
                >
                  {item.order_id && item.expand?.order_id?.order_number
                    ? `OP: ${item.expand.order_id.order_number}`
                    : 'Geral'}
                  <span className="opacity-60 ml-1">({item.quantity})</span>
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 bg-slate-50/50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Fase da Compra
            </Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-10 bg-white dark:bg-slate-950">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cotação">Em Cotação</SelectItem>
                <SelectItem value="Compra">Pedido Feito</SelectItem>
                <SelectItem
                  value="Recebido"
                  className="text-green-600 font-bold focus:text-green-700 focus:bg-green-50 dark:text-green-400"
                >
                  Marcar como Recebido
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Fornecedor
              </Label>
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Nome da empresa..."
                className="h-10 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Previsão de Entrega
              </Label>
              <Input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="h-10 bg-white dark:bg-slate-950"
              />
            </div>
          </div>
        </div>

        <Button
          className={cn(
            'w-full h-12 text-sm font-bold shadow-sm',
            status === 'Recebido'
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white',
          )}
          onClick={handleSave}
        >
          {status === 'Recebido' ? 'Confirmar Recebimento Total' : 'Salvar Informações da Compra'}
        </Button>
      </div>
    </div>
  )
}
