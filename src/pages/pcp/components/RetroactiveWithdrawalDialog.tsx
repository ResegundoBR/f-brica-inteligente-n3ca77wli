import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { NoTranslate } from '@/components/NoTranslate'
import {
  getClosedOrdersWithinWindow,
  getOpBomWithWithdrawalComparison,
  createRetroactiveWithdrawalRequest,
  RETROACTIVE_WITHDRAWAL_WINDOW_DAYS,
} from '@/services/retroactive-withdrawals'
import { normalizeSearchText } from '@/lib/pcp-utils'
import type { PcpOrder, RetroactiveBomItem } from '@/types'
import {
  History,
  Search,
  PackageCheck,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Calendar,
  X,
  FileSpreadsheet,
} from 'lucide-react'

interface RetroactiveWithdrawalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRequestSuccess?: () => void
}

export function RetroactiveWithdrawalDialog({
  open,
  onOpenChange,
  onRequestSuccess,
}: RetroactiveWithdrawalDialogProps) {
  const { toast } = useToast()
  const { user } = useAuth()

  // Passo atual: 1 = Buscar OP encerrada, 2 = BOM e seleção de componente / quantidade / motivo, 3 = Confirmar
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Passo 1: OPs encerradas
  const [closedOrders, setClosedOrders] = useState<PcpOrder[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [orderSearchQuery, setOrderSearchQuery] = useState('')
  const [selectedOp, setSelectedOp] = useState<PcpOrder | null>(null)

  // Passo 2: BOM da OP selecionada
  const [bomItems, setBomItems] = useState<RetroactiveBomItem[]>([])
  const [loadingBom, setLoadingBom] = useState(false)
  const [selectedBomItem, setSelectedBomItem] = useState<RetroactiveBomItem | null>(null)
  const [bomSearchQuery, setBomSearchQuery] = useState('')

  // Campos do formulário
  const [quantityInput, setQuantityInput] = useState('1')
  const [reasonInput, setReasonInput] = useState('')

  // Submissão
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Carregar OPs encerradas ao abrir
  useEffect(() => {
    if (!open) {
      setStep(1)
      setSelectedOp(null)
      setSelectedBomItem(null)
      setOrderSearchQuery('')
      setBomSearchQuery('')
      setQuantityInput('1')
      setReasonInput('')
      return
    }

    let isMounted = true
    setLoadingOrders(true)
    getClosedOrdersWithinWindow(RETROACTIVE_WITHDRAWAL_WINDOW_DAYS)
      .then((records) => {
        if (isMounted) {
          setClosedOrders(records)
          setLoadingOrders(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setLoadingOrders(false)
          toast({
            title: 'Erro ao carregar OPs encerradas',
            description: err.message,
            variant: 'destructive',
          })
        }
      })

    return () => {
      isMounted = false
    }
  }, [open, toast])

  // OPs filtradas pela busca
  const filteredOrders = useMemo(() => {
    const q = normalizeSearchText(orderSearchQuery.trim())
    if (!q) return closedOrders

    return closedOrders.filter((op) => {
      const orderNum = normalizeSearchText(op.order_number || '')
      const opNum = normalizeSearchText(op.op_number || '')
      const client = normalizeSearchText(op.client_name || '')
      const product = normalizeSearchText(
        op.manual_product_name || (op.expand?.product_id as any)?.name || '',
      )
      return orderNum.includes(q) || opNum.includes(q) || client.includes(q) || product.includes(q)
    })
  }, [closedOrders, orderSearchQuery])

  // Carregar BOM ao selecionar OP
  const handleSelectOp = async (op: PcpOrder) => {
    setSelectedOp(op)
    setSelectedBomItem(null)
    setQuantityInput('1')
    setReasonInput('')
    setLoadingBom(true)
    setStep(2)

    try {
      const items = await getOpBomWithWithdrawalComparison(op.id)
      setBomItems(items)
      // Se houver apenas 1 item, pré-selecionar
      if (items.length === 1) {
        setSelectedBomItem(items[0])
        setQuantityInput(String(items[0].suggestedMaxQty > 0 ? items[0].suggestedMaxQty : 1))
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar composição (BOM)',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoadingBom(false)
    }
  }

  // BOM filtrada
  const filteredBomItems = useMemo(() => {
    const q = normalizeSearchText(bomSearchQuery.trim())
    if (!q) return bomItems

    return bomItems.filter((item) => {
      const code = normalizeSearchText(item.code || '')
      const desc = normalizeSearchText(item.description || '')
      return code.includes(q) || desc.includes(q)
    })
  }, [bomItems, bomSearchQuery])

  const parsedQty = parseFloat(quantityInput.replace(',', '.'))
  const numQty = isNaN(parsedQty) ? 0 : parsedQty

  const handleSelectBomItem = (item: RetroactiveBomItem) => {
    setSelectedBomItem(item)
    // Sugere a quantidade = max(0, engenharia - baixado), ou 1 se zero
    const suggested = item.suggestedMaxQty > 0 ? item.suggestedMaxQty : 1
    setQuantityInput(String(suggested))
  }

  const handleProceedToStep3 = () => {
    if (!selectedBomItem) {
      toast({
        title: 'Selecione um componente',
        description: 'Escolha um item da BOM da OP para solicitar a baixa retroativa.',
        variant: 'destructive',
      })
      return
    }
    if (numQty <= 0) {
      toast({
        title: 'Quantidade inválida',
        description: 'Informe uma quantidade maior que zero.',
        variant: 'destructive',
      })
      return
    }
    if (!reasonInput.trim()) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Descreva detalhadamente o motivo da baixa retroativa.',
        variant: 'destructive',
      })
      return
    }
    setStep(3)
  }

  const handleConfirmRequest = async () => {
    if (!selectedOp || !selectedBomItem || !user) return

    setIsSubmitting(true)
    try {
      await createRetroactiveWithdrawalRequest(
        {
          order_id: selectedOp.id,
          order_number: selectedOp.order_number || '-',
          material_code: selectedBomItem.code,
          material_description: selectedBomItem.description,
          unit: selectedBomItem.unit,
          quantity: numQty,
          reason: reasonInput.trim(),
          inventory_id: selectedBomItem.inventoryId,
        },
        user.id,
      )

      toast({
        title: 'Solicitação enviada com sucesso!',
        description: `Baixa retroativa de ${numQty} ${selectedBomItem.unit} de "${selectedBomItem.description}" para a OP ${selectedOp.op_number || selectedOp.order_number} encaminhada para aprovação do PCP.`,
      })

      onRequestSuccess?.()
      onOpenChange(false)
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar solicitação',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const isExceedingCeiling = selectedBomItem !== null && numQty > selectedBomItem.suggestedMaxQty

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100%-1.5rem)] max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b bg-slate-50/90 dark:bg-slate-900/90">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <History className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black">
                  Solicitar Baixa Retroativa em OP Encerrada
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Passo {step} de 3 — {step === 1 && 'Buscar Ordem de Produção concluída'}
                  {step === 2 && 'Selecionar componente da BOM e informar motivo'}
                  {step === 3 && 'Revisão e confirmação da solicitação'}
                </DialogDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className="text-xs font-bold border-amber-400 text-amber-700 dark:text-amber-300"
            >
              Janela: {RETROACTIVE_WITHDRAWAL_WINDOW_DAYS} dias
            </Badge>
          </div>

          {/* Stepper horizontal */}
          <div className="flex items-center gap-2 pt-2">
            <div
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                step >= 1 ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-800'
              }`}
            />
            <div
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                step >= 2 ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-800'
              }`}
            />
            <div
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                step >= 3 ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-800'
              }`}
            />
          </div>
        </DialogHeader>

        {/* Conteúdo rolável */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* PASSO 1: SELEÇÃO DA OP ENCERRADA */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Calendar className="size-4 text-amber-600" />
                  Apenas OPs concluídas nos últimos {RETROACTIVE_WITHDRAWAL_WINDOW_DAYS} dias
                </p>
                <p className="text-[11px] leading-relaxed">
                  Utilize a busca abaixo para localizar a OP concluída em que componentes do estoque
                  físico foram utilizados sem a devida baixa durante a produção.
                </p>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  placeholder="Buscar por número do pedido, OP, cliente ou produto..."
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  className="pl-9 pr-9 h-11 text-sm"
                  autoFocus
                />
                {orderSearchQuery && (
                  <button
                    onClick={() => setOrderSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {loadingOrders ? (
                <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <Loader2 className="size-7 animate-spin text-amber-600" />
                  <span className="text-xs">Carregando OPs encerradas...</span>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 space-y-1">
                  <p className="font-semibold text-sm">Nenhuma OP encerrada encontrada.</p>
                  <p className="text-xs">
                    {orderSearchQuery
                      ? 'Tente outro termo de busca.'
                      : `Não há OPs concluídas nos últimos ${RETROACTIVE_WITHDRAWAL_WINDOW_DAYS} dias.`}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {filteredOrders.map((op) => {
                    const productName =
                      op.manual_product_name ||
                      (op.expand?.product_id as any)?.name ||
                      'Produto sob medida / Linha'
                    const clientName = op.client_name || '-'
                    const finishDate = op.finished_at
                      ? new Date(op.finished_at).toLocaleDateString('pt-BR')
                      : op.updated
                        ? new Date(op.updated).toLocaleDateString('pt-BR')
                        : '-'

                    return (
                      <button
                        key={op.id}
                        type="button"
                        onClick={() => handleSelectOp(op)}
                        className="w-full text-left p-3.5 rounded-lg border bg-card hover:bg-amber-50/40 dark:hover:bg-amber-950/20 hover:border-amber-400/80 transition-all flex items-center justify-between gap-3 group"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-black text-sm text-foreground">
                              Pedido {op.order_number}
                            </span>
                            {op.op_number && (
                              <Badge variant="secondary" className="font-mono text-xs font-bold">
                                OP {op.op_number}
                              </Badge>
                            )}
                            <Badge className="bg-emerald-600 text-white text-[10px] font-bold">
                              Concluída em {finishDate}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            Cliente: <strong className="text-foreground">{clientName}</strong>
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                            <NoTranslate text={productName} />
                          </p>
                        </div>
                        <ArrowRight className="size-5 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* PASSO 2: BOM E PREENCHIMENTO */}
          {step === 2 && selectedOp && (
            <div className="space-y-4">
              {/* Header da OP Selecionada */}
              <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    OP Selecionada
                  </span>
                  <p className="text-sm font-black text-foreground">
                    Pedido {selectedOp.order_number}{' '}
                    {selectedOp.op_number ? `| OP ${selectedOp.op_number}` : ''} —{' '}
                    {selectedOp.client_name}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(1)}
                  className="text-xs h-8 text-amber-700 hover:text-amber-800"
                >
                  Trocar OP
                </Button>
              </div>

              {/* Lista da BOM pré-carregada */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <FileSpreadsheet className="size-4 text-amber-600" />
                    Selecione o Componente da BOM *
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    {bomItems.length} componente(s) cadastrado(s)
                  </span>
                </div>

                {loadingBom ? (
                  <div className="py-8 flex flex-col items-center justify-center text-muted-foreground gap-2 border rounded-lg">
                    <Loader2 className="size-6 animate-spin text-amber-600" />
                    <span className="text-xs">Carregando BOM e movimentações anteriores...</span>
                  </div>
                ) : bomItems.length === 0 ? (
                  <div className="p-4 rounded-lg border border-dashed text-center text-xs text-muted-foreground space-y-1">
                    <p className="font-semibold text-foreground">
                      Esta OP não possui itens registrados em pcp_order_materials.
                    </p>
                    <p>Caso precise de baixa de item avulso, consulte o gestor do PCP.</p>
                  </div>
                ) : (
                  <>
                    {bomItems.length > 5 && (
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
                        <Input
                          placeholder="Filtrar componentes da BOM..."
                          value={bomSearchQuery}
                          onChange={(e) => setBomSearchQuery(e.target.value)}
                          className="pl-8 h-8 text-xs"
                        />
                      </div>
                    )}

                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto border rounded-lg p-1.5 bg-slate-50/50 dark:bg-slate-900/30">
                      {filteredBomItems.map((item) => {
                        const isSelected =
                          selectedBomItem?.description === item.description &&
                          selectedBomItem?.code === item.code
                        return (
                          <button
                            key={`${item.code}-${item.description}`}
                            type="button"
                            onClick={() => handleSelectBomItem(item)}
                            className={`w-full text-left p-2.5 rounded-md border transition-all text-xs flex items-center justify-between gap-2 ${
                              isSelected
                                ? 'bg-amber-100/70 border-amber-500 text-amber-950 dark:bg-amber-950/40 dark:border-amber-500 dark:text-amber-100 font-medium shadow-xs'
                                : 'bg-card border-border hover:bg-accent'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              {item.code && (
                                <span className="font-mono font-bold text-amber-700 dark:text-amber-400 mr-1.5">
                                  [{item.code}]
                                </span>
                              )}
                              <NoTranslate text={item.description} className="font-semibold" />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-muted-foreground">
                                BOM: <strong>{item.engineeringQty}</strong> | Baixado:{' '}
                                <strong>{item.alreadyWithdrawnQty}</strong>
                              </span>
                              <Badge
                                variant={item.suggestedMaxQty > 0 ? 'secondary' : 'outline'}
                                className="text-[10px] font-bold"
                              >
                                Teto: {item.suggestedMaxQty} {item.unit}
                              </Badge>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Componente Selecionado & Campos */}
              {selectedBomItem && (
                <div className="p-3.5 rounded-xl border-2 border-amber-400/80 bg-amber-50/30 dark:bg-amber-950/10 space-y-3">
                  <div className="flex items-center justify-between gap-2 border-b border-amber-200 dark:border-amber-900/50 pb-2">
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-300">
                        Item para Baixa
                      </span>
                      <p className="text-sm font-bold text-foreground">
                        {selectedBomItem.code ? `[${selectedBomItem.code}] ` : ''}
                        <NoTranslate text={selectedBomItem.description} />
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                        Teto Sugerido (BOM − Baixado)
                      </span>
                      <span className="text-sm font-black text-amber-700 dark:text-amber-300">
                        {selectedBomItem.suggestedMaxQty} {selectedBomItem.unit}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1 sm:col-span-1">
                      <Label htmlFor="retro-qty" className="text-xs font-semibold">
                        Quantidade a Baixar *
                      </Label>
                      <Input
                        id="retro-qty"
                        type="number"
                        step="any"
                        min="0.001"
                        value={quantityInput}
                        onChange={(e) => setQuantityInput(e.target.value)}
                        className="h-10 text-sm font-bold"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="retro-reason" className="text-xs font-semibold">
                        Motivo da Baixa Retroativa (Obrigatório) *
                      </Label>
                      <Textarea
                        id="retro-reason"
                        placeholder="Ex: Componente esquecido de dar baixa durante a montagem física da OP..."
                        value={reasonInput}
                        onChange={(e) => setReasonInput(e.target.value)}
                        className="min-h-[70px] text-xs"
                      />
                    </div>
                  </div>

                  {/* Aviso visual se quantidade exceder o teto (não-bloqueante mas destacado) */}
                  {isExceedingCeiling && (
                    <div className="p-2.5 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200 text-xs flex items-start gap-2">
                      <AlertTriangle className="size-4 shrink-0 text-red-600 mt-0.5" />
                      <div>
                        <strong className="block">
                          Aviso: Quantidade solicitada supera o teto sugerido!
                        </strong>
                        <span>
                          A quantidade ({numQty} {selectedBomItem.unit}) é maior que a diferença
                          restante da engenharia ({selectedBomItem.suggestedMaxQty}{' '}
                          {selectedBomItem.unit}). O gestor do PCP verá um alerta vermelho ao
                          analisar.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* PASSO 3: REVISÃO E CONFIRMAÇÃO */}
          {step === 3 && selectedOp && selectedBomItem && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-900 space-y-3">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-sm">
                  <CheckCircle2 className="size-5" />
                  Confirmação dos Dados da Solicitação
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-1 border-t">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">
                      Ordem de Produção:
                    </span>
                    <strong className="text-foreground">
                      Pedido {selectedOp.order_number}{' '}
                      {selectedOp.op_number ? `| OP ${selectedOp.op_number}` : ''}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Cliente:</span>
                    <strong className="text-foreground">{selectedOp.client_name}</strong>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-[11px]">Componente:</span>
                    <strong className="text-foreground">
                      {selectedBomItem.code ? `[${selectedBomItem.code}] ` : ''}
                      <NoTranslate text={selectedBomItem.description} />
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">
                      Quantidade Solicitada:
                    </span>
                    <strong className="text-base text-amber-600 dark:text-amber-400">
                      {numQty} {selectedBomItem.unit}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">
                      Teto Sugerido (BOM − Baixado):
                    </span>
                    <strong className="text-foreground">
                      {selectedBomItem.suggestedMaxQty} {selectedBomItem.unit}
                    </strong>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-[11px]">
                      Motivo do Operador:
                    </span>
                    <p className="p-2.5 rounded-md bg-white dark:bg-slate-800 border text-foreground whitespace-pre-wrap leading-relaxed mt-0.5">
                      {reasonInput.trim()}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-[11px]">Solicitante:</span>
                    <strong className="text-foreground">{user?.name || user?.email}</strong>
                  </div>
                </div>

                {isExceedingCeiling && (
                  <div className="p-2.5 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200 text-xs flex items-center gap-2">
                    <AlertTriangle className="size-4 shrink-0 text-red-600" />
                    <span>
                      Atenção: A solicitação será sinalizada em vermelho para o PCP por exceder o
                      teto.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé de navegação */}
        <DialogFooter className="p-4 border-t bg-slate-50/80 dark:bg-slate-900/80 gap-2 sm:gap-0">
          {step === 1 && (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          )}

          {step === 2 && (
            <div className="flex items-center justify-between w-full">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep(1)}
                className="gap-1.5"
              >
                <ArrowLeft className="size-4" /> Voltar
              </Button>
              <Button
                type="button"
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1.5"
                disabled={!selectedBomItem || numQty <= 0 || !reasonInput.trim()}
                onClick={handleProceedToStep3}
              >
                Avançar para Confirmação <ArrowRight className="size-4" />
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="flex items-center justify-between w-full">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                onClick={() => setStep(2)}
                className="gap-1.5"
              >
                <ArrowLeft className="size-4" /> Voltar
              </Button>
              <Button
                type="button"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2"
                disabled={isSubmitting}
                onClick={handleConfirmRequest}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Enviando...
                  </>
                ) : (
                  <>
                    <PackageCheck className="size-4" /> Confirmar e Enviar para PCP
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
