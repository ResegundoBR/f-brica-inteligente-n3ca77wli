import { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { PcpOrder } from '@/types'
import { useRealtime } from '@/hooks/use-realtime'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useAuth } from '@/hooks/use-auth'
import { Badge } from '@/components/ui/badge'
import { Play, CheckCircle, AlertTriangle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const STAGES = ['Corte', 'Montagem', 'Acabamento', 'Expedição']

export default function PcpOperator() {
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const { user } = useAuth()
  const { toast } = useToast()

  const loadData = async () => {
    try {
      const records = await pb.collection('pcp_orders').getFullList<PcpOrder>({
        filter: 'status != "Concluído"',
        sort: 'delivery_date',
        expand: 'product_id',
      })
      setOrders(records)
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

  const handleStart = async (op: PcpOrder) => {
    try {
      await pb.collection('pcp_orders').update(op.id, {
        status: 'Em Andamento',
        started_at: new Date().toISOString(),
        operator_id: user?.id,
      })
      toast({ title: 'OP Iniciada', description: `Você começou a trabalhar na ${op.order_number}` })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleFinish = async (op: PcpOrder) => {
    try {
      const currentIdx = STAGES.indexOf(op.stage)
      let nextStage = op.stage
      let nextStatus = 'Fila'

      if (currentIdx === STAGES.length - 1) {
        nextStatus = 'Concluído'
        await pb.collection('pcp_orders').update(op.id, {
          status: nextStatus,
          finished_at: new Date().toISOString(),
          bottleneck_reason: 'Nenhum',
        })
      } else {
        nextStage = STAGES[currentIdx + 1] as PcpOrder['stage']
        await pb.collection('pcp_orders').update(op.id, {
          status: nextStatus,
          stage: nextStage,
          bottleneck_reason: 'Nenhum',
        })
      }
      toast({ title: 'Etapa Concluída', description: `A OP avançou com sucesso.` })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleBottleneck = async (op: PcpOrder, reason: string) => {
    try {
      await pb.collection('pcp_orders').update(op.id, {
        bottleneck_reason: reason,
      })
      toast({ title: 'Gargalo Sinalizado', description: 'A equipe foi notificada.' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <div className="mb-4">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">
          Portal do Operador
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400">
          Toque nas tarefas para interagir.
        </p>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {orders.map((op) => {
          const isLocked = op.bottleneck_reason !== 'Nenhum'
          return (
            <Card
              key={op.id}
              className={`overflow-hidden border-2 transition-all ${isLocked ? 'border-red-600 shadow-xl shadow-red-500/20' : 'border-slate-200 dark:border-slate-800'}`}
            >
              <div className={`h-3 w-full ${isLocked ? 'bg-red-600' : 'bg-slate-800'}`} />
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-2xl font-black">{op.order_number}</CardTitle>
                    <p className="text-lg font-medium text-slate-600 mt-1">{op.client_name}</p>
                  </div>
                  <Badge className="text-lg px-3 py-1" variant="outline">
                    {op.stage}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="text-xl mb-4 font-semibold">
                  {op.is_special ? 'Produto Especial (Ver Anexo)' : op.expand?.product_id?.name}
                </div>
                {isLocked && (
                  <div className="bg-red-100 text-red-900 p-3 rounded-lg font-bold flex items-center mb-4 text-lg">
                    <AlertTriangle className="mr-2 size-6" />
                    Travado: {op.bottleneck_reason}
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col gap-3 pt-0">
                {op.status === 'Fila' && !isLocked && (
                  <Button
                    size="lg"
                    className="w-full text-xl h-16 bg-green-600 hover:bg-green-700"
                    onClick={() => handleStart(op)}
                  >
                    <Play className="mr-2 size-6" /> INICIAR
                  </Button>
                )}
                {op.status === 'Em Andamento' && !isLocked && (
                  <Button
                    size="lg"
                    className="w-full text-xl h-16 bg-blue-600 hover:bg-blue-700"
                    onClick={() => handleFinish(op)}
                  >
                    <CheckCircle className="mr-2 size-6" /> CONCLUIR
                  </Button>
                )}

                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      size="lg"
                      variant="destructive"
                      className="w-full text-xl h-14"
                      disabled={isLocked}
                    >
                      <AlertTriangle className="mr-2 size-5" />{' '}
                      {isLocked ? 'JÁ SINALIZADO' : 'SINALIZAR GARGALO'}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-black">
                        Por que a produção parou?
                      </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      {['Falta de Material', 'Dúvida Técnica', 'Sobrecarga'].map((reason) => (
                        <Button
                          key={reason}
                          variant="outline"
                          className="h-16 text-xl border-2 hover:bg-red-50 hover:text-red-700 hover:border-red-600"
                          onClick={() => handleBottleneck(op, reason)}
                        >
                          {reason}
                        </Button>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>

                {isLocked && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full text-lg h-14 mt-2"
                    onClick={() => handleBottleneck(op, 'Nenhum')}
                  >
                    RESOLVER GARGALO
                  </Button>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
