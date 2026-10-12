import { useState } from 'react'
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
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  PackagePlus,
  RefreshCw,
  Sliders,
  XCircle,
} from 'lucide-react'
import { NoTranslate } from '@/components/NoTranslate'
import {
  fixDivergence,
  type DivergenceItem,
  type FixDivergenceParams,
} from '@/services/suprimentos-integrity'
import { useToast } from '@/hooks/use-toast'

interface FixDivergenceDialogProps {
  divergence: DivergenceItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function FixDivergenceDialog({
  divergence,
  open,
  onOpenChange,
  onSuccess,
}: FixDivergenceDialogProps) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [activeTab, setActiveTab] = useState<'surplus_to_stock' | 'adjust_record'>(
    'surplus_to_stock',
  )
  const [reason, setReason] = useState<string>('')

  // Campos para ajuste de registro manual
  const [editQuantity, setEditQuantity] = useState<string>('')
  const [editReceivedQuantity, setEditReceivedQuantity] = useState<string>('')

  // Inicializa valores ao abrir
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && divergence) {
      const details = divergence.details || {}
      const targetDem = Number(details.op_demand) || 0
      const regQty = Number(details.registered_quantity) || 0
      const recvQty = Number(details.received_quantity) || 0

      setReason('')
      setActiveTab('surplus_to_stock')
      setEditQuantity(String(targetDem > 0 ? targetDem : regQty))
      setEditReceivedQuantity(String(targetDem > 0 ? targetDem : recvQty))
    }
    onOpenChange(isOpen)
  }

  if (!divergence) return null

  const details = divergence.details || {}
  const receivedQty = Number(details.received_quantity) || 0
  const opDemand = Number(details.op_demand) || 0
  const surplusQty =
    divergence.details?.surplus_quantity !== undefined
      ? Number(divergence.details.surplus_quantity)
      : Math.max(0, receivedQty - opDemand)

  const isRecvAboveDemand = divergence.category === 'recebimento_acima_demanda'
  const isGhostOp = divergence.category === 'solicitacao_fantasma_op_encerrada'
  const isBalanceMismatch = divergence.category === 'saldo_estoque_incoerente'

  // Executa destinação ao estoque
  const handleDestinarExcedente = async () => {
    if (!divergence) return
    setSubmitting(true)
    try {
      const params: FixDivergenceParams = {
        action: 'destinar_excedente_estoque',
        record_id: divergence.record_id,
        target_quantity: opDemand,
        reason: reason.trim() || undefined,
      }
      const res = await fixDivergence(params)
      toast({
        title: 'Excedente destinado com sucesso!',
        description: res.message,
      })
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao destinar excedente ao estoque.'
      toast({
        variant: 'destructive',
        title: 'Erro na operação',
        description: msg,
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Executa correção direta de registro
  const handleCorrigirRegistro = async () => {
    if (!divergence) return
    const q = Number(editQuantity)
    const r = Number(editReceivedQuantity)

    if (isNaN(q) || q < 0) {
      toast({
        variant: 'destructive',
        title: 'Quantidade inválida',
        description: 'Informe uma quantidade válida maior ou igual a zero.',
      })
      return
    }
    if (isNaN(r) || r < 0) {
      toast({
        variant: 'destructive',
        title: 'Quantidade recebida inválida',
        description: 'Informe uma quantidade recebida válida maior ou igual a zero.',
      })
      return
    }
    if (r > q + 0.0001) {
      toast({
        variant: 'destructive',
        title: 'Quantidade incoerente',
        description: `A quantidade recebida (${r}) não pode ser maior que a quantidade do registro (${q}).`,
      })
      return
    }

    setSubmitting(true)
    try {
      const params: FixDivergenceParams = {
        action: 'corrigir_registro',
        record_id: divergence.record_id,
        quantity: q,
        received_quantity: r,
        reason: reason.trim() || undefined,
      }
      const res = await fixDivergence(params)
      toast({
        title: 'Registro corrigido!',
        description: res.message,
      })
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao corrigir registro.'
      toast({
        variant: 'destructive',
        title: 'Erro na operação',
        description: msg,
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Executa cancelamento de solicitação fantasma
  const handleCancelarSolicitacao = async () => {
    if (!divergence) return
    setSubmitting(true)
    try {
      const params: FixDivergenceParams = {
        action: 'cancelar_solicitacao',
        record_id: divergence.record_id,
        reason: reason.trim() || undefined,
      }
      const res = await fixDivergence(params)
      toast({
        title: 'Solicitação cancelada!',
        description: res.message,
      })
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao cancelar solicitação.'
      toast({
        variant: 'destructive',
        title: 'Erro na operação',
        description: msg,
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Executa alinhamento de saldo do estoque
  const handleAjustarSaldoEstoque = async () => {
    if (!divergence) return
    setSubmitting(true)
    try {
      const calculatedBal = Number(details.calculated_balance)
      const params: FixDivergenceParams = {
        action: 'ajustar_saldo_estoque',
        record_id: divergence.record_id,
        target_balance: isNaN(calculatedBal) ? undefined : calculatedBal,
        reason: reason.trim() || undefined,
      }
      const res = await fixDivergence(params)
      toast({
        title: 'Saldo de estoque ajustado!',
        description: res.message,
      })
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao ajustar saldo de estoque.'
      toast({
        variant: 'destructive',
        title: 'Erro na operação',
        description: msg,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              <Sliders className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-lg font-bold">
                {isRecvAboveDemand && 'Correção de Recebimento Excedente'}
                {isGhostOp && 'Cancelar Solicitação de OP Encerrada'}
                {isBalanceMismatch && 'Ajustar Saldo Físico do Estoque'}
                {!isRecvAboveDemand &&
                  !isGhostOp &&
                  !isBalanceMismatch &&
                  'Correção de Divergência'}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Ação auditada com registro de operador, data e valores reais.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Resumo do Item */}
        <div className="rounded-lg border bg-slate-50 dark:bg-slate-900/60 p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-semibold uppercase">Item:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                <NoTranslate text={divergence.code || 'S/ Código'} />
              </span>
            </div>
            {divergence.op_number && (
              <Badge variant="outline" className="font-semibold text-slate-700 dark:text-slate-300">
                OP {divergence.op_number}
              </Badge>
            )}
          </div>
          <div className="text-slate-700 dark:text-slate-300">
            <span className="text-slate-500 font-semibold uppercase mr-1.5">Descrição:</span>
            <NoTranslate text={divergence.description || '—'} />
          </div>
          <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 font-medium">
            {divergence.problem}
          </div>
        </div>

        {/* CASO 1: RECEBIDO ACIMA DA DEMANDA */}
        {isRecvAboveDemand && (
          <div className="space-y-4 pt-1">
            {/* Abas de Opção */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('surplus_to_stock')}
                className={`py-2 px-3 rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === 'surplus_to_stock'
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <PackagePlus className="size-3.5" />
                Destinar Excedente ao Estoque
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('adjust_record')}
                className={`py-2 px-3 rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === 'adjust_record'
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Sliders className="size-3.5" />
                Corrigir Registro da Falta
              </button>
            </div>

            {activeTab === 'surplus_to_stock' ? (
              <div className="space-y-3 p-3.5 rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900 text-xs text-slate-700 dark:text-slate-300">
                <div className="font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-blue-600 shrink-0" />
                  O que esta ação fará:
                </div>
                <ul className="list-disc list-inside space-y-1 pl-1 text-slate-600 dark:text-slate-400">
                  <li>
                    Ajustará a solicitação da OP {divergence.op_number || ''} para{' '}
                    <strong className="text-slate-800 dark:text-slate-100">{opDemand} un</strong>{' '}
                    (demanda real da OP) e marcará como recebida exatamente nesta quantidade.
                  </li>
                  <li>
                    Lançará uma{' '}
                    <strong className="text-slate-800 dark:text-slate-100">Entrada</strong> auditada
                    de <strong className="text-emerald-600 font-bold">{surplusQty} un</strong> no
                    item de inventário físico correspondente.
                  </li>
                  <li>
                    Gravará auditoria completa no histórico com seu usuário, data e detalhes da
                    reconciliação.
                  </li>
                  <li className="text-[11px] text-amber-700 dark:text-amber-400">
                    Regra inviolável: nenhum outro registro de solicitação será alterado
                    silenciosamente.
                  </li>
                </ul>

                <div className="pt-2">
                  <Label htmlFor="reason-input" className="text-xs font-semibold text-slate-600">
                    Observação adicional (opcional):
                  </Label>
                  <Textarea
                    id="reason-input"
                    placeholder="Ex: Mercadoria recebida fisicamente e conferida na fábrica..."
                    className="mt-1 text-xs resize-none h-16"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>

                <div className="pt-2">
                  <Button
                    type="button"
                    onClick={handleDestinarExcedente}
                    disabled={submitting}
                    className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  >
                    {submitting ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <PackagePlus className="size-4" />
                    )}
                    Confirmar Destinação de {surplusQty} un ao Estoque
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 p-3.5 rounded-lg border bg-slate-50 dark:bg-slate-900/40 text-xs">
                <p className="text-slate-600 dark:text-slate-400">
                  Ajuste diretamente as quantidades registradas para alinhar aos valores reais
                  conferidos.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Quantidade Solicitada
                    </Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      className="mt-1 text-xs"
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Quantidade Recebida
                    </Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      className="mt-1 text-xs"
                      value={editReceivedQuantity}
                      onChange={(e) => setEditReceivedQuantity(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="reason-manual" className="text-xs font-semibold text-slate-600">
                    Motivo da correção (opcional):
                  </Label>
                  <Textarea
                    id="reason-manual"
                    placeholder="Ex: Correção de digitação na quantidade de entrada..."
                    className="mt-1 text-xs resize-none h-16"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>

                <div className="pt-2">
                  <Button
                    type="button"
                    onClick={handleCorrigirRegistro}
                    disabled={submitting}
                    className="w-full gap-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold"
                  >
                    {submitting ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Salvar Correção Auditada
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CASO 2: SOLICITAÇÃO FANTASMA DE OP ENCERRADA */}
        {isGhostOp && (
          <div className="space-y-4 pt-1">
            <div className="p-3.5 rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900 text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold text-red-800 dark:text-red-300">
                <AlertTriangle className="size-4 text-red-600 shrink-0" />
                Confirmação de Cancelamento
              </div>
              <p className="text-slate-600 dark:text-slate-400">
                Esta solicitação está aberta em status{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {divergence.record_status || 'Aberto'}
                </strong>
                , porém a OP de origem{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {divergence.op_number ? `OP ${divergence.op_number}` : ''}
                </strong>{' '}
                já foi concluída ou cancelada.
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                O cancelamento será registrado com auditoria (usuário e data), liberando a fila de
                compras sem gerar retrabalho.
              </p>

              <div className="pt-2">
                <Label htmlFor="ghost-reason" className="text-xs font-semibold text-slate-600">
                  Motivo do cancelamento (opcional):
                </Label>
                <Textarea
                  id="ghost-reason"
                  placeholder="Ex: OP finalizada sem necessidade desta sobra..."
                  className="mt-1 text-xs resize-none h-16 bg-white dark:bg-slate-900"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>

            <Button
              type="button"
              onClick={handleCancelarSolicitacao}
              disabled={submitting}
              className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold"
            >
              {submitting ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <XCircle className="size-4" />
              )}
              Confirmar Cancelamento da Solicitação
            </Button>
          </div>
        )}

        {/* CASO 3: SALDO DE ESTOQUE DIVERGENTE DO EXTRATO */}
        {isBalanceMismatch && (
          <div className="space-y-4 pt-1">
            <div className="p-3.5 rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900 text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                Alinhar Saldo com a Soma dos Movimentos
              </div>
              <p className="text-slate-600 dark:text-slate-400">
                Saldo atual cadastrado:{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {Number(details.inventory_quantity) || 0} un
                </strong>
                .
                <br />
                Saldo calculado pela soma cronológica das entradas e saídas:{' '}
                <strong className="text-emerald-700 dark:text-emerald-400">
                  {Number(details.calculated_balance) || 0} un
                </strong>
                .
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                Um movimento auditado de Ajuste será lançado para conciliar o saldo físico com o
                extrato.
              </p>

              <div className="pt-2">
                <Label htmlFor="stock-reason" className="text-xs font-semibold text-slate-600">
                  Observação do ajuste (opcional):
                </Label>
                <Textarea
                  id="stock-reason"
                  placeholder="Ex: Conciliação com extrato físico..."
                  className="mt-1 text-xs resize-none h-16 bg-white dark:bg-slate-900"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>

            <Button
              type="button"
              onClick={handleAjustarSaldoEstoque}
              disabled={submitting}
              className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            >
              {submitting ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Alinhar Saldo para {Number(details.calculated_balance) || 0} un
            </Button>
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
