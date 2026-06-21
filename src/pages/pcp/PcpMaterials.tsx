import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MaterialShortage, PcpOrder } from '@/types'
import { Package, CheckCircle, Truck } from 'lucide-react'
import { format, isBefore, startOfDay } from 'date-fns'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import ShortageTable from './components/ShortageTable'

export default function PcpMaterials() {
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [outsourcedOrders, setOutsourcedOrders] = useState<PcpOrder[]>([])
  const { toast } = useToast()

  const fetchShortages = async () => {
    try {
      const res = await pb.collection('material_shortages').getFullList<MaterialShortage>({
        sort: '-created',
        expand: 'order_id,order_id.product_id,requested_by',
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

  const triagemItems = shortages.filter((s) => s.status === 'Pendente')
  const comprasItems = shortages.filter((s) => s.status === 'Cotação' || s.status === 'Compra')
  const historicoItems = shortages.filter(
    (s) => s.status === 'Recebido' || s.status === 'Liberado_Estoque' || s.status === 'Cancelado',
  )

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
            Compras ({comprasItems.length})
          </TabsTrigger>
          <TabsTrigger value="terceirizacao" className="text-base py-2">
            Terceirização ({outsourcedOrders.length})
          </TabsTrigger>
          <TabsTrigger value="historico" className="text-base py-2">
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="triagem" className="space-y-4">
          <ShortageTable items={triagemItems} allShortages={shortages} />
        </TabsContent>

        <TabsContent value="compras" className="space-y-4">
          <ShortageTable items={comprasItems} allShortages={shortages} />
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
                        <CheckCircle className="size-4 mr-2" /> Confirmar Recebimento e Avançar
                      </Button>
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historico" className="space-y-4">
          <ShortageTable items={historicoItems} allShortages={shortages} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
