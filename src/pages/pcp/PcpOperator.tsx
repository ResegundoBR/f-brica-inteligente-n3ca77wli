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
  DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Trash, Plus, ShoppingCart } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/hooks/use-auth'
import { Badge } from '@/components/ui/badge'
import { Play, CheckCircle, AlertTriangle, FastForward } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { shouldHighlightObservation } from '@/lib/pcp-utils'
import { isBefore, startOfDay, parseISO } from 'date-fns'

const SECTORS = {
  Suprimentos: [
    'Separação no estoque fisico',
    'Separação',
    'Cotação',
    'Compra',
    'Retirada',
    'Aguardando',
  ],
  Fabricação: [
    'Corte',
    'Dobra',
    'Calandra',
    'Solda',
    'Acab. Solda',
    'Furação',
    'Rosca',
    'Concreto',
  ],
  Acabamento: ['Preparação', 'Pintura', 'Verniz', 'Retoques'],
  Montagem: ['Montagem', 'Qualidade'],
  Expedição: ['Embalagem', 'Expedição'],
} as const

type SectorName = keyof typeof SECTORS

const ALL_STAGES = [
  'Separação no estoque fisico',
  'Separação',
  'Cotação',
  'Compra',
  'Retirada',
  'Aguardando',
  'Corte',
  'Dobra',
  'Calandra',
  'Solda',
  'Acab. Solda',
  'Furação',
  'Rosca',
  'Concreto',
  'Terceirização',
  'Preparação',
  'Pintura',
  'Verniz',
  'Retoques',
  'Montagem',
  'Qualidade',
  'Embalagem',
  'Expedição',
]

function getNextStage(current: string) {
  const idx = ALL_STAGES.indexOf(current)
  if (idx === -1 || idx === ALL_STAGES.length - 1) return null
  return ALL_STAGES[idx + 1]
}

function FinishDialog({
  op,
  onConfirm,
}: {
  op: PcpOrder
  onConfirm: (nextStage: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const defaultNext = getNextStage(op.stage)
  const [selectedStage, setSelectedStage] = useState<string>(defaultNext || 'CONCLUIDO')

  useEffect(() => {
    if (open) {
      setSelectedStage(defaultNext || 'CONCLUIDO')
    }
  }, [open, defaultNext])

  const handleConfirm = () => {
    onConfirm(selectedStage === 'CONCLUIDO' ? null : selectedStage)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full text-xl h-14 bg-blue-600 hover:bg-blue-700 text-white">
          <CheckCircle className="mr-2 size-6" /> CONCLUIR
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black">Concluir Etapa</DialogTitle>
          <DialogDescription className="text-base">
            A etapa atual (<strong>{op.stage}</strong>) foi finalizada. Para onde esta OP deve ir
            agora?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-4">
          {defaultNext ? (
            <div className="flex flex-col gap-2">
              <Label className="text-base text-slate-600 dark:text-slate-400">
                Avançar para a próxima etapa (Padrão)
              </Label>
              <Button
                variant="outline"
                className={cn(
                  'h-16 justify-start text-xl font-bold border-2 transition-all',
                  selectedStage === defaultNext
                    ? 'border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/40'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800',
                )}
                onClick={() => setSelectedStage(defaultNext)}
              >
                <FastForward className="mr-3 size-6" />
                {defaultNext}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label className="text-base text-slate-600 dark:text-slate-400">
                Avançar para a próxima etapa (Padrão)
              </Label>
              <Button
                variant="outline"
                className={cn(
                  'h-16 justify-start text-xl font-bold border-2 transition-all',
                  selectedStage === 'CONCLUIDO'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/40'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800',
                )}
                onClick={() => setSelectedStage('CONCLUIDO')}
              >
                <CheckCircle className="mr-3 size-6" />
                Finalizar OP (Concluído)
              </Button>
            </div>
          )}

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
            <span className="flex-shrink-0 mx-4 text-slate-400 text-sm font-semibold uppercase">
              OU PULAR ETAPA
            </span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-base text-slate-600 dark:text-slate-400">
              Selecionar manualmente:
            </Label>
            <Select value={selectedStage} onValueChange={setSelectedStage}>
              <SelectTrigger className="h-14 text-lg font-semibold">
                <SelectValue placeholder="Selecione uma etapa..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {defaultNext !== null && (
                  <SelectItem
                    value="CONCLUIDO"
                    className="font-bold text-blue-700 dark:text-blue-400"
                  >
                    Finalizar OP (Concluído)
                  </SelectItem>
                )}
                {ALL_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button variant="outline" className="h-12 text-base" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            className="h-12 text-base bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleConfirm}
          >
            Confirmar Movimentação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OperatorCard({
  op,
  onStart,
  onFinishConfirm,
  onBottleneck,
}: {
  op: PcpOrder
  onStart: () => void
  onFinishConfirm: (nextStage: string | null) => void
  onBottleneck: (reason: string, details: string, missingItems?: any[]) => void
}) {
  const isLocked = op.bottleneck_reason && op.bottleneck_reason !== 'Nenhum'
  const isDelayed = op.delivery_date
    ? isBefore(parseISO(op.delivery_date), startOfDay(new Date()))
    : false

  let headerClass = 'bg-blue-500'
  let borderClass = 'border-blue-200 dark:border-blue-900 shadow-md shadow-blue-500/5'

  if (isLocked) {
    headerClass = 'bg-red-600'
    borderClass = 'border-red-500 shadow-lg shadow-red-500/10'
  } else if (isDelayed) {
    headerClass = 'bg-purple-600'
    borderClass = 'border-purple-500 shadow-lg shadow-purple-500/10'
  }

  const [openBottleneck, setOpenBottleneck] = useState(false)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [missingItems, setMissingItems] = useState<
    { description: string; code: string; quantity: number }[]
  >([])

  const handleOpenBottleneckChange = (isOpen: boolean) => {
    setOpenBottleneck(isOpen)
    if (!isOpen) {
      setReason('')
      setDetails('')
      setMissingItems([])
    }
  }

  const handleBottleneckSubmit = () => {
    onBottleneck(reason, details, missingItems)
    setOpenBottleneck(false)
  }

  const inFila = op.status === 'Fila' || (op.status === 'Parado' && !op.started_at)
  const inExecucao = op.status === 'Em Andamento' || (op.status === 'Parado' && op.started_at)

  return (
    <Card
      className={cn(
        'overflow-hidden border-2 transition-all bg-white dark:bg-slate-900',
        borderClass,
      )}
    >
      <div className={cn('h-3 w-full', headerClass)} />
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-2">
          <div>
            <CardTitle className="text-2xl font-black">{op.order_number}</CardTitle>
            <p className="text-lg font-medium text-slate-600 dark:text-slate-400 mt-1">
              {op.client_name}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge
              className="text-lg px-3 py-1 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
              variant="secondary"
            >
              {op.stage}
            </Badge>
            {op.delivery_date && (
              <span
                className={cn(
                  'text-xs font-bold uppercase tracking-wider',
                  isDelayed
                    ? 'text-purple-600 dark:text-purple-400'
                    : 'text-slate-500 dark:text-slate-400',
                )}
              >
                Entrega:{' '}
                {parseISO(op.delivery_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
              </span>
            )}
          </div>
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

        {op.observations && (
          <div
            className={cn(
              'p-3 rounded-lg text-sm border mb-4 whitespace-pre-wrap',
              shouldHighlightObservation(op.stage, op.observation_sector)
                ? 'bg-yellow-100 border-yellow-400 text-yellow-900 dark:bg-yellow-900/40 dark:border-yellow-600 dark:text-yellow-200 font-semibold shadow-sm'
                : 'bg-slate-100 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300',
            )}
          >
            <div className="text-xs uppercase tracking-wider mb-1 opacity-70 font-bold">
              Observações {op.observation_sector ? `(${op.observation_sector})` : ''}
            </div>
            {op.observations}
          </div>
        )}

        {isLocked && (
          <div className="bg-red-50 text-red-900 border border-red-200 p-3 rounded-lg font-bold flex flex-col mb-4 text-lg dark:bg-red-900/30 dark:border-red-900/50 dark:text-red-200">
            <div className="flex items-center">
              <AlertTriangle className="mr-2 size-6 shrink-0" />
              Travado: {op.bottleneck_reason}
            </div>
            {op.bottleneck_details && (
              <span className="text-sm font-medium mt-1 text-red-700 dark:text-red-300 italic">
                {op.bottleneck_details}
              </span>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col gap-3 pt-0">
        {inFila && !isLocked && (
          <Button
            size="lg"
            className="w-full text-xl h-14 bg-green-600 hover:bg-green-700 text-white"
            onClick={onStart}
          >
            <Play className="mr-2 size-6" /> INICIAR
          </Button>
        )}

        {inExecucao && !isLocked && <FinishDialog op={op} onConfirm={onFinishConfirm} />}

        <Dialog open={openBottleneck} onOpenChange={handleOpenBottleneckChange}>
          <DialogTrigger asChild>
            <Button
              size="lg"
              variant="destructive"
              className="w-full text-lg h-12"
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
                      className="h-16 text-xl border-2 hover:bg-red-50 hover:text-red-700 hover:border-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-300 dark:hover:border-red-700"
                      onClick={() => setReason(r)}
                    >
                      {r}
                    </Button>
                  ))}
                </>
              ) : (
                <div className="flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
                  <div className="bg-slate-100 dark:bg-slate-900 p-3 rounded-md text-sm font-medium">
                    Motivo: <span className="text-red-600 dark:text-red-400">{reason}</span>
                  </div>

                  {reason === 'Falta de Material' && (
                    <div className="space-y-3 border p-3 rounded-md bg-slate-50 dark:bg-slate-900">
                      <Label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        Materiais Faltantes
                      </Label>
                      {missingItems.map((item, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <Input
                            placeholder="Código"
                            value={item.code}
                            onChange={(e) => {
                              const newItems = [...missingItems]
                              newItems[idx].code = e.target.value
                              setMissingItems(newItems)
                            }}
                            className="w-20 sm:w-24 text-xs h-9 bg-white dark:bg-slate-950"
                          />
                          <Input
                            placeholder="Descrição do material"
                            value={item.description}
                            onChange={(e) => {
                              const newItems = [...missingItems]
                              newItems[idx].description = e.target.value
                              setMissingItems(newItems)
                            }}
                            className="flex-1 text-xs h-9 bg-white dark:bg-slate-950"
                          />
                          <Input
                            type="number"
                            min="1"
                            placeholder="Qtd"
                            value={item.quantity || ''}
                            onChange={(e) => {
                              const newItems = [...missingItems]
                              newItems[idx].quantity = Number(e.target.value)
                              setMissingItems(newItems)
                            }}
                            className="w-16 sm:w-20 text-xs h-9 bg-white dark:bg-slate-950"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                            onClick={() => {
                              const newItems = [...missingItems]
                              newItems.splice(idx, 1)
                              setMissingItems(newItems)
                            }}
                          >
                            <Trash className="size-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs border-dashed bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800"
                        onClick={() =>
                          setMissingItems([
                            ...missingItems,
                            { code: '', description: '', quantity: 1 },
                          ])
                        }
                      >
                        <Plus className="size-3 mr-1" /> Adicionar Material Faltante
                      </Button>
                    </div>
                  )}

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
                    <Button variant="destructive" onClick={handleBottleneckSubmit}>
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
            className="w-full text-lg h-12 mt-2 font-bold border-2"
            onClick={() => onBottleneck('Nenhum', '', [])}
          >
            RESOLVER GARGALO
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

export default function PcpOperator() {
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [selectedSector, setSelectedSector] = useState<SectorName>('Suprimentos')
  const { user } = useAuth()
  const { toast } = useToast()

  const [openRequest, setOpenRequest] = useState(false)
  const [reqDesc, setReqDesc] = useState('')
  const [reqQtd, setReqQtd] = useState(1)
  const [reqType, setReqType] = useState('Materiais')
  const [reqPriority, setReqPriority] = useState('Sem pressa')
  const [reqObs, setReqObs] = useState('')
  const [reqOrderId, setReqOrderId] = useState('none')

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

  const handleFinishConfirm = async (op: PcpOrder, nextStage: string | null) => {
    try {
      if (!nextStage) {
        await pb.collection('pcp_orders').update(op.id, {
          status: 'Concluído',
          finished_at: new Date().toISOString(),
          bottleneck_reason: 'Nenhum',
          bottleneck_details: '',
        })

        await pb.collection('pcp_order_logs').create({
          order_id: op.id,
          user_id: user?.id,
          stage: op.stage,
          action: 'OP Concluída',
          details: 'Finalizado pelo Operador',
        })
      } else {
        await pb.collection('pcp_orders').update(op.id, {
          status: 'Fila',
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

  const handleBottleneck = async (
    op: PcpOrder,
    reason: string,
    details: string,
    missingItems?: any[],
  ) => {
    try {
      if (reason === 'Falta de Material' && missingItems && missingItems.length > 0) {
        for (const item of missingItems) {
          if (!item.description || !item.quantity) continue
          await pb.collection('material_shortages').create({
            order_id: op.id,
            description: item.description,
            code: item.code,
            quantity: item.quantity,
            sector: selectedSector,
            status: 'Pendente',
            requested_by: user?.id,
          })
        }
      }

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

  const handlePurchaseRequest = async () => {
    if (!reqDesc) {
      toast({ title: 'Erro', description: 'Preencha a descrição do item', variant: 'destructive' })
      return
    }
    try {
      await pb.collection('material_shortages').create({
        description: reqDesc,
        quantity: reqQtd,
        request_type: reqType,
        priority: reqPriority,
        observation: reqObs,
        order_id: reqOrderId === 'none' ? '' : reqOrderId,
        sector: selectedSector,
        status: 'Pendente',
        requested_by: user?.id,
      })
      toast({ title: 'Solicitação enviada com sucesso!' })
      setOpenRequest(false)
      setReqDesc('')
      setReqQtd(1)
      setReqType('Materiais')
      setReqPriority('Sem pressa')
      setReqObs('')
      setReqOrderId('none')
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const sectorOrders = orders.filter((o) =>
    (SECTORS[selectedSector] as readonly string[]).includes(o.stage),
  )

  const filaOrders = sectorOrders.filter(
    (o) => o.status === 'Fila' || (o.status === 'Parado' && !o.started_at),
  )
  const execucaoOrders = sectorOrders.filter(
    (o) => o.status === 'Em Andamento' || (o.status === 'Parado' && o.started_at),
  )

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <div className="mb-2 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            Portal do Operador
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Selecione seu setor e gerencie as Ordens de Produção.
          </p>
        </div>

        <Dialog open={openRequest} onOpenChange={setOpenRequest}>
          <DialogTrigger asChild>
            <Button
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 shadow-sm whitespace-nowrap"
            >
              <ShoppingCart className="mr-2 size-5" /> Solicitar Compra / Insumo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black">Solicitar Compra / Insumo</DialogTitle>
              <DialogDescription>
                Faça o pedido de materiais, ferramentas ou insumos para o seu setor.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="req-desc">Item / Descrição</Label>
                <Input
                  id="req-desc"
                  placeholder="Ex: Broca 8mm, Fita Crepe..."
                  value={reqDesc}
                  onChange={(e) => setReqDesc(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quantidade</Label>
                  <Input
                    type="number"
                    min={1}
                    value={reqQtd}
                    onChange={(e) => setReqQtd(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={reqType} onValueChange={setReqType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ferramentas">Ferramentas</SelectItem>
                      <SelectItem value="Materiais">Materiais</SelectItem>
                      <SelectItem value="Produtos">Produtos</SelectItem>
                      <SelectItem value="Insumos">Insumos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select value={reqPriority} onValueChange={setReqPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Sem pressa">Sem pressa</SelectItem>
                    <SelectItem value="Próximos dias">Próximos dias</SelectItem>
                    <SelectItem value="Urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ordem de Produção (Opcional)</Label>
                <Select value={reqOrderId} onValueChange={setReqOrderId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhuma (Requisição Geral)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma (Requisição Geral)</SelectItem>
                    {orders.map((op) => (
                      <SelectItem key={op.id} value={op.id}>
                        OP: {op.order_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  placeholder="Detalhes adicionais do pedido..."
                  value={reqObs}
                  onChange={(e) => setReqObs(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenRequest(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handlePurchaseRequest}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Enviar Solicitação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex overflow-x-auto pb-2 gap-2 mb-2 no-scrollbar">
        {(Object.keys(SECTORS) as SectorName[]).map((sector) => (
          <Button
            key={sector}
            variant={selectedSector === sector ? 'default' : 'outline'}
            onClick={() => setSelectedSector(sector)}
            className={cn(
              'text-base md:text-lg px-6 h-12 rounded-full font-bold transition-all whitespace-nowrap border-2',
              selectedSector === sector &&
                'shadow-md ring-2 ring-primary/20 bg-slate-900 dark:bg-slate-100',
            )}
          >
            {sector}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200">
              Fila para Iniciar
            </h2>
            <Badge variant="secondary" className="text-lg px-3">
              {filaOrders.length}
            </Badge>
          </div>
          <div className="flex flex-col gap-4">
            {filaOrders.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
                Nenhuma OP na fila deste setor.
              </div>
            ) : (
              filaOrders.map((op) => (
                <OperatorCard
                  key={op.id}
                  op={op}
                  onStart={() => handleStart(op)}
                  onFinishConfirm={(ns) => handleFinishConfirm(op, ns)}
                  onBottleneck={(reason, details, items) =>
                    handleBottleneck(op, reason, details, items)
                  }
                />
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200">
              Em Execução
            </h2>
            <Badge variant="default" className="text-lg px-3 bg-blue-600 hover:bg-blue-600">
              {execucaoOrders.length}
            </Badge>
          </div>
          <div className="flex flex-col gap-4">
            {execucaoOrders.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
                Nenhuma OP em execução no momento.
              </div>
            ) : (
              execucaoOrders.map((op) => (
                <OperatorCard
                  key={op.id}
                  op={op}
                  onStart={() => handleStart(op)}
                  onFinishConfirm={(ns) => handleFinishConfirm(op, ns)}
                  onBottleneck={(reason, details, items) =>
                    handleBottleneck(op, reason, details, items)
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
