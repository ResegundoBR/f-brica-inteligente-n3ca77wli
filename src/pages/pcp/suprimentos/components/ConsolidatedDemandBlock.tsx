import { Link2, Layers, AlertCircle, Calendar, Hash, ShoppingBag } from 'lucide-react'
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
      title={`Este item também é solicitado em outras ${opCount} OP(s) — Demanda extra: ${totalOtherQuantity} un`}
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
 * "🔗 Este item também é necessário em outras OPs"
 * Tabela com: Pedido, Nº da OP, Quantidade necessária (saldo) e Data de vencimento (delivery_date),
 * mais o total geral somado ao final (incluindo saldo atual + outras OPs).
 */
export function ConsolidatedDemandBlock({
  consolidation,
  currentItemLabel,
  onApplyTotal,
  applyButtonLabel = 'Adotar quantidade consolidada',
  className,
}: ConsolidatedDemandBlockProps) {
  if (!consolidation || consolidation.otherDemands.length === 0) return null

  const { currentBalance, otherDemands, totalOtherQuantity, totalConsolidatedQuantity } =
    consolidation

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
            <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wide text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
              <span>🔗 Este item também é necessário em outras OPs</span>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 border-amber-400 dark:border-amber-700 text-amber-900 dark:text-amber-300 font-semibold"
              >
                Consolidação de Demanda
              </Badge>
            </h4>
            <p className="text-[11px] text-amber-900/80 dark:text-amber-300/80 mt-0.5">
              O comprador pode adquirir tudo de uma só vez para atender a todas as OPs em aberto.
            </p>
          </div>
        </div>

        {onApplyTotal && (
          <button
            type="button"
            onClick={() => onApplyTotal(totalConsolidatedQuantity)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-600 hover:bg-amber-700 text-white transition shadow-xs"
          >
            <ShoppingBag className="size-3.5" />
            {applyButtonLabel} ({totalConsolidatedQuantity} un)
          </button>
        )}
      </div>

      {/* Tabela de Outras OPs */}
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
                <span className="text-slate-600 dark:text-slate-300 font-semibold">
                  {currentItemLabel || 'Esta solicitação atual'}
                </span>
              </TableCell>
              <TableCell className="text-right font-bold text-slate-800 dark:text-slate-100">
                {currentBalance} un
              </TableCell>
              <TableCell colSpan={2} className="text-[11px] text-muted-foreground">
                (demanda do item selecionado)
              </TableCell>
            </TableRow>

            {/* Linhas de outras OPs */}
            {otherDemands.map((demand: OtherOpDemandItem) => (
              <TableRow
                key={demand.shortageId}
                className="hover:bg-amber-50/40 dark:hover:bg-amber-950/20"
              >
                <TableCell className="font-semibold text-blue-600 dark:text-blue-400">
                  {demand.orderNumber}
                  {demand.clientName && (
                    <span className="block text-[10px] text-muted-foreground font-normal truncate max-w-[140px]">
                      {demand.clientName}
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-medium text-slate-700 dark:text-slate-300">
                  {demand.opNumber}
                </TableCell>
                <TableCell className="text-right font-bold text-amber-950 dark:text-amber-300">
                  {demand.quantity} un
                  {demand.receivedQuantity > 0 && (
                    <span className="block text-[10px] text-muted-foreground font-normal">
                      (saldo: {demand.quantity} de {demand.originalQuantity})
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-slate-700 dark:text-slate-300">
                  {formatDate(demand.deliveryDate)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {demand.status.replace('_', ' ')}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}

            {/* Linha de Total Geral Somado */}
            <TableRow className="bg-amber-100/70 dark:bg-amber-950/50 font-bold border-t-2 border-amber-300 dark:border-amber-800">
              <TableCell colSpan={2} className="text-amber-950 dark:text-amber-200 font-bold">
                TOTAL GERAL SOMADO (Esta solicitação + {otherDemands.length} outra(s) OP(s)):
              </TableCell>
              <TableCell className="text-right text-sm text-amber-950 dark:text-amber-200 font-extrabold">
                {totalConsolidatedQuantity} un
              </TableCell>
              <TableCell colSpan={2} className="text-[11px] text-amber-900/80 dark:text-amber-300">
                (+{totalOtherQuantity} un em outras OPs)
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
