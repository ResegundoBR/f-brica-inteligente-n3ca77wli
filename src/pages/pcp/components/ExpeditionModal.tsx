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
  Clock,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { extractFieldErrors, type FieldErrors } from '@/lib/pocketbase/errors'
import {
  calculateOrderDeliveryBalance,
  createDelivery,
  getDeliveriesForOrders,
} from '@/services/pcp-order-deliveries'
import { PcpOrderDelivery } from '@/types'

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
  const [quantitiesToShip, setQuantitiesToShip] = useState<Record<string, number>>({})
  const [quantityErrors, setQuantityErrors] = useState<Record<string, string>>({})
  const [opDeliveries, setOpDeliveries] = useState<Record<string, PcpOrderDelivery[]>>({})
  const [nf, setNf] = useState('')
  const [transportadora, setTransportadora] = useState('')
  const [dataSaida, setDataSaida] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [showTotalAlert, setShowTotalAlert] = useState(false)
  const { toast } = useToast()

  const buildSearchFilter = (term: string) => {
    const raw = term.trim()
    const cleanDigits = raw.replace(/\D/g, '')

    let orderNumCondition = `order_number="${raw}"`
    if (cleanDigits && cleanDigits !== raw) {
      orderNumCondition = `(order_number="${raw}" || order_number="${cleanDigits}")`
    }

    // Busca OPs não concluídas OU OPs concluídas com delivered_quantity=0 (sem expedição gravada)
    return `${orderNumCondition} && (status != "Concluído" || delivered_quantity = 0)`
  }

  const initializeOpsData = async (
    fetchedOps: any[],
  ): Promise<{
    validOps: any[]
    deliveriesMap: Record<string, PcpOrderDelivery[]>
  }> => {
    const opIds = fetchedOps.map((o) => o.id)
    let deliveriesMap: Record<string, PcpOrderDelivery[]> = {}
    try {
      deliveriesMap = await getDeliveriesForOrders(opIds)
      setOpDeliveries(deliveriesMap)
    } catch (e) {
      console.error('Erro ao buscar histórico de entregas', e)
    }

    // Regra (2) DESTRAVAR: OPs com status='Concluído' só entram se NÃO têm nenhuma entrega registrada
    // (delivered_quantity = 0 E sem registros em pcp_order_deliveries).
    // OPs com status != 'Concluído' entram normalmente.
    const validOps = fetchedOps.filter((op) => {
      if (op.status !== 'Concluído') return true
      const hasDelivs = (deliveriesMap[op.id] || []).length > 0
      const delivQty = Number(op.delivered_quantity) || 0
      return delivQty === 0 && !hasDelivs
    })

    const defaultQtys: Record<string, number> = {}
    validOps.forEach((op) => {
      // Se a OP está concluída mas sem expedição, seu saldo real pendente para expedir é a quantidade total
      const rawBalance = calculateOrderDeliveryBalance(op)
      const pendingQty =
        op.status === 'Concluído' && (Number(op.delivered_quantity) || 0) === 0
          ? op.quantity
          : rawBalance.pending

      defaultQtys[op.id] = pendingQty
    })
    setQuantitiesToShip(defaultQtys)
    setQuantityErrors({})

    return { validOps, deliveriesMap }
  }

  useEffect(() => {
    if (!open) return
    setStep(1)
    setOps([])
    setSelectedIds(new Set())
    setQuantitiesToShip({})
    setQuantityErrors({})
    setOpDeliveries({})
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
          filter: buildSearchFilter(initialOrderNumber),
          expand: 'product_id,client_id',
          sort: 'op_number',
        })
        .then(async (res) => {
          const { validOps } = await initializeOpsData(res)
          setOps(validOps)
          // Seleciona as OPs que estão em Expedição (ou OPs concluídas sem expedição resgatadas)
          setSelectedIds(
            new Set(
              validOps
                .filter(
                  (o: any) =>
                    o.stage === EXPEDICAO_STAGE ||
                    (o.status === 'Concluído' && (Number(o.delivered_quantity) || 0) === 0),
                )
                .map((o: any) => o.id),
            ),
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
        filter: buildSearchFilter(search),
        expand: 'product_id,client_id',
        sort: 'op_number',
      })
      .then(async (res) => {
        const { validOps } = await initializeOpsData(res)
        setOps(validOps)
        setSelectedIds(
          new Set(
            validOps
              .filter(
                (o: any) =>
                  o.stage === EXPEDICAO_STAGE ||
                  (o.status === 'Concluído' && (Number(o.delivered_quantity) || 0) === 0),
              )
              .map((o: any) => o.id),
          ),
        )
        setMode('partial')
        if (validOps.length === 0) {
          toast({
            title: 'Nenhuma OP encontrada',
            description: 'Não há OPs em aberto ou aguardando embarque para este pedido.',
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
    // No modo total, cada OP expedirá todo o saldo pendente restante
    const nextQtys = { ...quantitiesToShip }
    ops.forEach((op) => {
      const isConcluidoSemExpedicao =
        op.status === 'Concluído' &&
        (Number(op.delivered_quantity) || 0) === 0 &&
        (opDeliveries[op.id] || []).length === 0
      const balance = calculateOrderDeliveryBalance(op)
      nextQtys[op.id] = isConcluidoSemExpedicao ? op.quantity : balance.pending
    })
    setQuantitiesToShip(nextQtys)
    setQuantityErrors({})
  }

  const handleModePartial = () => {
    setMode('partial')
    setSelectedIds(
      new Set(
        ops
          .filter(
            (o) =>
              o.stage === EXPEDICAO_STAGE ||
              (o.status === 'Concluído' &&
                (Number(o.delivered_quantity) || 0) === 0 &&
                (opDeliveries[o.id] || []).length === 0),
          )
          .map((o) => o.id),
      ),
    )
  }

  const toggleOp = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setQuantityErrors((errs) => {
          const c = { ...errs }
          delete c[id]
          return c
        })
      } else {
        next.add(id)
        // se não tiver quantidade definida ou for 0, preenche com pendente
        const op = ops.find((o) => o.id === id)
        if (op) {
          const isConcluidoSemExpedicao =
            op.status === 'Concluído' &&
            (Number(op.delivered_quantity) || 0) === 0 &&
            (opDeliveries[op.id] || []).length === 0
          const balance = calculateOrderDeliveryBalance(op)
          const effPending = isConcluidoSemExpedicao ? op.quantity : balance.pending
          setQuantitiesToShip((q) => ({
            ...q,
            [id]: q[id] > 0 ? q[id] : effPending,
          }))
        }
      }
      return next
    })
  }

  const handleQuantityChange = (opId: string, valStr: string) => {
    const op = ops.find((o) => o.id === opId)
    if (!op) return
    const balance = calculateOrderDeliveryBalance(op)

    if (valStr === '') {
      setQuantitiesToShip((prev) => ({ ...prev, [opId]: 0 }))
      setQuantityErrors((prev) => ({ ...prev, [opId]: 'Informe a quantidade a expedir' }))
      return
    }

    const val = parseInt(valStr, 10)
    if (isNaN(val) || val <= 0) {
      setQuantitiesToShip((prev) => ({ ...prev, [opId]: 0 }))
      setQuantityErrors((prev) => ({ ...prev, [opId]: 'Quantidade deve ser maior que 0' }))
      return
    }

    const isConcluidoSemExpedicao =
      op.status === 'Concluído' &&
      (Number(op.delivered_quantity) || 0) === 0 &&
      (opDeliveries[op.id] || []).length === 0
    const maxPending = isConcluidoSemExpedicao ? op.quantity : balance.pending

    if (val > maxPending) {
      setQuantitiesToShip((prev) => ({ ...prev, [opId]: val }))
      setQuantityErrors((prev) => ({
        ...prev,
        [opId]: `Não é possível expedir mais que o pendente (${maxPending} un).`,
      }))
      return
    }

    setQuantitiesToShip((prev) => ({ ...prev, [opId]: val }))
    setQuantityErrors((prev) => {
      const c = { ...prev }
      delete c[opId]
      return c
    })
  }

  const getProductName = (op: any) =>
    op.op_type === 'Assistência'
      ? op.manual_product_name
      : op.op_type === 'Especial'
        ? op.manual_product_name || 'Produto Especial'
        : op.expand?.product_id?.name || 'S/Produto'

  const nonExpedicaoOps = ops.filter((o) => o.stage !== EXPEDICAO_STAGE)

  const validateStep2Quantities = (): boolean => {
    if (mode === 'total') return true
    const errors: Record<string, string> = {}
    let hasError = false

    selectedIds.forEach((id) => {
      const op = ops.find((o) => o.id === id)
      if (!op) return
      const isConcluidoSemExpedicao =
        op.status === 'Concluído' &&
        (Number(op.delivered_quantity) || 0) === 0 &&
        (opDeliveries[op.id] || []).length === 0
      const balance = calculateOrderDeliveryBalance(op)
      const maxPending = isConcluidoSemExpedicao ? op.quantity : balance.pending
      const qty = quantitiesToShip[id]

      if (!qty || qty <= 0) {
        errors[id] = 'Informe uma quantidade maior que 0'
        hasError = true
      } else if (qty > maxPending) {
        errors[id] = `Máximo permitido: ${maxPending} un.`
        hasError = true
      }
    })

    setQuantityErrors(errors)
    return !hasError
  }

  const handleNextFromStep2 = () => {
    if (!validateStep2Quantities()) {
      toast({
        title: 'Verifique as quantidades',
        description: 'Há quantidades inválidas ou superiores ao saldo pendente.',
        variant: 'destructive',
      })
      return
    }

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

    if (!validateStep2Quantities()) {
      toast({
        title: 'Quantidades inválidas',
        description: 'Volte para a etapa anterior e corrija as quantidades.',
        variant: 'destructive',
      })
      setStep(2)
      return
    }

    setLoading(true)
    try {
      const selectedOps = ops.filter((o) => selectedIds.has(o.id))
      const opSummaryList: string[] = []

      for (const op of selectedOps) {
        const isConcluidoSemExpedicao =
          op.status === 'Concluído' &&
          (Number(op.delivered_quantity) || 0) === 0 &&
          (opDeliveries[op.id] || []).length === 0
        const balance = calculateOrderDeliveryBalance(op)
        const basePending = isConcluidoSemExpedicao ? op.quantity : balance.pending
        const baseDelivered = isConcluidoSemExpedicao ? 0 : balance.delivered
        const qtyToShip = mode === 'total' ? basePending : quantitiesToShip[op.id] || basePending
        const newDelivered = baseDelivered + qtyToShip
        const isComplete = newDelivered >= op.quantity

        opSummaryList.push(
          `${op.op_number || op.order_number} (${qtyToShip}/${op.quantity}${isComplete ? ' - CONCLUÍDA' : ` - Saldo: ${op.quantity - newDelivered}`})`,
        )

        // 1. Registrar a entrega na coleção pcp_order_deliveries
        await createDelivery({
          order_id: op.id,
          quantity: qtyToShip,
          nf: nf.trim(),
          transportadora: transportadora.trim(),
          data_saida: dataSaida,
          notes: isComplete
            ? `Expedição final (${qtyToShip} un)`
            : `Expedição parcial (${qtyToShip} un de ${op.quantity})`,
        })

        // 2. Atualizar a OP (se concluído atinge o total, fecha a OP; senão mantém aberta)
        const updatePayload: any = {
          delivered_quantity: newDelivered,
          nf: nf.trim(),
          transportadora: transportadora.trim(),
        }
        if (dataSaida) {
          try {
            const parsed = new Date(dataSaida)
            if (!isNaN(parsed.getTime())) {
              updatePayload.data_saida = parsed.toISOString()
            }
          } catch {
            /* intentionally ignored */
          }
        }

        if (isComplete) {
          updatePayload.status = 'Concluído'
          updatePayload.finished_at = new Date().toISOString()
        } else {
          // Se não concluiu e a OP tem finished_at residual inconsistente, limpa
          if (op.finished_at) {
            updatePayload.finished_at = null
          }
        }

        await pb.collection('pcp_orders').update(op.id, updatePayload)

        // 3. Registrar log detalhado
        const logAction = isComplete
          ? 'Expedição total (OP Concluída)'
          : 'Expedição parcial registrada'
        const logDetails = `NF: ${nf.trim()} | Transportadora: ${transportadora.trim()} | Data: ${dataSaida} | Qtd expedida: ${qtyToShip} | Saldo: expedido ${newDelivered}/${op.quantity} — pendente ${Math.max(0, op.quantity - newDelivered)}`

        await pb.collection('pcp_order_logs').create({
          order_id: op.id,
          stage: 'Expedição',
          action: logAction,
          details: logDetails,
          user_id: pb.authStore.record?.id,
        })
      }

      toast({
        title: 'Expedição registrada com sucesso!',
        description: `${selectedOps.length} OP(s) processada(s). ${opSummaryList.join('; ')}`,
      })
      onOpenChange(false)
    } catch (err: any) {
      console.error('Erro ao registrar expedição:', err)
      const errs = extractFieldErrors(err)
      setFieldErrors(errs)

      // Monta mensagem de erro detalhada campo a campo se houver
      let errorMsg = ''
      const fieldEntries = Object.entries(errs)
      if (fieldEntries.length > 0) {
        errorMsg = fieldEntries
          .map(([k, v]) => {
            const fieldLabel =
              k === 'nf'
                ? 'Nota Fiscal'
                : k === 'transportadora'
                  ? 'Transportadora'
                  : k === 'data_saida'
                    ? 'Data de Saída'
                    : k === 'quantity'
                      ? 'Quantidade'
                      : k === 'order_id'
                        ? 'Ordem de Produção'
                        : k
            return `${fieldLabel}: ${v}`
          })
          .join(' | ')
      } else if (err?.data?.message) {
        errorMsg = err.data.message
      } else if (err?.message) {
        errorMsg = err.message
      } else {
        errorMsg = 'Falha inesperada ao comunicar com o servidor.'
      }

      toast({
        title: 'Erro ao registrar expedição',
        description: errorMsg,
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
                Digite o número do pedido para buscar todas as OPs em aberto ou aguardando embarque.
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
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                {ops.length === 0 && (
                  <p className="text-sm text-center text-muted-foreground py-4">
                    Nenhuma OP em aberto ou aguardando embarque encontrada para este pedido.
                  </p>
                )}
                {ops.map((op) => {
                  const isConcluidoSemExpedicao =
                    op.status === 'Concluído' &&
                    (Number(op.delivered_quantity) || 0) === 0 &&
                    (opDeliveries[op.id] || []).length === 0
                  const isInExpedicao = op.stage === EXPEDICAO_STAGE || isConcluidoSemExpedicao
                  const balance = calculateOrderDeliveryBalance(op)
                  // Para OP concluída sem expedição resgatada, o saldo pendente a expedir é a quantidade total
                  const effectivePending = isConcluidoSemExpedicao ? op.quantity : balance.pending
                  const effectiveDelivered = isConcluidoSemExpedicao ? 0 : balance.delivered
                  const isSelected = selectedIds.has(op.id)
                  const hasDeliveries = (opDeliveries[op.id] || []).length > 0
                  const errMessage = quantityErrors[op.id]

                  return (
                    <div
                      key={op.id}
                      className={cn(
                        'flex flex-col gap-2 p-3 border rounded-lg transition-colors',
                        isConcluidoSemExpedicao
                          ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/20'
                          : isInExpedicao
                            ? 'border-green-400 bg-green-50/40 dark:bg-green-950/20'
                            : 'border-red-400 bg-red-50/40 dark:bg-red-950/20',
                        isSelected && 'ring-2 ring-blue-500/30',
                      )}
                    >
                      <div
                        className={cn(
                          'flex items-center gap-3',
                          mode === 'partial' && 'cursor-pointer',
                        )}
                        onClick={() => mode === 'partial' && toggleOp(op.id)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleOp(op.id)}
                          disabled={mode === 'total'}
                          className={
                            isConcluidoSemExpedicao
                              ? 'border-amber-500 data-[state=checked]:bg-amber-500'
                              : isInExpedicao
                                ? 'border-green-500 data-[state=checked]:bg-green-500'
                                : 'border-red-500'
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isConcluidoSemExpedicao ? (
                              <Clock className="size-3.5 text-amber-600 shrink-0" />
                            ) : isInExpedicao ? (
                              <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />
                            ) : (
                              <AlertTriangle className="size-3.5 text-red-500 shrink-0" />
                            )}
                            <Package className="size-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium text-sm truncate">
                              {getProductName(op)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                            <span className="text-muted-foreground">OP: {op.op_number || '-'}</span>
                            <span className="text-muted-foreground">Qtd Total: {op.quantity}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] h-4',
                                isConcluidoSemExpedicao
                                  ? 'border-amber-300 text-amber-800 dark:text-amber-300'
                                  : isInExpedicao
                                    ? 'border-green-300 text-green-700 dark:text-green-300'
                                    : 'border-red-300 text-red-700 dark:text-red-300',
                              )}
                            >
                              {op.stage}
                            </Badge>
                            {isConcluidoSemExpedicao && (
                              <Badge
                                variant="outline"
                                className="text-[10px] h-4 border-amber-400 bg-amber-100/80 text-amber-900 font-semibold dark:bg-amber-950/40 dark:text-amber-300"
                              >
                                Aguarda embarque — concluída sem expedição
                              </Badge>
                            )}
                            <Badge
                              variant="secondary"
                              className={cn(
                                'text-[10px] h-4 font-semibold',
                                effectiveDelivered > 0
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                              )}
                            >
                              Expedido {effectiveDelivered}/{op.quantity} — pendente{' '}
                              {effectivePending}
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

                      {/* Controle de quantidade a expedir no modo parcial ou informativo no modo total */}
                      {isSelected && (
                        <div
                          className="mt-1 pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-2">
                            <Label
                              htmlFor={`qty-${op.id}`}
                              className="text-xs font-semibold whitespace-nowrap"
                            >
                              Qtd a expedir:
                            </Label>
                            {mode === 'partial' ? (
                              <div className="flex items-center gap-1.5">
                                <Input
                                  id={`qty-${op.id}`}
                                  type="number"
                                  min={1}
                                  max={effectivePending}
                                  value={quantitiesToShip[op.id] ?? effectivePending}
                                  onChange={(e) => handleQuantityChange(op.id, e.target.value)}
                                  className={cn(
                                    'h-7 w-20 text-xs px-2',
                                    errMessage && 'border-red-500 focus-visible:ring-red-500',
                                  )}
                                />
                                <span className="text-xs text-muted-foreground">
                                  / {effectivePending} un pendente(s)
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                {effectivePending} un (todo o saldo pendente)
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            {(() => {
                              const shipQty =
                                mode === 'total' ? effectivePending : quantitiesToShip[op.id] || 0
                              const remaining = Math.max(0, effectivePending - shipQty)
                              return (
                                <span className="text-[11px] text-muted-foreground">
                                  {remaining === 0 ? (
                                    <span className="text-green-600 dark:text-green-400 font-medium">
                                      Concluirá a OP
                                    </span>
                                  ) : (
                                    <span>
                                      Saldo restante:{' '}
                                      <strong className="text-foreground">{remaining} un</strong>
                                    </span>
                                  )}
                                </span>
                              )
                            })()}
                          </div>
                        </div>
                      )}

                      {isSelected && errMessage && (
                        <p className="text-xs text-red-600 dark:text-red-400 font-medium pl-1">
                          ⚠️ {errMessage}
                        </p>
                      )}

                      {/* Histórico prévio de entregas da OP se houver */}
                      {hasDeliveries && (
                        <div className="mt-1 bg-slate-100/70 dark:bg-slate-900/60 p-2 rounded text-[11px] space-y-1">
                          <span className="font-semibold text-muted-foreground flex items-center gap-1">
                            <Clock className="size-3" /> Entregas anteriores (
                            {opDeliveries[op.id].length}):
                          </span>
                          <div className="space-y-0.5">
                            {opDeliveries[op.id].map((deliv) => (
                              <div
                                key={deliv.id}
                                className="flex items-center justify-between text-muted-foreground"
                              >
                                <span>
                                  <strong>{deliv.quantity} un</strong>
                                  {deliv.nf ? ` | NF: ${deliv.nf}` : ''}
                                  {deliv.transportadora ? ` | ${deliv.transportadora}` : ''}
                                </span>
                                <span>
                                  {deliv.data_saida
                                    ? format(new Date(deliv.data_saida), 'dd/MM/yyyy')
                                    : format(new Date(deliv.created), 'dd/MM/yyyy')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
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
                <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto">
                  {ops
                    .filter((o) => selectedIds.has(o.id))
                    .map((op) => {
                      const isConcluidoSemExpedicao =
                        op.status === 'Concluído' &&
                        (Number(op.delivered_quantity) || 0) === 0 &&
                        (opDeliveries[op.id] || []).length === 0
                      const balance = calculateOrderDeliveryBalance(op)
                      const effPending = isConcluidoSemExpedicao ? op.quantity : balance.pending
                      const effDelivered = isConcluidoSemExpedicao ? 0 : balance.delivered
                      const shipQty =
                        mode === 'total' ? effPending : quantitiesToShip[op.id] || effPending
                      const isComplete = effDelivered + shipQty >= op.quantity

                      return (
                        <div
                          key={op.id}
                          className="flex items-center justify-between text-xs p-1.5 rounded bg-white dark:bg-slate-950 border"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Badge variant="secondary" className="text-[10px]">
                              {op.op_number || op.order_number}
                            </Badge>
                            <span className="truncate text-muted-foreground">
                              {getProductName(op)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="font-semibold text-foreground">
                              Expedir: {shipQty} un
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              (de {op.quantity})
                            </span>
                            {isComplete ? (
                              <Badge
                                variant="outline"
                                className="text-[9px] h-4 bg-green-50 text-green-700 border-green-300 dark:bg-green-950/30 dark:text-green-300"
                              >
                                Total / Conclui
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[9px] h-4 bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/30 dark:text-blue-300"
                              >
                                Parcial (resta {op.quantity - (balance.delivered + shipQty)})
                              </Badge>
                            )}
                          </div>
                        </div>
                      )
                    })}
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
