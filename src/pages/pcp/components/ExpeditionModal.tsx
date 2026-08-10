import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Truck,
  Search,
  ChevronRight,
  ChevronLeft,
  Package,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { extractFieldErrors, type FieldErrors } from '@/lib/pocketbase/errors'

const EXPEDICAO_STAGE = 'Expedição'

export function ExpeditionModal({
  open,
  onOpenChange,
  initialOrderNumber,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialOrderNumber?: string
}) {
  const [step, setStep] = useState(1)
  const [orderNumber, setOrderNumber] = useState('')
  const [ops, setOps] = useState<any[]>([])
  const [mode, setMode] = useState<'total' | 'partial'>('partial')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [nf, setNf] = useState('')
  const [transportadora, setTransportadora] = useState('')
  const [dataSaida, setDataSaida] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [showTotalAlert, setShowTotalAlert] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!open) return
    setStep(1)
    setOps([])
    setSelectedIds(new Set())
    setNf('')
    setTransportadora('')
    setDataSaida(format(new Date(), 'yyyy-MM-dd'))
    setFieldErrors({})
    setMode('partial')
    setShowTotalAlert(false)
    if (initialOrderNumber) {
      setOrderNumber(initialOrderNumber)
      setSearching(true)
      pb.collection('pcp_orders')
        .getFullList({
          filter: `order_number="${initialOrderNumber}" && status != "Concluído"`,
          expand: 'product_id,client_id',
          sort: 'op_number',
        })
        .then((res) => {
          setOps(res)
          setSelectedIds(
            new Set(res.filter((o: any) => o.stage === EXPEDICAO_STAGE).map((o: any) => o.id)),
          )
          setStep(2)
        })
        .catch(() => {
          toast({ title: 'Erro ao buscar OPs', variant: 'destructive' })
        })
        .finally(() => setSearching(false))
    } else {
      setOrderNumber('')
    }
  }, [open, initialOrderNumber])

  const handleSearch = () => {
    const search = orderNumber.trim()
    if (!search) return
    setSearching(true)
    setFieldErrors({})
    pb.collection('pcp_orders')
      .getFullList({
        filter: `order_number="${search}" && status != "Concluído"`,
        expand: 'product_id,client_id',
        sort: 'op_number',
      })
      .then((res) => {
        setOps(res)
        setSelectedIds(
          new Set(res.filter((o: any) => o.stage === EXPEDICAO_STAGE).map((o: any) => o.id)),
        )
        setMode('partial')
        if (res.length === 0) {
          toast({
            title: 'Nenhuma OP encontrada',
            description: 'Não há OPs em aberto para este pedido.',
          })
        } else {
          setStep(2)
        }
      })
      .catch(() => {
        toast({ title: 'Erro ao buscar OPs', variant: 'destructive' })
      })
      .finally(() => setSearching(false))
  }

  const handleModeTotal = () => {
    setMode('total')
    setSelectedIds(new Set(ops.map((o) => o.id)))
  }

  const handleModePartial = () => {
    setMode('partial')
    setSelectedIds(new Set(ops.filter((o) => o.stage === EXPEDICAO_STAGE).map((o) => o.id)))
  }

  const toggleOp = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const getProductName = (op: any) =>
    op.op_type === 'Assistência'
      ? op.manual_product_name
      : op.op_type === 'Especial'
        ? op.manual_product_name || 'Produto Especial'
        : op.expand?.product_id?.name || 'S/Produto'

  const nonExpedicaoOps = ops.filter((o) => o.stage !== EXPEDICAO_STAGE)

  const handleNextFromStep2 = () => {
    if (mode === 'total' && nonExpedicaoOps.length > 0) {
      setShowTotalAlert(true)
    } else {
      setStep(3)
    }
  }

  const handleConfirm = async () => {
    setFieldErrors({})
    const errors: FieldErrors = {}
    if (!nf.trim()) errors.nf = 'NF é obrigatória'
    if (!transportadora.trim()) errors.transportadora = 'Transportadora é obrigatória'
    if (!dataSaida) errors.data_saida = 'Data de saída é obrigatória'
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    if (selectedIds.size === 0) {
      toast({ title: 'Selecione ao menos uma OP', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const selectedOps = ops.filter((o) => selectedIds.has(o.id))
      const opList = selectedOps.map((o) => o.op_number || o.order_number).join(', ')
      const details = `NF: ${nf.trim()} | Transportadora: ${transportadora.trim()} | Data: ${dataSaida} | OPs: ${opList}`
      for (const op of selectedOps) {
        await pb.collection('pcp_orders').update(op.id, {
          status: 'Concluído',
          finished_at: new Date().toISOString(),
          nf: nf.trim(),
          transportadora: transportadora.trim(),
          data_saida: new Date(dataSaida).toISOString(),
        })
        await pb.collection('pcp_order_logs').create({
          order_id: op.id,
          stage: 'Expedição',
          action: 'Expedição registrada',
          details,
          user_id: pb.authStore.record?.id,
        })
      }
      toast({
        title: 'Expedição registrada com sucesso!',
        description: `${selectedOps.length} OP(s) concluída(s).`,
      })
      onOpenChange(false)
    } catch (err: any) {
      const errs = extractFieldErrors(err)
      setFieldErrors(errs)
      toast({
        title: 'Erro ao registrar expedição',
        description: err.message || 'Falha inesperada.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="size-5" />
              Expedição de OPs {step > 1 && `- Etapa ${step}/3`}
            </DialogTitle>
          </DialogHeader>

          {step === 1 && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Número do Pedido</Label>
                <div className="flex gap-2">
                  <Input
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="Ex: PED-1234"
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <Button onClick={handleSearch} disabled={searching}>
                    <Search className="size-4 mr-1" />
                    {searching ? 'Buscando...' : 'Buscar'}
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Digite o número do pedido para buscar todas as OPs em aberto (não concluídas).
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 py-4">
              <div className="flex gap-2">
                <Button
                  variant={mode === 'total' ? 'default' : 'outline'}
                  onClick={handleModeTotal}
                  className="flex-1"
                >
                  Total (todas as OPs)
                </Button>
                <Button
                  variant={mode === 'partial' ? 'default' : 'outline'}
                  onClick={handleModePartial}
                  className="flex-1"
                >
                  Parcial (selecionar)
                </Button>
              </div>
              {nonExpedicaoOps.length > 0 && mode === 'total' && (
                <div className="flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                  <AlertTriangle className="size-4 text-orange-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-orange-700 dark:text-orange-300">
                    {nonExpedicaoOps.length} OP(s) ainda não estão na Expedição. Você precisará
                    confirmar antes de prosseguir.
                  </p>
                </div>
              )}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {ops.length === 0 && (
                  <p className="text-sm text-center text-muted-foreground py-4">
                    Nenhuma OP em aberto encontrada para este pedido.
                  </p>
                )}
                {ops.map((op) => {
                  const isInExpedicao = op.stage === EXPEDICAO_STAGE
                  return (
                    <div
                      key={op.id}
                      className={cn(
                        'flex items-center gap-3 p-3 border rounded-lg transition-colors',
                        isInExpedicao
                          ? 'border-green-400 bg-green-50/50 dark:bg-green-950/20'
                          : 'border-red-400 bg-red-50/50 dark:bg-red-950/20',
                        mode === 'total' && 'cursor-default',
                        mode === 'partial' &&
                          'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900',
                      )}
                      onClick={() => mode === 'partial' && toggleOp(op.id)}
                    >
                      <Checkbox
                        checked={selectedIds.has(op.id)}
                        onCheckedChange={() => toggleOp(op.id)}
                        disabled={mode === 'total'}
                        className={
                          isInExpedicao
                            ? 'border-green-500 data-[state=checked]:bg-green-500'
                            : 'border-red-500'
                        }
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {isInExpedicao ? (
                            <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />
                          ) : (
                            <AlertTriangle className="size-3.5 text-red-500 shrink-0" />
                          )}
                          <Package className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm truncate">{getProductName(op)}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span>OP: {op.op_number || '-'}</span>
                          <span>Qtd: {op.quantity}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] h-4',
                              isInExpedicao
                                ? 'border-green-300 text-green-700 dark:text-green-300'
                                : 'border-red-300 text-red-700 dark:text-red-300',
                            )}
                          >
                            {op.stage}
                          </Badge>
                        </div>
                        {!isInExpedicao && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                            <AlertTriangle className="size-3" />
                            Ainda em processo — etapa: {op.stage}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ChevronLeft className="size-4 mr-1" />
                  Voltar
                </Button>
                <Button onClick={handleNextFromStep2} disabled={selectedIds.size === 0}>
                  Próximo
                  <ChevronRight className="size-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 py-4">
              <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 border">
                <p className="text-sm font-medium mb-1">Resumo da Expedição</p>
                <p className="text-xs text-muted-foreground">
                  {selectedIds.size} OP(s) selecionada(s) do pedido {orderNumber}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {ops
                    .filter((o) => selectedIds.has(o.id))
                    .map((op) => (
                      <Badge key={op.id} variant="secondary" className="text-[10px]">
                        {op.op_number || op.order_number}
                      </Badge>
                    ))}
                </div>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nota Fiscal (NF)</Label>
                  <Input
                    value={nf}
                    onChange={(e) => setNf(e.target.value)}
                    placeholder="Número da NF"
                  />
                  {fieldErrors.nf && <p className="text-xs text-red-500">{fieldErrors.nf}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Transportadora</Label>
                  <Input
                    value={transportadora}
                    onChange={(e) => setTransportadora(e.target.value)}
                    placeholder="Nome da transportadora"
                  />
                  {fieldErrors.transportadora && (
                    <p className="text-xs text-red-500">{fieldErrors.transportadora}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Data de Saída</Label>
                  <Input
                    type="date"
                    value={dataSaida}
                    onChange={(e) => setDataSaida(e.target.value)}
                  />
                  {fieldErrors.data_saida && (
                    <p className="text-xs text-red-500">{fieldErrors.data_saida}</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ChevronLeft className="size-4 mr-1" />
                  Voltar
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  <Truck className="size-4 mr-1" />
                  {loading ? 'Processando...' : 'Confirmar Expedição'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showTotalAlert} onOpenChange={setShowTotalAlert}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <AlertTriangle className="size-5" />
              Atenção
            </DialogTitle>
            <DialogDescription className="pt-3 text-sm">
              {nonExpedicaoOps.length} OP(s) ainda não estão na Expedição. Deseja realmente sair com
              todos?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {nonExpedicaoOps.map((op) => (
              <div
                key={op.id}
                className="flex items-center gap-2 text-xs p-2 border border-red-200 dark:border-red-800 rounded bg-red-50/50 dark:bg-red-950/20"
              >
                <AlertTriangle className="size-3 text-red-500 shrink-0" />
                <span className="font-medium">{op.op_number || op.order_number}</span>
                <span className="text-muted-foreground">— etapa: {op.stage}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTotalAlert(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setShowTotalAlert(false)
                setStep(3)
              }}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
