import { useState, useMemo, Fragment } from 'react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { NoTranslate } from '@/components/NoTranslate'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MaterialShortage, OrdemCompra, OrdemCompraItem } from '@/types'
import {
  CheckCircle,
  Layers,
  ChevronDown,
  ChevronRight,
  Warehouse,
  Package,
  FileText,
} from 'lucide-react'
import { cn, formatQuantity } from '@/lib/utils'
import { SupplierGroupSection } from './SupplierGroupSection'

export interface RecebimentoDisplayItem {
  type: 'batch' | 'single'
  id: string
  representative: MaterialShortage
  items: MaterialShortage[]
  opItems: MaterialShortage[]
  surplusItem?: MaterialShortage
  totalQuantity: number
  opQuantity: number
  surplusQuantity: number
  receivedQuantity: number
  supplier: string
  expectedDate?: string
  createdDate: string
  code: string
  description: string
  status: string
  linkedOc?: OrdemCompra
}

/**
 * Agrupa itens para exibição no Recebimento:
 * Registros de material_shortages com o MESMO batch_id são agrupados em UMA ÚNICA LINHA DE LOTE,
 * exibindo a QUANTIDADE REAL comprada (da ordem de compra / batch_info — ex.: 17 un),
 * e NÃO a soma de registros desatualizados ou duplicados.
 */
export function buildRecebimentoDisplayItems(
  items: MaterialShortage[],
  shortageToOcMap?: Map<string, OrdemCompra>,
): RecebimentoDisplayItem[] {
  // Blindagem: agrupa por batch_id + code (nunca consolida códigos diferentes na mesma linha)
  const batchMap = new Map<string, MaterialShortage[]>()
  const nonBatch: MaterialShortage[] = []

  for (const item of items) {
    if (item.batch_id) {
      const codeKey = (item.code || '').trim().toLowerCase()
      const descKey = (item.description || '').trim().toLowerCase()
      const groupKey = `${item.batch_id}___${codeKey || descKey}`
      const existing = batchMap.get(groupKey)
      if (existing) {
        existing.push(item)
      } else {
        batchMap.set(groupKey, [item])
      }
    } else {
      nonBatch.push(item)
    }
  }

  const result: RecebimentoDisplayItem[] = []

  // Processa os lotes agrupados por batch_id + code
  for (const [, batchItems] of batchMap.entries()) {
    const batchId = batchItems[0].batch_id || ''
    const parent = batchItems.find((it) => it.batch_info?.is_batch_parent) || batchItems[0]

    // Candidatos a excedente
    const surplusCandidates = batchItems.filter(
      (it) =>
        !it.order_id &&
        (it.observation?.includes('Compra para estoque') ||
          it.id === parent.batch_info?.surplus_shortage_id),
    )
    // Escolhe o excedente oficial (prioriza o do batch_info ou o último ativo)
    const surplusItem =
      surplusCandidates.find((it) => it.id === parent.batch_info?.surplus_shortage_id) ||
      surplusCandidates[surplusCandidates.length - 1]

    const opItems = batchItems.filter((it) => Boolean(it.order_id) && it.id !== surplusItem?.id)

    const opQuantity = opItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0)
    const surplusQuantity = surplusItem
      ? Number(surplusItem.quantity) || 0
      : Number(parent.batch_info?.surplus_quantity) || 0

    // Quantidade real comprada (ex.: 17 un na OC 38.911)
    const totalQuantity = parent.batch_info?.actual_quantity || opQuantity + surplusQuantity

    const receivedQuantity = batchItems.reduce(
      (acc, it) => acc + (Number(it.received_quantity) || 0),
      0,
    )

    const supplier =
      parent.supplier ||
      parent.batch_info?.supplier ||
      batchItems.find((it) => it.supplier)?.supplier ||
      '-'

    const expectedDate =
      parent.expected_date ||
      parent.batch_info?.expected_date ||
      batchItems.find((it) => it.expected_date)?.expected_date

    const status =
      receivedQuantity > 0 && receivedQuantity < totalQuantity
        ? 'Recebido_Parcial'
        : receivedQuantity >= totalQuantity && totalQuantity > 0
          ? 'Recebido'
          : parent.status || 'Compra'

    const linkedOc = shortageToOcMap ? shortageToOcMap.get(parent.id) : undefined

    result.push({
      type: 'batch',
      id: batchId,
      representative: parent,
      items: batchItems,
      opItems,
      surplusItem,
      totalQuantity,
      opQuantity,
      surplusQuantity,
      receivedQuantity,
      supplier,
      expectedDate,
      createdDate: parent.created,
      code: parent.code || '',
      description: parent.description,
      status,
      linkedOc,
    })
  }

  // Processa itens individuais normais
  for (const item of nonBatch) {
    const qty = Number(item.quantity) || 0
    const rcvd = Number(item.received_quantity) || 0
    const linkedOc = shortageToOcMap ? shortageToOcMap.get(item.id) : undefined

    result.push({
      type: 'single',
      id: item.id,
      representative: item,
      items: [item],
      opItems: item.order_id ? [item] : [],
      surplusItem: !item.order_id ? item : undefined,
      totalQuantity: qty,
      opQuantity: item.order_id ? qty : 0,
      surplusQuantity: !item.order_id ? qty : 0,
      receivedQuantity: rcvd,
      supplier: item.supplier || '-',
      expectedDate: item.expected_date,
      createdDate: item.created,
      code: item.code || '',
      description: item.description,
      status: item.status,
      linkedOc,
    })
  }

  // Ordena por data decrescente
  result.sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime())

  return result
}

export interface OcItemDisplayRow {
  type: 'shortage' | 'standalone'
  id: string
  code: string
  description: string
  purchasedQty: number
  receivedQty: number
  saldoQty: number
  shortage?: MaterialShortage
  ocItem: OrdemCompraItem
  opLabel?: string
  clientName?: string
  isBatch?: boolean
  opItems?: MaterialShortage[]
  surplusQuantity?: number
  hasPendingOpDemand?: boolean
  isSurplusOnly?: boolean
}

export interface OcGroupedRecebimento {
  oc: OrdemCompra
  supplier: string
  expectedDate?: string
  totalItemsCount: number // Total de itens nesta OC (inclui avulsos)
  receivedItemsCount: number // Quantos já estão totalmente recebidos
  itemRows: OcItemDisplayRow[]
}

interface RecebimentoTableProps {
  items: MaterialShortage[]
  viewMode?: 'oc' | 'supplier' | 'list'
  activeOcItems?: OrdemCompraItem[]
  inventoryMap?: Map<string, { quantity: number; unit?: string }>
  codeInputs: Record<string, string>
  onCodeChange: (id: string, value: string) => void
  onDistribuir: (item: MaterialShortage) => void
  onDistribuirOcItem?: (ocItem: OrdemCompraItem) => void
  onEntradaIntegralOc?: (oc: OrdemCompra) => void
}

function RecebimentoRow({
  displayItem,
  codeInputs,
  onCodeChange,
  onDistribuir,
  onEntradaIntegralOc,
}: {
  displayItem: RecebimentoDisplayItem
  codeInputs: Record<string, string>
  onCodeChange: (id: string, value: string) => void
  onDistribuir: (item: MaterialShortage) => void
  onEntradaIntegralOc?: (oc: OrdemCompra) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isBatch = displayItem.type === 'batch'
  const rep = displayItem.representative
  const received = displayItem.receivedQuantity
  const total = displayItem.totalQuantity

  return (
    <Fragment>
      <TableRow
        key={displayItem.id}
        className={cn(
          'hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors',
          isBatch && 'bg-blue-50/20 dark:bg-blue-950/10 font-normal',
          expanded && 'border-b-0 bg-blue-50/40 dark:bg-blue-950/20',
        )}
      >
        <TableCell className="text-xs text-muted-foreground">
          {displayItem.code ? (
            <NoTranslate
              as="span"
              className="font-mono text-slate-700 dark:text-slate-300 font-medium"
            >
              {displayItem.code}
            </NoTranslate>
          ) : (
            <Input
              placeholder="Cod. opcional"
              className="h-7 w-24 text-xs notranslate"
              translate="no"
              value={codeInputs[rep.id] ?? ''}
              onChange={(e) => onCodeChange(rep.id, e.target.value)}
            />
          )}
        </TableCell>
        <TableCell className="font-medium text-sm">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {isBatch && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 dark:text-blue-300 hover:underline cursor-pointer"
                  title="Expandir rateio interno do lote"
                >
                  {expanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-blue-600" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-blue-600" />
                  )}
                  <Badge
                    variant="outline"
                    className="border-blue-400 bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 text-[10px] gap-1 px-1.5 py-0.5"
                  >
                    <Layers className="w-3 h-3" />
                    Lote Consolidado ({displayItem.opItems.length} OPs
                    {displayItem.surplusQuantity > 0 ? ` + Estoque` : ''})
                  </Badge>
                </button>
              )}
              <NoTranslate as="span">{displayItem.description}</NoTranslate>
            </div>

            {isBatch && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                <span>
                  Rateio:{' '}
                  <strong className="text-slate-700 dark:text-slate-300">
                    {formatQuantity(displayItem.opQuantity)} un
                  </strong>{' '}
                  para {displayItem.opItems.length} OPs
                </span>
                {displayItem.surplusQuantity > 0 && (
                  <>
                    <span>&bull;</span>
                    <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                      +{formatQuantity(displayItem.surplusQuantity)} un Compra para estoque
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right font-semibold">
          <div className="flex flex-col items-end">
            <NoTranslate
              as="span"
              className={cn(isBatch && 'text-blue-700 dark:text-blue-300 font-bold')}
            >
              {formatQuantity(total)}
            </NoTranslate>
            {isBatch && displayItem.surplusQuantity > 0 && (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                ({formatQuantity(displayItem.opQuantity)} +{' '}
                {formatQuantity(displayItem.surplusQuantity)})
              </span>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right">
          <span
            className={cn(
              'font-bold notranslate',
              received > 0 && received < total && 'text-amber-600',
            )}
            translate="no"
          >
            {formatQuantity(received)}
          </span>
          <span className="text-xs text-muted-foreground notranslate" translate="no">
            {' '}
            / {formatQuantity(total)}
          </span>
        </TableCell>
        <TableCell className="text-xs notranslate" translate="no">
          {displayItem.supplier || '-'}
        </TableCell>
        <TableCell className="text-xs notranslate" translate="no">
          {displayItem.expectedDate
            ? format(parseISO(displayItem.expectedDate), 'dd/MM/yyyy')
            : '-'}
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-1 items-start">
            <Badge
              variant="outline"
              className={cn(
                'whitespace-nowrap',
                displayItem.status === 'Recebido_Parcial' &&
                  'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
                displayItem.status === 'Compra' &&
                  'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
                displayItem.status === 'Recebido' &&
                  'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
              )}
            >
              {displayItem.status.replace('_', ' ')}
            </Badge>
            {displayItem.linkedOc && (
              <Badge
                variant="outline"
                className="text-[10px] bg-blue-50 text-blue-900 border-blue-200 font-mono"
              >
                OC #{displayItem.linkedOc.oc_number}
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              size="sm"
              className="h-8 bg-green-600 hover:bg-green-700 text-white text-xs"
              onClick={() => onDistribuir(rep)}
            >
              <CheckCircle className="size-3.5 mr-1" />
              Distribuir
            </Button>
            {displayItem.linkedOc && onEntradaIntegralOc && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                onClick={() => onEntradaIntegralOc(displayItem.linkedOc!)}
                title={`Dar entrada integral da OC #${displayItem.linkedOc.oc_number}`}
              >
                <Package className="size-3 mr-1 text-emerald-600" />
                Entrada Integral OC
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Detalhe interno expandível do rateio do lote */}
      {isBatch && expanded && (
        <TableRow className="bg-blue-50/50 dark:bg-blue-950/25 border-t-0">
          <TableCell colSpan={8} className="py-2.5 px-4 pl-12">
            <div className="p-3 bg-white/90 dark:bg-slate-900/90 rounded-md border border-blue-200 dark:border-blue-900 shadow-xs space-y-2 text-xs">
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-blue-600" />
                  Rastreio interno do lote — Rateio por OP e Estoque:
                </span>
                <span className="text-blue-700 dark:text-blue-300 font-bold">
                  Total real do lote: {formatQuantity(displayItem.totalQuantity)} un
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                {/* OPs vinculadas */}
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    OPs Vinculadas ({displayItem.opItems.length} OPs —{' '}
                    {formatQuantity(displayItem.opQuantity)} un):
                  </div>
                  <div className="space-y-1">
                    {displayItem.opItems.map((opItem) => {
                      const opLabel =
                        opItem.expand?.order_id?.op_number ||
                        opItem.expand?.order_id?.order_number ||
                        'S/N'
                      const client = opItem.expand?.order_id?.client_name
                      return (
                        <div
                          key={opItem.id}
                          className="flex items-center justify-between p-1.5 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="font-semibold text-blue-900 dark:text-blue-200 notranslate"
                              translate="no"
                            >
                              OP {opLabel}
                            </span>
                            {client && (
                              <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                                {client}
                              </span>
                            )}
                          </div>
                          <Badge variant="outline" className="text-[11px] font-bold">
                            {formatQuantity(opItem.quantity)} un
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Excedente / Estoque */}
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Destino para Estoque:
                  </div>
                  {displayItem.surplusQuantity > 0 ? (
                    <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-semibold text-emerald-900 dark:text-emerald-200">
                          <Warehouse className="w-3.5 h-3.5 text-emerald-600" />
                          Compra para estoque (Excedente)
                        </span>
                        <Badge className="bg-emerald-600 text-white font-bold text-[11px]">
                          +{formatQuantity(displayItem.surplusQuantity)} un
                        </Badge>
                      </div>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                        Entra diretamente no saldo de estoque geral ao receber, visível para alerta
                        de estoque mínimo e disponibilidade de futuras OPs.
                      </p>
                    </div>
                  ) : (
                    <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/40 border text-[11px] text-muted-foreground">
                      Nenhum excedente adicionado. O lote atende exatamente a soma solicitada pelas
                      OPs ({formatQuantity(displayItem.opQuantity)} un).
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  )
}

function TableCols() {
  return (
    <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
      <TableRow>
        <TableHead className="w-[120px]">Código</TableHead>
        <TableHead>Descrição</TableHead>
        <TableHead className="text-right w-[80px]">Qtde Total</TableHead>
        <TableHead className="text-right w-[110px]">Recebido</TableHead>
        <TableHead className="w-[140px]">Fornecedor</TableHead>
        <TableHead className="w-[110px]">Previsão</TableHead>
        <TableHead className="w-[100px]">Status</TableHead>
        <TableHead className="w-[190px]">Receber</TableHead>
      </TableRow>
    </TableHeader>
  )
}

function OcComponentRow({
  row,
  onDistribuir,
  onDistribuirOcItem,
}: {
  row: OcItemDisplayRow
  onDistribuir: (item: MaterialShortage) => void
  onDistribuirOcItem?: (ocItem: OrdemCompraItem) => void
}) {
  const isStandalone = row.type === 'standalone'
  const isBatch = Boolean(row.isBatch)
  const isFullyReceived = row.saldoQty <= 0.0001 && row.purchasedQty > 0

  return (
    <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800">
      <TableCell className="text-xs font-mono font-medium text-slate-700 dark:text-slate-300 w-[140px]">
        <NoTranslate as="span">{row.code || '-'}</NoTranslate>
      </TableCell>
      <TableCell className="font-medium text-sm">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {isStandalone && (
              <Badge
                variant="outline"
                className="border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 text-[10px] px-1.5 py-0.5"
              >
                Item avulso da OC
              </Badge>
            )}
            {isBatch && (
              <Badge
                variant="outline"
                className="border-blue-400 bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 text-[10px] gap-1 px-1.5 py-0.5"
              >
                <Layers className="w-3 h-3" />
                Lote ({(row.opItems || []).length} OPs
                {Number(row.surplusQuantity) > 0 ? ` + Estoque` : ''})
              </Badge>
            )}
            <NoTranslate as="span">{row.description}</NoTranslate>
          </div>

          {/* Se tem OP vinculada (via shortage), exibe para rastreabilidade */}
          {row.opLabel && (
            <div className="text-[11px] text-muted-foreground flex items-center gap-2">
              <span className="font-semibold text-blue-900 dark:text-blue-200">
                OP {row.opLabel}
              </span>
              {row.clientName && <span>• {row.clientName}</span>}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right text-xs font-semibold w-[100px]">
        <NoTranslate as="span">{formatQuantity(row.purchasedQty)} un</NoTranslate>
      </TableCell>
      <TableCell className="text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400 w-[110px]">
        <NoTranslate as="span">{formatQuantity(row.receivedQty)} un</NoTranslate>
      </TableCell>
      <TableCell className="text-right text-xs font-bold text-amber-700 dark:text-amber-400 w-[100px]">
        <NoTranslate as="span">{formatQuantity(row.saldoQty)} un</NoTranslate>
      </TableCell>
      <TableCell className="text-right w-[150px]">
        {isFullyReceived ? (
          <Badge
            variant="outline"
            className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs py-1 px-2"
          >
            Recebido
          </Badge>
        ) : row.isSurplusOnly ? (
          <Button
            size="sm"
            className="h-7 bg-amber-600 hover:bg-amber-700 text-white text-xs px-2.5 shadow-sm"
            onClick={() => onDistribuirOcItem && onDistribuirOcItem(row.ocItem)}
            title="OPs vinculadas já atendidas integralmente. Receber o saldo remanescente diretamente no estoque."
          >
            <Warehouse className="size-3.5 mr-1" />
            Receber excedente ao estoque
          </Button>
        ) : isStandalone ? (
          <Button
            size="sm"
            className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5"
            onClick={() => onDistribuirOcItem && onDistribuirOcItem(row.ocItem)}
          >
            <Warehouse className="size-3.5 mr-1" />
            Receber ao estoque
          </Button>
        ) : row.shortage && row.saldoQty > 0.0001 && row.hasPendingOpDemand ? (
          <Button
            size="sm"
            className="h-7 bg-green-600 hover:bg-green-700 text-white text-xs px-2.5"
            onClick={() => onDistribuir(row.shortage!)}
          >
            <CheckCircle className="size-3.5 mr-1" />
            Distribuir
          </Button>
        ) : row.saldoQty > 0.0001 ? (
          <Button
            size="sm"
            className="h-7 bg-amber-600 hover:bg-amber-700 text-white text-xs px-2.5 shadow-sm"
            onClick={() => onDistribuirOcItem && onDistribuirOcItem(row.ocItem)}
            title="Receber saldo no estoque"
          >
            <Warehouse className="size-3.5 mr-1" />
            Receber excedente ao estoque
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </TableCell>
    </TableRow>
  )
}

function OcGroupRow({
  group,
  onDistribuir,
  onDistribuirOcItem,
  onEntradaIntegralOc,
}: {
  group: OcGroupedRecebimento
  onDistribuir: (item: MaterialShortage) => void
  onDistribuirOcItem?: (ocItem: OrdemCompraItem) => void
  onEntradaIntegralOc?: (oc: OrdemCompra) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const pct =
    group.totalItemsCount > 0
      ? Math.round((group.receivedItemsCount / group.totalItemsCount) * 100)
      : 0

  const hasPendingItems = group.itemRows.some((r) => r.saldoQty > 0.0001)

  return (
    <div className="border rounded-lg bg-white dark:bg-slate-900 shadow-xs overflow-hidden transition-all">
      {/* Cabeçalho da Ordem de Compra */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-slate-50/80 dark:bg-slate-800/40 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 border-b select-none">
        <div
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-3 cursor-pointer"
        >
          <button
            type="button"
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            )}
          </button>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="bg-blue-50 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-200 text-xs font-bold gap-1 px-2 py-0.5"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              OC #{group.oc.oc_number}
            </Badge>
            <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              <NoTranslate as="span">{group.supplier}</NoTranslate>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs ml-7 sm:ml-0 flex-wrap">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span>Previsão:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {group.expectedDate
                ? format(parseISO(group.expectedDate), 'dd/MM/yyyy')
                : 'Não definida'}
            </span>
          </div>

          <div className="flex items-center gap-2 min-w-[170px]">
            <span className="text-muted-foreground whitespace-nowrap">
              Progresso:{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {group.receivedItemsCount}
              </strong>{' '}
              de <strong>{group.totalItemsCount}</strong> itens
            </span>
            <Progress value={pct} className="w-16 h-2" />
          </div>

          <Badge
            variant="outline"
            className={cn(
              'text-[11px] whitespace-nowrap',
              group.oc.status === 'Pendente' &&
                'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
              group.oc.status === 'Enviada' &&
                'border-blue-300 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
              group.oc.status === 'Recebida' &&
                'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
            )}
          >
            {group.oc.status || 'Ativa'}
          </Badge>

          {/* Botão de Ação: Dar entrada integral da OC */}
          {hasPendingItems && onEntradaIntegralOc && (
            <Button
              size="sm"
              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 shadow-xs gap-1.5"
              onClick={(e) => {
                e.stopPropagation()
                onEntradaIntegralOc(group.oc)
              }}
              title={`Dar entrada integral de todos os itens com saldo da OC #${group.oc.oc_number}`}
            >
              <Package className="size-3.5" />
              Dar entrada integral da OC
            </Button>
          )}
        </div>
      </div>

      {/* Tabela de componentes da OC (todos os itens) */}
      {expanded && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/50 dark:bg-slate-800/20 text-xs">
              <TableRow>
                <TableHead className="w-[140px]">Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right w-[100px]">Comprado</TableHead>
                <TableHead className="text-right w-[110px]">Já Recebido</TableHead>
                <TableHead className="text-right w-[100px]">Saldo</TableHead>
                <TableHead className="text-right w-[150px]">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.itemRows.map((row) => (
                <OcComponentRow
                  key={row.id}
                  row={row}
                  onDistribuir={onDistribuir}
                  onDistribuirOcItem={onDistribuirOcItem}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export function RecebimentoTable({
  items,
  viewMode = 'oc',
  activeOcItems = [],
  codeInputs,
  onCodeChange,
  onDistribuir,
  onDistribuirOcItem,
  onEntradaIntegralOc,
}: RecebimentoTableProps) {
  // Mapeamento de shortageId -> Ordem de Compra ativa vinculada
  const shortageToOcMap = useMemo(() => {
    const map = new Map<string, OrdemCompra>()
    for (const it of activeOcItems) {
      if (!it.material_shortage_id) continue
      const oc = it.expand?.oc_id
      if (oc && oc.status !== 'Cancelada') {
        map.set(it.material_shortage_id, oc)
      }
    }
    // Propagar em lotes (batch_id)
    const batchToOc = new Map<string, OrdemCompra>()
    for (const s of items) {
      if (s.batch_id && map.has(s.id)) {
        batchToOc.set(s.batch_id, map.get(s.id)!)
      }
    }
    for (const s of items) {
      if (s.batch_id && !map.has(s.id) && batchToOc.has(s.batch_id)) {
        map.set(s.id, batchToOc.get(s.batch_id)!)
      }
    }
    return map
  }, [activeOcItems, items])

  const displayItems = useMemo(
    () => buildRecebimentoDisplayItems(items, shortageToOcMap),
    [items, shortageToOcMap],
  )

  // 1. Visão padrão: 'Por Ordem de Compra'
  // Constrói cada OC DIRETAMENTE a partir dos seus itens (activeOcItems)
  const { ocGroups, semOcDisplayItems } = useMemo(() => {
    // Mapa rápido de shortageId -> MaterialShortage
    const shortagesMap = new Map<string, MaterialShortage>()
    for (const s of items) {
      shortagesMap.set(s.id, s)
    }

    // Mapa rápido de batchId -> MaterialShortage[]
    const batchShortagesMap = new Map<string, MaterialShortage[]>()
    for (const s of items) {
      if (s.batch_id) {
        const arr = batchShortagesMap.get(s.batch_id) || []
        arr.push(s)
        batchShortagesMap.set(s.batch_id, arr)
      }
    }

    // Agrupa activeOcItems por OC
    const ocMap = new Map<
      string,
      {
        oc: OrdemCompra
        items: OrdemCompraItem[]
      }
    >()

    const shortagesLinkedToAnyOc = new Set<string>()

    for (const ocItem of activeOcItems) {
      const oc = ocItem.expand?.oc_id
      if (!oc || oc.status === 'Cancelada') continue
      const ocId = oc.id
      if (!ocMap.has(ocId)) {
        ocMap.set(ocId, { oc, items: [] })
      }
      ocMap.get(ocId)!.items.push(ocItem)

      if (ocItem.material_shortage_id) {
        shortagesLinkedToAnyOc.add(ocItem.material_shortage_id)
        // Se pertencer a lote, adiciona todos os membros do lote
        const s = shortagesMap.get(ocItem.material_shortage_id)
        if (s?.batch_id && batchShortagesMap.has(s.batch_id)) {
          for (const m of batchShortagesMap.get(s.batch_id)!) {
            shortagesLinkedToAnyOc.add(m.id)
          }
        }
      }
    }

    const ocGroupsList: OcGroupedRecebimento[] = []

    for (const [, { oc, items: ocItensList }] of ocMap.entries()) {
      const itemRows: OcItemDisplayRow[] = []
      let fullyReceivedCount = 0

      for (const ocItem of ocItensList) {
        const purchasedQty = Number(ocItem.quantity) || 0
        let receivedQty = Number(ocItem.received_quantity) || 0
        let shortage = ocItem.material_shortage_id
          ? shortagesMap.get(ocItem.material_shortage_id)
          : undefined

        // Se o shortage não estiver no state de pendentes (ex: já finalizado como Recebido no banco),
        // busca no expand se disponível
        if (!shortage && ocItem.expand?.material_shortage_id) {
          shortage = ocItem.expand.material_shortage_id
        }

        const isStandalone = !ocItem.material_shortage_id

        // Rastreabilidade de OP se houver shortage
        let opLabel = ''
        let clientName = ''
        let isBatch = false
        let batchOpItems: MaterialShortage[] = []
        let surplusQuantity = 0
        let hasPendingOpDemand = false

        if (shortage) {
          // As colunas Comprado / Já Recebido / Saldo vêm da quantidade do item da OC (purchasedQty)
          // menos o já recebido correspondente (shortage.received_quantity ou ocItem.received_quantity).
          // Se o shortage já indica recebimento total pelo status 'Recebido' e received_quantity >= quantity,
          // ou se o shortage.received_quantity é maior, considera recebido pela fonte que indicar recebimento.
          const sRcvd = Number(shortage.received_quantity) || 0
          const sQty = Number(shortage.quantity) || 0
          if (shortage.status === 'Recebido' && sQty > 0 && sRcvd >= sQty - 0.0001) {
            // Se o shortage está totalmente recebido, o item vinculado deve refletir pelo menos o sRcvd (ou o purchasedQty)
            receivedQty = Math.max(receivedQty, sRcvd, purchasedQty <= sQty ? purchasedQty : sRcvd)
          } else if (sRcvd > receivedQty) {
            receivedQty = sRcvd
          }

          const op = shortage.expand?.order_id
          if (op) {
            opLabel = op.op_number || op.order_number || ''
            clientName = op.client_name || ''
          }

          if (shortage.batch_id && batchShortagesMap.has(shortage.batch_id)) {
            const batchMembers = batchShortagesMap.get(shortage.batch_id)!
            const codeKey = (shortage.code || '').trim().toLowerCase()
            const sameCodeMembers = batchMembers.filter((m) => {
              const mCode = (m.code || '').trim().toLowerCase()
              return !codeKey || !mCode || mCode === codeKey
            })
            if (sameCodeMembers.length > 1) {
              isBatch = true
              batchOpItems = sameCodeMembers.filter((m) => Boolean(m.order_id))
              const surplus = sameCodeMembers.find(
                (m) => !m.order_id && m.observation?.includes('Compra para estoque'),
              )
              surplusQuantity = surplus ? Number(surplus.quantity) || 0 : 0

              // Verifica se ainda há demanda de OP pendente no lote
              hasPendingOpDemand = batchOpItems.some((m) => {
                const mQty = Number(m.quantity) || 0
                const mRcvd = Number(m.received_quantity) || 0
                return m.status !== 'Recebido' && mQty - mRcvd > 0.0001
              })
            } else {
              // Lote com 1 membro
              const hasOp = Boolean(shortage.order_id)
              const pend =
                (Number(shortage.quantity) || 0) - (Number(shortage.received_quantity) || 0)
              hasPendingOpDemand = hasOp && shortage.status !== 'Recebido' && pend > 0.0001
            }
          } else {
            // Shortage individual
            const hasOp = Boolean(shortage.order_id)
            const pend =
              (Number(shortage.quantity) || 0) - (Number(shortage.received_quantity) || 0)
            hasPendingOpDemand = hasOp && shortage.status !== 'Recebido' && pend > 0.0001
          }
        }

        const saldoQty = Math.max(0, purchasedQty - receivedQty)
        if (purchasedQty > 0 && receivedQty >= purchasedQty - 0.0001) {
          fullyReceivedCount++
        }

        // Se o item tem saldo na OC mas NÃO há mais nenhuma demanda pendente de OP
        // vinculada a ele (todos os shortages já recebidos ou item avulso/excedente):
        const isSurplusOnly = !isStandalone && !hasPendingOpDemand && saldoQty > 0.0001

        itemRows.push({
          type: isStandalone ? 'standalone' : 'shortage',
          id: ocItem.id,
          code: ocItem.code || shortage?.code || '',
          description: ocItem.description || shortage?.description || '',
          purchasedQty,
          receivedQty,
          saldoQty,
          shortage,
          ocItem,
          opLabel,
          clientName,
          isBatch,
          opItems: batchOpItems,
          surplusQuantity,
          hasPendingOpDemand,
          isSurplusOnly,
        })
      }

      // Ordena itens: pendentes (saldo > 0) primeiro, depois recebidos
      itemRows.sort((a, b) => {
        if (a.saldoQty > 0 && b.saldoQty <= 0) return -1
        if (a.saldoQty <= 0 && b.saldoQty > 0) return 1
        return 0
      })

      // Se a OC ainda tem itens pendentes (ou está ativa), exibimos no painel
      const hasPendingItems = itemRows.some((r) => r.saldoQty > 0.0001)
      if (hasPendingItems || oc.status !== 'Recebida') {
        ocGroupsList.push({
          oc,
          supplier: oc.supplier || '-',
          expectedDate: oc.expected_date,
          totalItemsCount: itemRows.length,
          receivedItemsCount: fullyReceivedCount,
          itemRows,
        })
      }
    }

    // Ordena OCs por número decrescente
    ocGroupsList.sort((a, b) => {
      const numA = parseInt(a.oc.oc_number, 10) || 0
      const numB = parseInt(b.oc.oc_number, 10) || 0
      return numB - numA
    })

    // Shortages sem nenhuma OC vinculada (solicitações avulsas sem pedido gerado)
    const semOc: RecebimentoDisplayItem[] = []
    for (const dItem of displayItems) {
      const isLinkedToOc = dItem.items.some((it) => shortagesLinkedToAnyOc.has(it.id))
      if (!isLinkedToOc) {
        semOc.push(dItem)
      }
    }

    return { ocGroups: ocGroupsList, semOcDisplayItems: semOc }
  }, [displayItems, activeOcItems, items])

  // 2. Visão alternativa: 'Agrupar por Fornecedor'
  const supplierGroups = useMemo(() => {
    const groups = new Map<string, RecebimentoDisplayItem[]>()
    for (const item of displayItems) {
      const key = (item.supplier || '').trim()
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    const result: { supplier: string; items: RecebimentoDisplayItem[]; totalValue: number }[] = []
    let noSupplier: RecebimentoDisplayItem[] = []
    for (const [supplier, groupItems] of groups) {
      if (!supplier || supplier === '-') {
        noSupplier = groupItems
      } else {
        result.push({ supplier, items: groupItems, totalValue: 0 })
      }
    }
    result.sort((a, b) => a.supplier.localeCompare(b.supplier, 'pt-BR'))
    if (noSupplier.length > 0) {
      result.push({ supplier: '-', items: noSupplier, totalValue: 0 })
    }
    return result
  }, [displayItems])

  // Renderização: Modo Lista Simples
  if (viewMode === 'list') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableCols />
          <TableBody>
            {displayItems.map((displayItem) => (
              <RecebimentoRow
                key={displayItem.id}
                displayItem={displayItem}
                codeInputs={codeInputs}
                onCodeChange={onCodeChange}
                onDistribuir={onDistribuir}
                onEntradaIntegralOc={onEntradaIntegralOc}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  // Renderização: Modo Agrupar por Fornecedor
  if (viewMode === 'supplier') {
    return (
      <div className="space-y-3">
        {supplierGroups.map((group) => (
          <SupplierGroupSection
            key={group.supplier || '__no_supplier__'}
            supplier={group.supplier}
            itemCount={group.items.length}
            totalValue={group.totalValue}
            allSelected={false}
            onSelectAll={() => {}}
            showCheckbox={false}
          >
            <Table>
              <TableCols />
              <TableBody>
                {group.items.map((displayItem) => (
                  <RecebimentoRow
                    key={displayItem.id}
                    displayItem={displayItem}
                    codeInputs={codeInputs}
                    onCodeChange={onCodeChange}
                    onDistribuir={onDistribuir}
                  />
                ))}
              </TableBody>
            </Table>
          </SupplierGroupSection>
        ))}
      </div>
    )
  }

  // Renderização: Modo padrão 'Por Ordem de Compra' (viewMode === 'oc')
  return (
    <div className="space-y-6">
      {/* 1. Blocos de Ordens de Compra */}
      {ocGroups.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              Ordens de Compra Pendentes de Recebimento ({ocGroups.length})
            </h3>
            <span className="text-xs text-muted-foreground">
              Itens organizados por Ordem de Compra ativa
            </span>
          </div>

          <div className="space-y-3">
            {ocGroups.map((group) => (
              <OcGroupRow
                key={group.oc.id}
                group={group}
                onDistribuir={onDistribuir}
                onDistribuirOcItem={onDistribuirOcItem}
                onEntradaIntegralOc={onEntradaIntegralOc}
              />
            ))}
          </div>
        </div>
      )}

      {/* 2. Bloco: Sem ordem de compra */}
      {semOcDisplayItems.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-600" />
              Sem ordem de compra ({semOcDisplayItems.length})
            </h3>
            <span className="text-xs text-muted-foreground">
              Solicitações de compra individuais sem Ordem de Compra vinculada
            </span>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
            <Table>
              <TableCols />
              <TableBody>
                {semOcDisplayItems.map((displayItem) => (
                  <RecebimentoRow
                    key={displayItem.id}
                    displayItem={displayItem}
                    codeInputs={codeInputs}
                    onCodeChange={onCodeChange}
                    onDistribuir={onDistribuir}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {ocGroups.length === 0 && semOcDisplayItems.length === 0 && (
        <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          Nenhum item aguardando recebimento no momento.
        </div>
      )}
    </div>
  )
}
