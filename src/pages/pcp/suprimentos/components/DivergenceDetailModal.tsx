import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle,
  Clock,
  Layers,
  Info,
  Calendar,
  FileText,
  Package,
  Hash,
  Sliders,
} from 'lucide-react'
import { NoTranslate } from '@/components/NoTranslate'
import type { DivergenceItem } from '@/services/suprimentos-integrity'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface DivergenceDetailModalProps {
  divergence: DivergenceItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onActionClick?: (divergence: DivergenceItem) => void
}

export function DivergenceDetailModal({
  divergence,
  open,
  onOpenChange,
  onActionClick,
}: DivergenceDetailModalProps) {
  if (!divergence) return null

  const details = divergence.details || {}
  const batchMembers = divergence.batch_members || []
  const hasAction =
    divergence.category === 'recebimento_acima_demanda' ||
    divergence.category === 'solicitacao_fantasma_op_encerrada' ||
    divergence.category === 'saldo_estoque_incoerente'

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—'
    try {
      const d = new Date(isoString.replace(' ', 'T'))
      return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    } catch {
      return isoString
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <FileText className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-lg font-bold">
                Detalhes da Divergência de Integridade
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Rastreamento e histórico do registro no sistema
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 text-xs">
          {/* Card Principal: Gravidade e Status */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                Gravidade
              </span>
              <div className="mt-1">
                {divergence.severity === 'alta' && (
                  <Badge className="bg-red-500/15 text-red-700 border-red-300 dark:text-red-400 font-semibold gap-1">
                    <AlertTriangle className="size-3" /> Alta
                  </Badge>
                )}
                {divergence.severity === 'media' && (
                  <Badge className="bg-amber-500/15 text-amber-700 border-amber-300 dark:text-amber-400 font-semibold gap-1">
                    <Clock className="size-3" /> Média
                  </Badge>
                )}
                {divergence.severity === 'baixa' && (
                  <Badge className="bg-blue-500/15 text-blue-700 border-blue-300 dark:text-blue-400 font-semibold gap-1">
                    <Info className="size-3" /> Informativa
                  </Badge>
                )}
              </div>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                Tipo do Registro
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200 mt-1 block">
                {divergence.item_type === 'material_shortage' && 'Falta de Material (Shortage)'}
                {divergence.item_type === 'inventory' && 'Item de Inventário'}
                {divergence.item_type === 'component' && 'Componente'}
                {divergence.item_type !== 'material_shortage' &&
                  divergence.item_type !== 'inventory' &&
                  divergence.item_type !== 'component' &&
                  divergence.item_type}
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                Status Atual
              </span>
              <Badge variant="outline" className="font-semibold mt-1">
                {divergence.record_status || '—'}
              </Badge>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                Data do Registro
              </span>
              <span className="text-slate-700 dark:text-slate-300 mt-1 block">
                {formatDate(divergence.record_created || divergence.detected_at)}
              </span>
            </div>
          </div>

          {/* Dados de Identificação */}
          <div className="p-3.5 rounded-lg border space-y-2.5">
            <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 border-b pb-1.5">
              <Package className="size-4 text-blue-600" />
              Identificação do Material
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-slate-500 font-semibold uppercase block text-[11px]">
                  Código do Item:
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm">
                  <NoTranslate text={divergence.code || 'S/ Código'} />
                </span>
              </div>

              <div>
                <span className="text-slate-500 font-semibold uppercase block text-[11px]">
                  OP / Pedido de Origem:
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {divergence.op_number ? (
                    `OP ${divergence.op_number}`
                  ) : (
                    <span className="text-slate-400 font-normal">Sem OP vinculada (Estoque)</span>
                  )}
                  {divergence.order_number && (
                    <span className="ml-1.5 text-xs text-slate-500 font-normal">
                      (Pedido {divergence.order_number})
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div>
              <span className="text-slate-500 font-semibold uppercase block text-[11px]">
                Descrição Mestra:
              </span>
              <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                <NoTranslate text={divergence.description || '—'} />
              </p>
            </div>

            {divergence.batch_id && (
              <div className="pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Layers className="size-3.5 text-indigo-600" />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Lote Consolidado:
                  </span>
                  <span className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400">
                    {divergence.batch_id}
                  </span>
                </div>

                {batchMembers.length > 0 && (
                  <div className="mt-2 pl-2 border-l-2 border-indigo-200 dark:border-indigo-900 space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500 block">
                      Membros do Lote ({batchMembers.length}):
                    </span>
                    <div className="space-y-1">
                      {batchMembers.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between text-[11px] py-1 px-2 rounded bg-slate-50 dark:bg-slate-800/40"
                        >
                          <span>
                            {m.op_number ? `OP ${m.op_number}` : 'Estoque'} · Solicitado:{' '}
                            {m.quantity} un · Recebido: {m.received_quantity} un
                          </span>
                          <Badge variant="outline" className="text-[10px] py-0">
                            {m.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Problema e Sugestão */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border border-red-200 bg-red-50/40 dark:bg-red-950/20 dark:border-red-900 space-y-1">
              <span className="font-semibold text-red-800 dark:text-red-300 flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 text-red-600" /> Problema Identificado
              </span>
              <p className="text-red-900 dark:text-red-200 text-xs leading-relaxed">
                {divergence.problem}
              </p>
            </div>

            <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900 space-y-1">
              <span className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <Info className="size-3.5 text-emerald-600" /> Sugestão de Correção
              </span>
              <p className="text-emerald-900 dark:text-emerald-200 text-xs leading-relaxed">
                {divergence.suggestion}
              </p>
            </div>
          </div>

          {/* Dados Técnicos e Valores */}
          {Object.keys(details).length > 0 && (
            <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/40 space-y-1.5">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 text-[11px] uppercase">
                <Hash className="size-3 text-slate-500" /> Parâmetros de Auditoria
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {details.received_quantity !== undefined && (
                  <div>
                    <span className="text-slate-500 block text-[11px]">Qtd. Recebida:</span>
                    <strong className="text-slate-800 dark:text-slate-200">
                      {String(details.received_quantity)} un
                    </strong>
                  </div>
                )}
                {details.registered_quantity !== undefined && (
                  <div>
                    <span className="text-slate-500 block text-[11px]">Qtd. Registrada:</span>
                    <strong className="text-slate-800 dark:text-slate-200">
                      {String(details.registered_quantity)} un
                    </strong>
                  </div>
                )}
                {details.op_demand !== undefined && (
                  <div>
                    <span className="text-slate-500 block text-[11px]">Demanda Real OP:</span>
                    <strong className="text-emerald-700 dark:text-emerald-400">
                      {String(details.op_demand)} un
                    </strong>
                  </div>
                )}
                {details.surplus_quantity !== undefined && (
                  <div>
                    <span className="text-slate-500 block text-[11px]">Excedente:</span>
                    <strong className="text-red-700 dark:text-red-400">
                      {String(details.surplus_quantity)} un
                    </strong>
                  </div>
                )}
                {details.inventory_quantity !== undefined && (
                  <div>
                    <span className="text-slate-500 block text-[11px]">Saldo Cadastrado:</span>
                    <strong className="text-slate-800 dark:text-slate-200">
                      {String(details.inventory_quantity)} un
                    </strong>
                  </div>
                )}
                {details.calculated_balance !== undefined && (
                  <div>
                    <span className="text-slate-500 block text-[11px]">Saldo Calculado:</span>
                    <strong className="text-emerald-700 dark:text-emerald-400">
                      {String(details.calculated_balance)} un
                    </strong>
                  </div>
                )}
                {details.movements_count !== undefined && (
                  <div>
                    <span className="text-slate-500 block text-[11px]">Total Movimentos:</span>
                    <strong className="text-slate-800 dark:text-slate-200">
                      {String(details.movements_count)}
                    </strong>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 pt-2 sm:justify-between">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>

          {hasAction && onActionClick && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onOpenChange(false)
                onActionClick(divergence)
              }}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              <Sliders className="size-3.5" />
              Executar Ação de Correção
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
