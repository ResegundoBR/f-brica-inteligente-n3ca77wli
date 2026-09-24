import { useState } from 'react'
import {
  Link2,
  Layers,
  AlertCircle,
  Calendar,
  Hash,
  ShoppingBag,
  Box,
  Lightbulb,
  ExternalLink,
} from 'lucide-react'
import { OpMaterialsSummaryModal, OpModalTarget } from './OpMaterialsSummaryModal'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { format, parseISO, isValid } from 'date-fns'
import { ItemDemandConsolidation, OtherOpDemandItem } from '@/services/material-consolidation'
import { cn } from '@/lib/utils'

interface ConsolidatedDemandBadgeProps {
  consolidation?: ItemDemandConsolidation | null
  className?: string
  onClick?: (e: React.MouseEvent) => void
}

/**
 * Badge resumido para o cartão ou linha da tabela:
 * ex.: "🔗 +12 un em outras OPs" ou "+12 un em 2 OPs"
 */
export function ConsolidatedDemandBadge({
  consolidation,
  className,
  onClick,
}: ConsolidatedDemandBadgeProps) {
  if (!consolidation || consolidation.otherDemands.length === 0) return null

  const { totalOtherQuantity, otherDemands } = consolidation
  const opCount = otherDemands.length
  const label = `🔗 +${totalOtherQuantity} un em ${opCount === 1 ? 'outra OP' : `${opCount} outras OPs`}`

  return (
    <Badge
      variant="secondary"
      onClick={onClick}
      title={`Este item também é demandado em outras ${opCount} OP(s) — Demanda extra: ${totalOtherQuantity} un`}
      className={cn(
        'inline-flex items-center gap-1 font-semibold text-[11px] bg-amber-100 text-amber-900 hover:bg-amber-200 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800 transition-colors',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {label}
    </Badge>
  )
}

interface ConsolidatedDemandBlockProps {
  consolidation?: ItemDemandConsolidation | null
  currentItemLabel?: string
  itemDescription?: string
  itemCode?: string
  onApplyTotal?: (suggestedQty: number) => void
  applyButtonLabel?: string
  className?: string
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-'
  try {
    const d = parseISO(dateStr)
    return isValid(d) ? format(d, 'dd/MM/yyyy') : dateStr.slice(0, 10)
  } catch {
    return dateStr.slice(0, 10)
  }
}

/**
 * Bloco destacado:
 * "🔗 Consolidação de Demanda & Necessidades Futuras"
 * Tabela com: Pedido, Nº da OP, Tipo (Solicitação aberta vs Necessidade futura),
 * Quantidade necessária (saldo) e Data de vencimento (delivery_date),
 * mais estoque atual (Total / Reservado / Disponível) e sugestão de compra inteligente.
 */
export function ConsolidatedDemandBlock({
  consolidation,
  currentItemLabel,
  itemDescription,
  itemCode,
  onApplyTotal,
  applyButtonLabel = 'Adotar quantidade consolidada',
  className,
}: ConsolidatedDemandBlockProps) {
  const [selectedOpTarget, setSelectedOpTarget] = useState<OpModalTarget | null>(null)
  const [opModalOpen, setOpModalOpen] = useState(false)

  if (!consolidation || consolidation.otherDemands.length === 0) return null

  const {
    currentBalance,
    otherDemands,
    totalOtherQuantity,
    totalConsolidatedQuantity,
    totalOpenShortagesQuantity = 0,
    totalFutureDemandsQuantity = 0,
    stockInfo,
  } = consolidation

  const openShortageItems = otherDemands.filter((d) => d.demandType !== 'necessidade_futura')
  const futureDemandItems = otherDemands.filter((d) => d.demandType === 'necessidade_futura')

  const handleOpenOpModal = (demand: OtherOpDemandItem) => {
    setSelectedOpTarget({
      orderId: demand.orderId,
      opNumber: demand.opNumber,
      orderNumber: demand.orderNumber,
      clientName: demand.clientName,
      productName: demand.productName,
      deliveryDate: demand.deliveryDate,
    })
    setOpModalOpen(true)
  }

  // Título e código formatado para o cabeçalho do bloco
  const headerItemTitle = [
    itemCode ? itemCode.trim() : null,
    itemDescription ? itemDescription.trim().toUpperCase() : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={cn(
        'rounded-lg border border-amber-300 bg-amber-50/70 p-3.5 sm:p-4 text-slate-800 shadow-xs dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-slate-200',
        className,
      )}
    >
      {/* Cabeçalho do Bloco */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-amber-200 dark:border-amber-800/60">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-amber-200/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 shrink-0">
            <Link2 className="size-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wide text-amber-950 dark:text-amber-100 flex items-center gap-1.5 flex-wrap">
              <span>🔗 Este item também é necessário em outras OPs</span>
              {headerItemTitle && (
                <span
                  className="font-mono font-semibold text-amber-900 dark:text-amber-200 text-xs px-1.5 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900/50 notranslate"
                  translate="no"
                >
                  {headerItemTitle}
                </span>
              )}
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 border-amber-400 dark:border-amber-700 text-amber-900 dark:text-amber-300 font-semibold"
              >
                Consolidação de Demanda
              </Badge>
            </h4>
            <p className="text-[11px] text-amber-900/80 dark:text-amber-300/80 mt-0.5">
              Consolidação aditiva: solicitações em aberto + necessidades futuras de engenharia em
              OPs ativas.
            </p>
          </div>
        </div>

        {onApplyTotal && (
          <button
            type="button"
            onClick={() => onApplyTotal(totalConsolidatedQuantity)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-600 hover:bg-amber-700 text-white transition shadow-xs cursor-pointer"
          >
            <ShoppingBag className="size-3.5" />
            {applyButtonLabel} ({totalConsolidatedQuantity} un)
          </button>
        )}
      </div>

      {/* Bloco informativo de Estoque & Sugestão de Compra (quando disponível) */}
      {stockInfo && (
        <div className="mt-3 p-2.5 rounded-md border border-amber-200/90 bg-white/80 dark:bg-slate-900/80 dark:border-amber-800/50 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Box className="size-4 text-amber-700 dark:text-amber-400 shrink-0" />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-muted-foreground">Estoque do item:</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Total:{' '}
                <strong className="notranslate" translate="no">
                  {stockInfo.totalStock} {stockInfo.unit}
                </strong>
              </span>
              <span className="text-slate-400">|</span>
              <span className="font-medium text-amber-800 dark:text-amber-300">
                Reservado:{' '}
                <strong className="notranslate" translate="no">
                  {stockInfo.reservedStock} {stockInfo.unit}
                </strong>
              </span>
              <span className="text-slate-400">|</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                Disponível:{' '}
                <strong className="notranslate" translate="no">
                  {stockInfo.availableStock} {stockInfo.unit}
                </strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-100/80 dark:bg-amber-900/40 border border-amber-300/80 dark:border-amber-700 text-amber-950 dark:text-amber-200 font-semibold">
            <Lightbulb className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              Sugestão:{' '}
              <span
                className="font-bold text-amber-900 dark:text-amber-100 notranslate"
                translate="no"
              >
                comprar {stockInfo.suggestedPurchaseQty} {stockInfo.unit}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Tabela de Outras OPs e Demandas Futuras */}
      <div className="mt-3 overflow-hidden rounded-md border border-amber-200/80 bg-white dark:border-amber-900/40 dark:bg-slate-900">
        <Table>
          <TableHeader className="bg-amber-100/50 dark:bg-amber-950/40 text-[11px]">
            <TableRow>
              <TableHead className="w-[120px] font-bold text-amber-950 dark:text-amber-200">
                <span className="inline-flex items-center gap-1">
                  <Hash className="size-3" /> Pedido
                </span>
              </TableHead>
              <TableHead className="w-[110px] font-bold text-amber-950 dark:text-amber-200">
                <span className="inline-flex items-center gap-1">
                  <Layers className="size-3" /> Nº da OP
                </span>
              </TableHead>
              <TableHead className="w-[130px] font-bold text-amber-950 dark:text-amber-200">
                Tipo
              </TableHead>
              <TableHead className="text-right w-[110px] font-bold text-amber-950 dark:text-amber-200">
                Qtde Necessária
              </TableHead>
              <TableHead className="w-[120px] font-bold text-amber-950 dark:text-amber-200">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3" /> Data de Vencimento
                </span>
              </TableHead>
              <TableHead className="w-[90px] font-bold text-amber-950 dark:text-amber-200">
                Status OP
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-xs">
            {/* Linha da solicitação atual (referência) */}
            <TableRow className="bg-slate-50/70 dark:bg-slate-800/40 font-medium text-muted-foreground border-b border-amber-100 dark:border-slate-800">
              <TableCell colSpan={2}>
                <span
                  className="text-slate-600 dark:text-slate-300 font-semibold notranslate"
                  translate="no"
                >
                  {currentItemLabel || 'Esta solicitação atual'}
                </span>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className="text-[10px] px-1 py-0 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                >
                  Contexto Atual
                </Badge>
              </TableCell>
              <TableCell
                className="text-right font-bold text-slate-800 dark:text-slate-100 notranslate"
                translate="no"
              >
                {currentBalance} un
              </TableCell>
              <TableCell colSpan={2} className="text-[11px] text-muted-foreground">
                (demanda do contexto selecionado)
              </TableCell>
            </TableRow>

            {/* Linhas de outras OPs */}
            {otherDemands.map((demand: OtherOpDemandItem) => {
              const isFuture = demand.demandType === 'necessidade_futura'
              return (
                <TableRow
                  key={demand.shortageId}
                  className={cn(
                    'hover:bg-amber-50/40 dark:hover:bg-amber-950/20',
                    isFuture && 'bg-blue-50/20 dark:bg-blue-950/10',
                  )}
                >
                  <TableCell
                    className="font-semibold text-blue-600 dark:text-blue-400 notranslate"
                    translate="no"
                  >
                    <span className="block font-semibold">{demand.orderNumber}</span>
                    {demand.clientName && (
                      <span
                        className="block text-[10px] text-muted-foreground font-normal truncate max-w-[170px] notranslate leading-tight mt-0.5"
                        translate="no"
                        title={demand.clientName}
                      >
                        {demand.clientName}
                      </span>
                    )}
                    {demand.productName && (
                      <span
                        className="block text-[10px] text-muted-foreground font-normal truncate max-w-[170px] notranslate leading-tight mt-0.5 italic"
                        translate="no"
                        title={demand.productName}
                      >
                        {demand.productName}
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    className="font-medium text-slate-700 dark:text-slate-300 notranslate"
                    translate="no"
                  >
                    {demand.opNumber && demand.opNumber !== '-' ? (
                      <button
                        type="button"
                        onClick={() => handleOpenOpModal(demand)}
                        title={`Clique para ver componentes da OP ${demand.opNumber}`}
                        className="inline-flex items-center gap-1 font-mono font-bold text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-200 underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer transition-colors"
                      >
                        <span>{demand.opNumber}</span>
                        <ExternalLink className="size-2.5 opacity-70" />
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isFuture ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 font-medium bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800"
                        title="Item previsto na engenharia da OP em andamento, sem solicitação aberta criada"
                      >
                        Necessidade futura (sem solicitação)
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 font-medium bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
                      >
                        Solicitação em aberto
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-right font-bold text-amber-950 dark:text-amber-300 notranslate"
                    translate="no"
                  >
                    {demand.quantity} un
                    {demand.receivedQuantity > 0 && (
                      <span
                        className="block text-[10px] text-muted-foreground font-normal notranslate"
                        translate="no"
                      >
                        (saldo: {demand.quantity} de {demand.originalQuantity})
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-slate-700 dark:text-slate-300 notranslate"
                    translate="no"
                  >
                    {formatDate(demand.deliveryDate)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {demand.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })}

            {/* Subtotais por tipo (quando houver ambos ou demanda futura) */}
            {(openShortageItems.length > 0 || futureDemandItems.length > 0) && (
              <TableRow className="bg-amber-50/50 dark:bg-amber-950/30 text-[11px] text-muted-foreground border-t border-amber-200 dark:border-amber-800/60">
                <TableCell colSpan={3} className="py-1.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>
                      Solicitações em aberto:{' '}
                      <strong
                        className="text-slate-800 dark:text-slate-200 notranslate"
                        translate="no"
                      >
                        +{totalOpenShortagesQuantity} un
                      </strong>{' '}
                      ({openShortageItems.length} OP{openShortageItems.length === 1 ? '' : 's'})
                    </span>
                    <span>•</span>
                    <span>
                      Necessidades futuras:{' '}
                      <strong
                        className="text-blue-700 dark:text-blue-300 notranslate"
                        translate="no"
                      >
                        +{totalFutureDemandsQuantity} un
                      </strong>{' '}
                      ({futureDemandItems.length} OP{futureDemandItems.length === 1 ? '' : 's'})
                    </span>
                  </div>
                </TableCell>
                <TableCell
                  className="text-right font-semibold text-slate-700 dark:text-slate-300 notranslate"
                  translate="no"
                >
                  +{totalOtherQuantity} un
                </TableCell>
                <TableCell colSpan={2} className="text-[10px] italic">
                  (subtotal outras OPs)
                </TableCell>
              </TableRow>
            )}

            {/* Linha de Total Geral Somado */}
            <TableRow className="bg-amber-100/70 dark:bg-amber-950/50 font-bold border-t-2 border-amber-300 dark:border-amber-800">
              <TableCell colSpan={3} className="text-amber-950 dark:text-amber-200 font-bold">
                TOTAL GERAL SOMADO (Saldo atual + {otherDemands.length} outra(s) OP(s)):
              </TableCell>
              <TableCell
                className="text-right text-sm text-amber-950 dark:text-amber-200 font-extrabold notranslate"
                translate="no"
              >
                {totalConsolidatedQuantity} un
              </TableCell>
              <TableCell
                colSpan={2}
                className="text-[11px] text-amber-900/80 dark:text-amber-300 notranslate"
                translate="no"
              >
                (+{totalOtherQuantity} un em outras demandas)
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {futureDemandItems.length > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1 italic">
          <AlertCircle className="size-3.5 text-blue-500 shrink-0" />
          <span>
            Necessidades futuras são apenas informativas e não geram registros de solicitação
            automaticamente.
          </span>
        </p>
      )}

      {/* Modal de Componentes da OP clicada */}
      <OpMaterialsSummaryModal
        open={opModalOpen}
        onOpenChange={setOpModalOpen}
        target={selectedOpTarget}
      />
    </div>
  )
}
