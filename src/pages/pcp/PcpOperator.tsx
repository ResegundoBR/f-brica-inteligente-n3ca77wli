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
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/use-auth'
import { Badge } from '@/components/ui/badge'
import { Play, CheckCircle, AlertTriangle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const STAGES = [
  'Separação no estoque fisico',
  'Cotação',
  'Compra',
  'Retirada',
  'Aguardar chegar',
  'Entrega',
  'Corte',
  'Acabamento corte',
  'Dobra',
  'Calandra',
  'Solda',
  'Acabamento de solda',
  'Furação',
  'Rosca',
  'Bases de concreto',
  'Preparação (wash primer, primer e lixamento)',
  'Pintura',
  'Verniz',
  'Retoques',
  'Montagem',
  'Controle de qualidade',
  'Embalagem',
]

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

      if (currentIdx === STAGES.length - 1 || currentIdx === -1) {
        nextStatus = 'Concluído'
        await pb.collection('pcp_orders').update(op.id, {
          status: nextStatus,
          finished_at: new Date().toISOString(),
          bottleneck_reason: 'Nenhum',
          bottleneck_details: '',
        })
      } else {
        nextStage = STAGES[currentIdx + 1] as PcpOrder['stage']
        await pb.collection('pcp_orders').update(op.id, {
          status: nextStatus,
          stage: nextStage,
          bottleneck_reason: 'Nenhum',
          bottleneck_details: '',
        })
      }
      toast({ title: 'Etapa Concluída', description: `A OP avançou com sucesso.` })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleBottleneck = async (op: PcpOrder, reason: string, details: string) => {
    try {
      await pb.collection('pcp_orders').update(op.id, {
        status: reason === 'Nenhum' ? (op.started_at ? 'Em Andamento' : 'Fila') : 'Parado',
        bottleneck_reason: reason,
        bottleneck_details: details,
      })
      toast({
        title: reason === 'Nenhum' ? 'Gargalo Resolvido' : 'Gargalo Sinalizado',
        description: 'A equipe foi notificada.',
      })
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
        {orders.map((op) => (
          <OperatorCard
            key={op.id}
            op={op}
            onStart={() => handleStart(op)}
            onFinish={() => handleFinish(op)}
            onBottleneck={(reason, details) => handleBottleneck(op, reason, details)}
          />
        ))}
      </div>
    </div>
  )
}

function OperatorCard({
  op,
  onStart,
  onFinish,
  onBottleneck,
}: {
  op: PcpOrder
  onStart: () => void
  onFinish: () => void
  onBottleneck: (reason: string, details: string) => void
}) {
  const isLocked = op.bottleneck_reason && op.bottleneck_reason !== 'Nenhum'
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      setReason('')
      setDetails('')
    }
  }

  const handleSubmit = () => {
    onBottleneck(reason, details)
    setOpen(false)
  }

  return (
    <Card
      className={cn(
        'overflow-hidden border-2 transition-all',
        isLocked
          ? 'border-red-600 shadow-xl shadow-red-500/20'
          : 'border-slate-200 dark:border-slate-800',
      )}
    >
      <div className={cn('h-3 w-full', isLocked ? 'bg-red-600' : 'bg-slate-800')} />
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
        <div className="text-xl mb-4 font-semibold flex flex-col gap-2 items-start">
          <Badge
            variant="outline"
            className={cn(
              'border-transparent text-white',
              op.op_type === 'Assistência' && 'bg-fuchsia-500',
              op.op_type === 'Especial' && 'bg-slate-900 dark:bg-slate-100 dark:text-slate-900',
              op.op_type === 'Linha' && 'bg-blue-500',
            )}
          >
            {op.op_type}
          </Badge>
          <span>
            {op.op_type === 'Assistência'
              ? op.manual_product_name
              : op.op_type === 'Especial'
                ? 'Produto Especial (Ver Anexo)'
                : op.expand?.product_id?.name || 'S/Produto'}
          </span>
        </div>
        {isLocked && (
          <div className="bg-red-100 text-red-900 p-3 rounded-lg font-bold flex flex-col mb-4 text-lg">
            <div className="flex items-center">
              <AlertTriangle className="mr-2 size-6 shrink-0" />
              Travado: {op.bottleneck_reason}
            </div>
            {op.bottleneck_details && (
              <span className="text-sm font-medium mt-1 text-red-700 italic">
                {op.bottleneck_details}
              </span>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col gap-3 pt-0">
        {op.status === 'Fila' && !isLocked && (
          <Button
            size="lg"
            className="w-full text-xl h-16 bg-green-600 hover:bg-green-700"
            onClick={onStart}
          >
            <Play className="mr-2 size-6" /> INICIAR
          </Button>
        )}
        {op.status === 'Em Andamento' && !isLocked && (
          <Button
            size="lg"
            className="w-full text-xl h-16 bg-blue-600 hover:bg-blue-700"
            onClick={onFinish}
          >
            <CheckCircle className="mr-2 size-6" /> CONCLUIR
          </Button>
        )}

        <Dialog open={open} onOpenChange={handleOpenChange}>
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
              <DialogTitle className="text-2xl font-black">Por que a produção parou?</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {!reason ? (
                <>
                  {['Falta de Material', 'Dúvida Técnica', 'Sobrecarga'].map((r) => (
                    <Button
                      key={r}
                      variant="outline"
                      className="h-16 text-xl border-2 hover:bg-red-50 hover:text-red-700 hover:border-red-600"
                      onClick={() => setReason(r)}
                    >
                      {r}
                    </Button>
                  ))}
                </>
              ) : (
                <div className="flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
                  <div className="bg-slate-100 dark:bg-slate-900 p-3 rounded-md text-sm font-medium">
                    Motivo: <span className="text-red-600">{reason}</span>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="details" className="text-base">
                      Detalhes adicionais (opcional)
                    </Label>
                    <Textarea
                      id="details"
                      placeholder="Ex: Faltou parafuso M6, máquina 2 quebrou..."
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      className="min-h-[100px] text-base"
                    />
                  </div>
                  <DialogFooter className="mt-2">
                    <Button variant="outline" onClick={() => setReason('')}>
                      Voltar
                    </Button>
                    <Button variant="destructive" onClick={handleSubmit}>
                      Confirmar Parada
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {isLocked && (
          <Button
            size="lg"
            variant="outline"
            className="w-full text-lg h-14 mt-2"
            onClick={() => onBottleneck('Nenhum', '')}
          >
            RESOLVER GARGALO
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
