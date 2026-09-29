import { format, parseISO } from 'date-fns'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MaterialShortage } from '@/types'
import { Pencil, Trash2, ChevronDown, ChevronRight, Layers, Package, Warehouse } from 'lucide-react'
import { NoTranslate } from '@/components/NoTranslate'
import { useSupplierGroups } from '@/hooks/use-supplier-groups'
import { SupplierGroupSection } from './SupplierGroupSection'
import { useMemo, useState, Fragment } from 'react'
import { cn } from '@/lib/utils'
import { findOtherOpDemands } from '@/services/material-consolidation'
import { ConsolidatedDemandBadge } from './ConsolidatedDemandBlock'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'

export interface ComprasDisplayItem {
  type: 'single' | 'batch'
  id: string // Se batch, batch_id; se single, item.id
  representative: MaterialShortage
  allMemberIds: string[]
  items: MaterialShortage[] // Membros do lote ou [item]
  opItems: MaterialShortage[] // Sublinhas que pertencem a OPs
  surplusItem?: MaterialShortage // Linha de excedente para estoque
  totalQuantity: number // Quantidade real informada (ex.: 19)
  opQuantity: number // Soma das OPs (ex.: 10)
  surplusQuantity: number // Excedente para estoque (ex.: 9)
  receivedQuantity: number
  supplier: string
  unitPrice: number
  totalValue: number
  expectedDate?: string
  createdDate: string
  code: string
  description: string
}

interface ComprasTableProps {
  items: MaterialShortage[]
  allShortages?: MaterialShortage[]
  onEdit: (item: MaterialShortage) => void
  onDelete?: (item: MaterialShortage) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onToggleSelectGroup?: (ids: string[]) => void
  grouped?: boolean
}

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Agrupa itens de compras para exibição:
 * Se um conjunto de registros tiver batch_id comum, converte em UMA ÚNICA LINHA DE LOTE
 * com a quantidade real informada, fornecedor, preço e previsão da cotação valendo para o lote todo,
 * permitindo expandir os detalhes do rateio interno (quantidades das OPs + excedente estoque).
 */
export function buildComprasDisplayItems(items: MaterialShortage[]): ComprasDisplayItem[] {
  const batchMap = new Map<string, MaterialShortage[]>()
  const nonBatch: MaterialShortage[] = []

  for (const item of items) {
    if (item.batch_id) {
      const existing = batchMap.get(item.batch_id)
      if (existing) {
        existing.push(item)
      } else {
        batchMap.set(item.batch_id, [item])
      }
    } else {
      nonBatch.push(item)
    }
  }

  const result: ComprasDisplayItem[] = []

  // Processa os lotes
  for (const [batchId, batchItems] of batchMap.entries()) {
    // Identifica o representante (aquele com batch_info.is_batch_parent ou primeiro)
    const parent = batchItems.find((it) => it.batch_info?.is_batch_parent) || batchItems[0]

    // Separa membros de OPs e membro de excedente (sem order_id e observação de estoque)
    const surplusItem = batchItems.find(
      (it) =>
        !it.order_id &&
        (it.observation?.includes('Compra para estoque') ||
          it.id === parent.batch_info?.surplus_shortage_id),
    )
    const opItems = batchItems.filter((it) => it.id !== surplusItem?.id)

    const opQuantity = opItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0)
    const surplusQuantity = surplusItem
      ? Number(surplusItem.quantity) || 0
      : Number(parent.batch_info?.surplus_quantity) || 0

    const totalQuantity = parent.batch_info?.actual_quantity || opQuantity + surplusQuantity

    const receivedQuantity = batchItems.reduce(
      (acc, it) => acc + (Number(it.received_quantity) || 0),
      0,
    )

    // Fornecedor e preço unitário: usa do parent ou de qualquer membro que tenha
    const supplier =
      parent.supplier ||
      parent.batch_info?.supplier ||
      batchItems.find((it) => it.supplier)?.supplier ||
      '-'

    const unitPrice =
      Number(parent.unit_price) ||
      Number(parent.batch_info?.unit_price) ||
      Number(batchItems.find((it) => Number(it.unit_price) > 0)?.unit_price) ||
      0

    const expectedDate =
      parent.expected_date ||
      parent.batch_info?.expected_date ||
      batchItems.find((it) => it.expected_date)?.expected_date

    const totalValue = totalQuantity * unitPrice

    result.push({
      type: 'batch',
      id: batchId,
      representative: parent,
      allMemberIds: batchItems.map((it) => it.id),
      items: batchItems,
      opItems,
      surplusItem,
      totalQuantity,
      opQuantity,
      surplusQuantity,
      receivedQuantity,
      supplier,
      unitPrice,
      totalValue,
      expectedDate,
      createdDate: parent.created,
      code: parent.code || '',
      description: parent.description,
    })
  }

  // Processa os itens individuais normais
  for (const item of nonBatch) {
    const qty = Number(item.quantity) || 0
    const price = Number(item.unit_price) || 0
    result.push({
      type: 'single',
      id: item.id,
      representative: item,
      allMemberIds: [item.id],
      items: [item],
      opItems: item.order_id ? [item] : [],
      surplusItem: !item.order_id ? item : undefined,
      totalQuantity: qty,
      opQuantity: item.order_id ? qty : 0,
      surplusQuantity: !item.order_id ? qty : 0,
      receivedQuantity: Number(item.received_quantity) || 0,
      supplier: item.supplier || '-',
      unitPrice: price,
      totalValue: qty * price,
      expectedDate: item.expected_date,
      createdDate: item.created,
      code: item.code || '',
      description: item.description,
    })
  }

  // Ordena por data decrescente
  result.sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime())

  return result
}

function ComprasDisplayRow({
  displayItem,
  consolidation,
  onEdit,
  onDelete,
  selectedIds,
  onToggleSelect,
}: {
  displayItem: ComprasDisplayItem
  consolidation?: ReturnType<typeof findOtherOpDemands>
  onEdit: (item: MaterialShortage) => void
  onDelete?: (item: MaterialShortage) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isBatch = displayItem.type === 'batch'
  const rep = displayItem.representative

  // Checkbox de seleção: se lote, selecionado se todos os membros estiverem selecionados
  const isSelected = displayItem.allMemberIds.every((id) => selectedIds.has(id))
  const isIndeterminate = !isSelected && displayItem.allMemberIds.some((id) => selectedIds.has(id))

  const handleToggle = () => {
    // Alterna todos os membros do lote de uma vez
    for (const id of displayItem.allMemberIds) {
      onToggleSelect(id)
    }
  }

  return (
    <Fragment>
      <TableRow
        className={cn(
          'hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors',
          isBatch && 'bg-blue-50/20 dark:bg-blue-950/10 font-normal',
          expanded && 'border-b-0 bg-blue-50/40 dark:bg-blue-950/20',
        )}
      >
        <TableCell onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected ? true : isIndeterminate ? 'indeterminate' : false}
            onCheckedChange={handleToggle}
          />
        </TableCell>

        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {displayItem.createdDate ? format(parseISO(displayItem.createdDate), 'dd/MM/yy') : '-'}
        </TableCell>

        <TableCell className="text-xs text-muted-foreground">
          <NoTranslate as="span">{displayItem.code || '-'}</NoTranslate>
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
              <ConsolidatedDemandBadge consolidation={consolidation} />
            </div>

            {isBatch && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                <span>
                  Rateio:{' '}
                  <strong className="text-slate-700 dark:text-slate-300">
                    {displayItem.opQuantity} un
                  </strong>{' '}
                  para {displayItem.opItems.length} OPs
                </span>
                {displayItem.surplusQuantity > 0 && (
                  <>
                    <span>&bull;</span>
                    <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                      +{displayItem.surplusQuantity} un Compra para estoque
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </TableCell>

        <TableCell className="text-xs text-muted-foreground font-medium">
          <NoTranslate as="span">{displayItem.supplier}</NoTranslate>
        </TableCell>

        <TableCell className="text-right text-sm font-bold">
          <div className="flex flex-col items-end">
            <NoTranslate as="span" className={cn(isBatch && 'text-blue-700 dark:text-blue-300')}>
              {displayItem.totalQuantity} un
            </NoTranslate>
            {isBatch && displayItem.surplusQuantity > 0 && (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                ({displayItem.opQuantity} + {displayItem.surplusQuantity})
              </span>
            )}
          </div>
        </TableCell>

        <TableCell className="text-right text-xs text-muted-foreground">
          <NoTranslate as="span">{displayItem.receivedQuantity || '-'}</NoTranslate>
        </TableCell>

        <TableCell className="text-right text-sm">
          <NoTranslate as="span">
            {displayItem.unitPrice > 0 ? formatCurrency(displayItem.unitPrice) : '-'}
          </NoTranslate>
        </TableCell>

        <TableCell className="text-right text-sm font-semibold">
          <NoTranslate as="span">
            {displayItem.totalValue > 0 ? formatCurrency(displayItem.totalValue) : '-'}
          </NoTranslate>
        </TableCell>

        <TableCell className="text-xs text-muted-foreground">
          {displayItem.expectedDate ? format(parseISO(displayItem.expectedDate), 'dd/MM/yy') : '-'}
        </TableCell>

        <TableCell>
          <div className="flex items-center gap-1 justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => onEdit(rep)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isBatch ? 'Editar lote completo' : 'Editar item'}</TooltipContent>
            </Tooltip>

            {onDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => onDelete(rep)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isBatch ? 'Remover lote completo' : 'Remover linha / cancelar'}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Detalhe interno expandível do lote com o rateio das OPs e do excedente de estoque */}
      {isBatch && expanded && (
        <TableRow className="bg-blue-50/50 dark:bg-blue-950/25 border-t-0">
          <TableCell colSpan={11} className="py-2.5 px-4 pl-12">
            <div className="p-3 bg-white/90 dark:bg-slate-900/90 rounded-md border border-blue-200 dark:border-blue-900 shadow-xs space-y-2 text-xs">
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-blue-600" />
                  Rastreio interno do lote — Rateio por OP e Estoque:
                </span>
                <span className="text-blue-700 dark:text-blue-300 font-bold">
                  Total real do lote: {displayItem.totalQuantity} un
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                {/* Solicitações das OPs */}
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    OPs Vinculadas ({displayItem.opItems.length} OPs — {displayItem.opQuantity} un):
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
                            {opItem.quantity} un
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Excedente / Compra para Estoque */}
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
                          +{displayItem.surplusQuantity} un
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
                      OPs ({displayItem.opQuantity} un).
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

function TableCols({
  showCheckbox,
  allSelected,
  onToggleSelectAll,
}: {
  showCheckbox: boolean
  allSelected: boolean
  onToggleSelectAll: () => void
}) {
  return (
    <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
      <TableRow>
        <TableHead className="w-[40px]">
          {showCheckbox && <Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} />}
        </TableHead>
        <TableHead className="w-[80px]">Data</TableHead>
        <TableHead className="w-[80px]">Código</TableHead>
        <TableHead>Descrição</TableHead>
        <TableHead className="w-[140px]">Fornecedor</TableHead>
        <TableHead className="text-right w-[70px]">Qtde</TableHead>
        <TableHead className="text-right w-[80px]">Recebida</TableHead>
        <TableHead className="text-right w-[100px]">Vl. Unit.</TableHead>
        <TableHead className="text-right w-[110px]">Vl. Total</TableHead>
        <TableHead className="w-[100px]">Prazo</TableHead>
        <TableHead className="w-[80px] text-right">Ações</TableHead>
      </TableRow>
    </TableHeader>
  )
}

export function ComprasTable({
  items,
  allShortages,
  onEdit,
  onDelete,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onToggleSelectGroup,
  grouped = false,
}: ComprasTableProps) {
  const shortagesPool = allShortages || items

  // Constrói os itens consolidados para exibição (lotes agrupados em 1 linha)
  const displayItems = useMemo(() => buildComprasDisplayItems(items), [items])

  const allSelected = items.length > 0 && selectedIds.size === items.length

  const consolidationsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findOtherOpDemands>>()
    for (const dItem of displayItems) {
      map.set(dItem.representative.id, findOtherOpDemands(dItem.representative, shortagesPool))
    }
    return map
  }, [displayItems, shortagesPool])

  // Agrupamento por fornecedor respeitando os displayItems (declarado incondicionalmente antes de qualquer return)
  const supplierDisplayGroups = useMemo(() => {
    const map = new Map<string, ComprasDisplayItem[]>()
    for (const dItem of displayItems) {
      const sup = dItem.supplier || 'Sem Fornecedor'
      const arr = map.get(sup) || []
      arr.push(dItem)
      map.set(sup, arr)
    }

    return Array.from(map.entries()).map(([supplier, groupItems]) => {
      const totalValue = groupItems.reduce((sum, it) => sum + it.totalValue, 0)
      const allItemIds = groupItems.flatMap((it) => it.allMemberIds)
      return {
        supplier: supplier === 'Sem Fornecedor' ? '' : supplier,
        displayItems: groupItems,
        allItemIds,
        totalValue,
      }
    })
  }, [displayItems])

  if (!grouped) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableCols showCheckbox allSelected={allSelected} onToggleSelectAll={onToggleSelectAll} />
          <TableBody>
            {displayItems.map((dItem) => (
              <ComprasDisplayRow
                key={dItem.id}
                displayItem={dItem}
                consolidation={consolidationsMap.get(dItem.representative.id)}
                onEdit={onEdit}
                onDelete={onDelete}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {supplierDisplayGroups.map((group) => {
        const groupAllSelected =
          group.allItemIds.length > 0 && group.allItemIds.every((id) => selectedIds.has(id))

        return (
          <SupplierGroupSection
            key={group.supplier || '__no_supplier__'}
            supplier={group.supplier}
            itemCount={group.displayItems.length}
            totalValue={group.totalValue}
            allSelected={groupAllSelected}
            onSelectAll={() => onToggleSelectGroup?.(group.allItemIds)}
          >
            <Table>
              <TableCols showCheckbox={false} allSelected={false} onToggleSelectAll={() => {}} />
              <TableBody>
                {group.displayItems.map((dItem) => (
                  <ComprasDisplayRow
                    key={dItem.id}
                    displayItem={dItem}
                    consolidation={consolidationsMap.get(dItem.representative.id)}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    selectedIds={selectedIds}
                    onToggleSelect={onToggleSelect}
                  />
                ))}
              </TableBody>
            </Table>
          </SupplierGroupSection>
        )
      })}
    </div>
  )
}
