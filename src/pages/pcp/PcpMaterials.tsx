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
import { MaterialShortage, PcpOrder } from '@/types'
import { Package, CheckCircle, ShoppingCart, Truck } from 'lucide-react'
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
        totalQuantity: number
        items: MaterialShortage[]
        status: string
        supplier: string
        expected_date: string
      }
    > = {}
    comprasItems.forEach((item) => {
      const key = `${item.code}-${item.description}`
      if (!groups[key]) {
        groups[key] = {
          description: item.description,
          code: item.code,
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
                  className="border-l-4 border-l-yellow-500 bg-white dark:bg-slate-900"
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{item.description}</CardTitle>
                    <div className="text-sm text-muted-foreground font-medium">
                      Código: {item.code || '-'}
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3 text-sm space-y-2">
                    <div className="flex justify-between items-center bg-slate-100 dark:bg-slate-800/50 p-2 rounded">
                      <span className="text-muted-foreground">Qtd Solicitada</span>
                      <span className="font-bold text-lg">{item.quantity}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">OP Associada</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {item.expand?.order_id?.order_number}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Setor de Origem</span>
                      <span>{item.sector}</span>
                    </div>
                  </CardContent>
                  <CardFooter className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1 text-xs px-2"
                      onClick={() => handleUpdateStatus(item.id, 'Liberado_Estoque')}
                    >
                      <CheckCircle className="size-3.5 mr-1 text-green-600" /> No Estoque
                    </Button>
                    <Button
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-2"
                      onClick={() => handleUpdateStatus(item.id, 'Cotação')}
                    >
                      <ShoppingCart className="size-3.5 mr-1" /> Comprar
                    </Button>
                  </CardFooter>
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
            <div className="flex flex-col gap-4">
              {groupedCompras.map((group, idx) => (
                <GroupedCompraCard key={idx} group={group} onUpdate={handleGroupUpdate} />
              ))}
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
                      <div className="font-bold text-base">
                        {item.description}{' '}
                        <span className="font-normal text-muted-foreground text-sm ml-1">
                          ({item.code || '-'})
                        </span>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        OP:{' '}
                        <span className="font-medium text-slate-900 dark:text-slate-200">
                          {item.expand?.order_id?.order_number}
                        </span>{' '}
                        | Qtd: {item.quantity} | Fornecedor: {item.supplier || '-'}
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

function GroupedCompraCard({ group, onUpdate }: { group: any; onUpdate: any }) {
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
    <Card className="overflow-hidden border-2 bg-white dark:bg-slate-900">
      <div className={cn('h-2 w-full', status === 'Cotação' ? 'bg-orange-400' : 'bg-blue-500')} />
      <div className="p-4 md:p-6 flex flex-col md:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <div>
            <h3 className="text-xl font-bold">{group.description}</h3>
            <p className="text-sm text-muted-foreground font-medium mt-1">
              Código: {group.code || '-'}
            </p>
          </div>

          <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-lg flex items-center justify-between border">
            <span className="text-slate-600 dark:text-slate-300 font-semibold">
              Qtd Total Consolidada
            </span>
            <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
              {group.totalQuantity}
            </span>
          </div>

          <div>
            <span className="text-xs uppercase font-bold text-muted-foreground mb-2 block tracking-wider">
              OPs Aguardando este material
            </span>
            <div className="flex flex-wrap gap-2">
              {group.items.map((item: any) => (
                <Badge
                  key={item.id}
                  variant="secondary"
                  className="px-2.5 py-1 text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                >
                  {item.expand?.order_id?.order_number}{' '}
                  <span className="opacity-50 ml-1 font-normal">(Qtd {item.quantity})</span>
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-6 space-y-4 flex flex-col justify-center">
          <div className="space-y-2">
            <Label>Fase da Compra</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-12 text-base font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cotação">Em Cotação</SelectItem>
                <SelectItem value="Compra">Pedido Feito (Aguardando)</SelectItem>
                <SelectItem
                  value="Recebido"
                  className="text-green-600 font-bold dark:text-green-400"
                >
                  Marcar como Recebido
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Fornecedor (Opcional)</Label>
            <Input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Nome da empresa"
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <Label>Previsão de Entrega (Opcional)</Label>
            <Input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="h-10"
            />
          </div>

          <Button
            className="w-full mt-2 h-12 text-base font-bold"
            onClick={handleSave}
            variant={status === 'Recebido' ? 'default' : 'outline'}
          >
            {status === 'Recebido' ? 'Confirmar Recebimento Geral' : 'Salvar Informações'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
