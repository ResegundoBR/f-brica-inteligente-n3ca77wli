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
}

/**
 * Agrupa itens para exibição no Recebimento:
 * Registros de material_shortages com o MESMO batch_id são agrupados em UMA ÚNICA LINHA DE LOTE,
 * exibindo a QUANTIDADE REAL comprada (da ordem de compra / batch_info — ex.: 17 un),
 * e NÃO a soma de registros desatualizados ou duplicados.
 */
export function buildRecebimentoDisplayItems(items: MaterialShortage[]): RecebimentoDisplayItem[] {
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
    })
  }

  // Processa itens individuais normais
  for (const item of nonBatch) {
    const qty = Number(item.quantity) || 0
    const rcvd = Number(item.received_quantity) || 0
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
    })
  }

  // Ordena por data decrescente
  result.sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime())

  return result
}

export interface OcGroupedRecebimento {
  oc: OrdemCompra
  supplier: string
  expectedDate?: string
  totalItemsCount: number // Total de componentes distintos nesta OC
  receivedItemsCount: number // Quantos já estão totalmente recebidos
  pendingDisplayItems: RecebimentoDisplayItem[]
}

interface RecebimentoTableProps {
  items: MaterialShortage[]
  viewMode?: 'oc' | 'supplier' | 'list'
  activeOcItems?: OrdemCompraItem[]
  codeInputs: Record<string, string>
  onCodeChange: (id: string, value: string) => void
  onDistribuir: (item: MaterialShortage) => void
}

function RecebimentoRow({
  displayItem,
  codeInputs,
  onCodeChange,
  onDistribuir,
}: {
  displayItem: RecebimentoDisplayItem
  codeInputs: Record<string, string>
  onCodeChange: (id: string, value: string) => void
  onDistribuir: (item: MaterialShortage) => void
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
        </TableCell>
        <TableCell>
          <Button
            size="sm"
            className="h-8 bg-green-600 hover:bg-green-700 text-white"
            onClick={() => onDistribuir(rep)}
          >
            <CheckCircle className="size-3.5 mr-1" />
            Distribuir
          </Button>
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
  displayItem,
  onDistribuir,
}: {
  displayItem: RecebimentoDisplayItem
  onDistribuir: (item: MaterialShortage) => void
}) {
  const rep = displayItem.representative
  const total = displayItem.totalQuantity
  const received = displayItem.receivedQuantity
  const saldo = Math.max(0, total - received)
  const isBatch = displayItem.type === 'batch'

  return (
    <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800">
      <TableCell className="text-xs font-mono font-medium text-slate-700 dark:text-slate-300 w-[140px]">
        <NoTranslate as="span">{displayItem.code || '-'}</NoTranslate>
      </TableCell>
      <TableCell className="font-medium text-sm">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isBatch && (
            <Badge
              variant="outline"
              className="border-blue-400 bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 text-[10px] gap-1 px-1.5 py-0.5"
            >
              <Layers className="w-3 h-3" />
              Lote ({displayItem.opItems.length} OPs
              {displayItem.surplusQuantity > 0 ? ` + Estoque` : ''})
            </Badge>
          )}
          <NoTranslate as="span">{displayItem.description}</NoTranslate>
        </div>
      </TableCell>
      <TableCell className="text-right text-xs font-semibold w-[100px]">
        <NoTranslate as="span">{formatQuantity(total)} un</NoTranslate>
      </TableCell>
      <TableCell className="text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400 w-[110px]">
        <NoTranslate as="span">{formatQuantity(received)} un</NoTranslate>
      </TableCell>
      <TableCell className="text-right text-xs font-bold text-amber-700 dark:text-amber-400 w-[100px]">
        <NoTranslate as="span">{formatQuantity(saldo)} un</NoTranslate>
      </TableCell>
      <TableCell className="text-right w-[150px]">
        <Button
          size="sm"
          className="h-7 bg-green-600 hover:bg-green-700 text-white text-xs px-2.5"
          onClick={() => onDistribuir(rep)}
        >
          <CheckCircle className="size-3.5 mr-1" />
          Distribuir
        </Button>
      </TableCell>
    </TableRow>
  )
}

function OcGroupRow({
  group,
  onDistribuir,
}: {
  group: OcGroupedRecebimento
  onDistribuir: (item: MaterialShortage) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const pct =
    group.totalItemsCount > 0
      ? Math.round((group.receivedItemsCount / group.totalItemsCount) * 100)
      : 0

  return (
    <div className="border rounded-lg bg-white dark:bg-slate-900 shadow-xs overflow-hidden transition-all">
      {/* Cabeçalho da Ordem de Compra */}
      <div
        onClick={() => setExpanded((v) => !v)}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-slate-50/80 dark:bg-slate-800/40 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 cursor-pointer border-b select-none"
      >
        <div className="flex items-center gap-3">
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

        <div className="flex items-center gap-4 text-xs ml-7 sm:ml-0 flex-wrap">
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
        </div>
      </div>

      {/* Tabela de componentes expandíveis da OC */}
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
              {group.pendingDisplayItems.map((dItem) => (
                <OcComponentRow key={dItem.id} displayItem={dItem} onDistribuir={onDistribuir} />
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
}: RecebimentoTableProps) {
  const displayItems = useMemo(() => buildRecebimentoDisplayItems(items), [items])

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

  // 1. Visão padrão: 'Por Ordem de Compra'
  const { ocGroups, semOcDisplayItems } = useMemo(() => {
    // Mapa de ocId -> { oc, pendingDisplayItems: RecebimentoDisplayItem[] }
    const groupsMap = new Map<
      string,
      {
        oc: OrdemCompra
        pendingDisplayItems: RecebimentoDisplayItem[]
      }
    >()
    const semOc: RecebimentoDisplayItem[] = []

    for (const dItem of displayItems) {
      // Procura OC vinculada a este displayItem (direto ou através de membros de lote)
      let matchedOc: OrdemCompra | undefined
      for (const mId of dItem.items.map((x) => x.id)) {
        if (shortageToOcMap.has(mId)) {
          matchedOc = shortageToOcMap.get(mId)
          break
        }
      }

      if (matchedOc) {
        const existing = groupsMap.get(matchedOc.id) || {
          oc: matchedOc,
          pendingDisplayItems: [],
        }
        existing.pendingDisplayItems.push(dItem)
        groupsMap.set(matchedOc.id, existing)
      } else {
        semOc.push(dItem)
      }
    }

    // Calcula totalItemsCount e receivedItemsCount para cada OC
    // baseado em todos os itens daquela OC em activeOcItems
    const ocAllItensMap = new Map<string, OrdemCompraItem[]>()
    for (const it of activeOcItems) {
      const oc = it.expand?.oc_id
      if (oc && oc.status !== 'Cancelada') {
        const arr = ocAllItensMap.get(oc.id) || []
        arr.push(it)
        ocAllItensMap.set(oc.id, arr)
      }
    }

    const ocGroupsList: OcGroupedRecebimento[] = []
    for (const [ocId, data] of groupsMap.entries()) {
      const ocAllItens = ocAllItensMap.get(ocId) || []
      const totalItemsCount =
        ocAllItens.length > 0 ? ocAllItens.length : data.pendingDisplayItems.length

      // Conta quantos itens daquela OC já foram totalmente recebidos
      // Um item da OC vinculado a shortage está pendente se consta em items da página
      let receivedCount = 0
      for (const ocIt of ocAllItens) {
        if (!ocIt.material_shortage_id) {
          // Se não tem shortage vinculado, não podemos monitorar o recebimento físico individual
          continue
        }
        const isStillPending = items.some((s) => s.id === ocIt.material_shortage_id)
        if (!isStillPending) {
          receivedCount++
        }
      }

      ocGroupsList.push({
        oc: data.oc,
        supplier: data.oc.supplier || data.pendingDisplayItems[0]?.supplier || '-',
        expectedDate: data.oc.expected_date || data.pendingDisplayItems[0]?.expectedDate,
        totalItemsCount,
        receivedItemsCount: receivedCount,
        pendingDisplayItems: data.pendingDisplayItems,
      })
    }

    // Ordena OCs por data de criação / número de OC decrescente
    ocGroupsList.sort((a, b) => {
      const numA = parseInt(a.oc.oc_number, 10) || 0
      const numB = parseInt(b.oc.oc_number, 10) || 0
      return numB - numA
    })

    return { ocGroups: ocGroupsList, semOcDisplayItems: semOc }
  }, [displayItems, shortageToOcMap, activeOcItems, items])

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
              <OcGroupRow key={group.oc.id} group={group} onDistribuir={onDistribuir} />
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
