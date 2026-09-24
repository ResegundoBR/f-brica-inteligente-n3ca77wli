import React, { useState, useMemo, Fragment } from 'react'
import { format, parseISO } from 'date-fns'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MaterialShortage } from '@/types'
import { NovoBadge } from '@/components/NovoBadge'
import { NoTranslate } from '@/components/NoTranslate'
import { useSupplierGroups } from '@/hooks/use-supplier-groups'
import { SupplierGroupSection } from './SupplierGroupSection'
import { UserActionBadge } from '@/components/UserActionBadge'
import { ChevronDown, ChevronRight, Layers, ShoppingCart } from 'lucide-react'
import { groupShortagesByCode, ShortageGroup } from '@/lib/shortage-grouping'
import { cn } from '@/lib/utils'

interface CotacoesTableProps {
  items: MaterialShortage[]
  allShortages?: MaterialShortage[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onToggleSelectGroup: (ids: string[]) => void
  onRowClick: (item: MaterialShortage, groupItems?: MaterialShortage[]) => void
  onQuickCompra: (item: MaterialShortage, groupItems?: MaterialShortage[]) => void
  isNew: (id: string) => boolean
  grouped?: boolean
}

export function CotacoesTable({
  items,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onToggleSelectGroup,
  onRowClick,
  onQuickCompra,
  isNew,
  grouped = false,
}: CotacoesTableProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  // Grupos consolidados por código + descrição
  const consolidatedGroups = useMemo(() => {
    return groupShortagesByCode(items, isNew)
  }, [items, isNew])

  const toggleGroupExpand = (key: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Se grouped por fornecedor estiver ativo:
  const supplierGroups = useSupplierGroups(items)
  const allSelected = items.length > 0 && selectedIds.size === items.length

  if (grouped) {
    return (
      <div className="space-y-3">
        {supplierGroups.map((group) => {
          const groupIds = group.items.map((i) => i.id)
          const groupAllSelected =
            groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id))
          return (
            <SupplierGroupSection
              key={group.supplier || '__no_supplier__'}
              supplier={group.supplier}
              itemCount={group.items.length}
              totalValue={group.totalValue}
              allSelected={groupAllSelected}
              onSelectAll={() => onToggleSelectGroup(groupIds)}
            >
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                  <TableRow>
                    <TableHead className="w-[40px]" />
                    <TableHead className="w-[80px]">Data</TableHead>
                    <TableHead className="w-[80px]">Código</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-[120px]">Solicitante</TableHead>
                    <TableHead className="w-[100px]">Nº Pedido</TableHead>
                    <TableHead className="w-[100px]">Nº OP</TableHead>
                    <TableHead className="text-right w-[70px]">Qtde</TableHead>
                    <TableHead className="w-[80px]">Prioridade</TableHead>
                    <TableHead className="w-[110px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((item) => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                      onClick={() => onRowClick(item)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={() => onToggleSelect(item.id)}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.created ? format(parseISO(item.created), 'dd/MM/yy') : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        <NoTranslate as="span">{item.code || '-'}</NoTranslate>
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        <div className="flex items-center gap-2">
                          <NoTranslate as="span">{item.description}</NoTranslate>
                          {isNew(item.id) && <NovoBadge />}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <UserActionBadge
                          user={item.expand?.requested_by}
                          date={item.created}
                          prefix="por"
                          compact={true}
                          fallbackText="-"
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <NoTranslate as="span">
                          {item.expand?.order_id?.order_number || '-'}
                        </NoTranslate>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-medium">
                        <NoTranslate as="span">
                          {item.expand?.order_id?.op_number || '-'}
                        </NoTranslate>
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        <NoTranslate as="span">{item.quantity}</NoTranslate>
                      </TableCell>
                      <TableCell>
                        {item.priority && (
                          <Badge variant="outline" className="text-[10px]">
                            {item.priority}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs whitespace-nowrap"
                          onClick={() => onQuickCompra(item)}
                        >
                          ⏭️ Compras
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SupplierGroupSection>
          )
        })}
      </div>
    )
  }

  // MODO CONSOLIDADO POR CÓDIGO (Padrão)
  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
          <TableRow>
            <TableHead className="w-[44px]">
              <Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} />
            </TableHead>
            <TableHead className="w-[85px]">Data</TableHead>
            <TableHead className="w-[90px]">Código</TableHead>
            <TableHead>Descrição / Produto</TableHead>
            <TableHead className="w-[120px]">OPs Atendidas</TableHead>
            <TableHead className="w-[110px]">Fornecedor</TableHead>
            <TableHead className="w-[90px]">Preço Unit.</TableHead>
            <TableHead className="text-right w-[90px]">Qtde Total</TableHead>
            <TableHead className="w-[85px]">Prioridade</TableHead>
            <TableHead className="w-[120px] text-center">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {consolidatedGroups.map((group) => {
            const isGroup = group.items.length > 1
            const isExpanded = expandedKeys.has(group.key)
            const groupItemIds = group.items.map((i) => i.id)
            const allGroupSelected =
              groupItemIds.length > 0 && groupItemIds.every((id) => selectedIds.has(id))
            const someGroupSelected =
              !allGroupSelected && groupItemIds.some((id) => selectedIds.has(id))

            const firstItem = group.items[0]
            const activeSupplier = group.items.find((i) => i.supplier)?.supplier || '-'
            const activePrice = group.items.find((i) => i.unit_price)?.unit_price

            if (!isGroup) {
              const singleItem = firstItem
              return (
                <TableRow
                  key={singleItem.id}
                  className={cn(
                    'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors',
                    selectedIds.has(singleItem.id) && 'bg-blue-50/50 dark:bg-blue-900/10',
                  )}
                  onClick={() => onRowClick(singleItem, group.items)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(singleItem.id)}
                      onCheckedChange={() => onToggleSelect(singleItem.id)}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {singleItem.created ? format(parseISO(singleItem.created), 'dd/MM/yy') : '-'}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    <NoTranslate as="span">{singleItem.code || '-'}</NoTranslate>
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    <div className="flex items-center gap-2">
                      <NoTranslate as="span">{singleItem.description}</NoTranslate>
                      {isNew(singleItem.id) && <NovoBadge />}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      OP {singleItem.expand?.order_id?.op_number || '-'}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    <NoTranslate as="span">{singleItem.supplier || '-'}</NoTranslate>
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {singleItem.unit_price ? `R$ ${singleItem.unit_price.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold">
                    <NoTranslate as="span">{singleItem.quantity}</NoTranslate>
                  </TableCell>
                  <TableCell>
                    {singleItem.priority && (
                      <Badge variant="outline" className="text-[10px]">
                        {singleItem.priority}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()} className="text-center">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs whitespace-nowrap text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                      onClick={() => onQuickCompra(singleItem, group.items)}
                    >
                      Comprar
                    </Button>
                  </TableCell>
                </TableRow>
              )
            }

            // Linha Consolidada com Múltiplas OPs
            return (
              <Fragment key={group.key}>
                <TableRow
                  className={cn(
                    'cursor-pointer transition-colors font-medium border-b',
                    'bg-slate-50/80 hover:bg-slate-100/80 dark:bg-slate-800/60 dark:hover:bg-slate-800',
                    allGroupSelected && 'bg-blue-50/70 dark:bg-blue-950/40',
                  )}
                  onClick={() => onRowClick(firstItem, group.items)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={
                        allGroupSelected ? true : someGroupSelected ? 'indeterminate' : false
                      }
                      onCheckedChange={() => onToggleSelectGroup(groupItemIds)}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="text-[11px] font-semibold text-slate-500">
                      Lote ({group.items.length})
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                    <NoTranslate as="span">{group.code || '-'}</NoTranslate>
                  </TableCell>
                  <TableCell className="font-semibold text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => toggleGroupExpand(group.key, e)}
                        className="p-1 rounded hover:bg-slate-200/70 text-slate-600 transition-colors"
                        title={isExpanded ? 'Recolher OPs' : 'Expandir OPs'}
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-4 text-blue-600 font-bold" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                      <NoTranslate
                        as="span"
                        className="font-bold text-slate-900 dark:text-slate-100"
                      >
                        {group.description}
                      </NoTranslate>
                      {group.hasNew && <NovoBadge />}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge
                      variant="secondary"
                      className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer w-fit"
                      onClick={(e) => toggleGroupExpand(group.key, e)}
                    >
                      <Layers className="size-3" />
                      {group.opCount} OP{group.opCount > 1 ? 's' : ''} ({group.items.length} req)
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    <NoTranslate as="span">{activeSupplier}</NoTranslate>
                  </TableCell>
                  <TableCell className="text-xs font-mono font-semibold">
                    {activePrice ? `R$ ${activePrice.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell className="text-right text-sm font-extrabold text-blue-700 dark:text-blue-300">
                    <NoTranslate as="span">{group.totalQuantity} un</NoTranslate>
                  </TableCell>
                  <TableCell>
                    {group.highestPriority && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          group.highestPriority === 'Urgente' &&
                            'border-red-500 text-red-600 font-bold',
                          group.highestPriority === 'Próximos dias' &&
                            'border-yellow-500 text-yellow-600',
                        )}
                      >
                        {group.highestPriority}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()} className="text-center">
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
                      onClick={() => onQuickCompra(firstItem, group.items)}
                    >
                      <ShoppingCart className="size-3.5 mr-1" />
                      Comprar Lote
                    </Button>
                  </TableCell>
                </TableRow>

                {/* Sublinhas das OPs que compõem este lote */}
                {isExpanded &&
                  group.items.map((subItem) => (
                    <TableRow
                      key={subItem.id}
                      className="hover:bg-blue-50/40 dark:hover:bg-slate-800/80 transition-colors bg-slate-50/30 dark:bg-slate-900/60 border-l-4 border-l-blue-400"
                      onClick={() => onRowClick(subItem, group.items)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(subItem.id)}
                          onCheckedChange={() => onToggleSelect(subItem.id)}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {subItem.created ? format(parseISO(subItem.created), 'dd/MM/yy') : '-'}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        <NoTranslate as="span">{subItem.code || '-'}</NoTranslate>
                      </TableCell>
                      <TableCell className="text-xs text-slate-700 dark:text-slate-300 pl-6">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">↳ Pedido:</span>
                          <span className="font-mono text-slate-800 notranslate" translate="no">
                            {subItem.expand?.order_id?.order_number || '-'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                        OP {subItem.expand?.order_id?.op_number || '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <NoTranslate as="span">{subItem.supplier || '-'}</NoTranslate>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {subItem.unit_price ? `R$ ${subItem.unit_price.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right text-xs font-bold text-slate-800 dark:text-slate-200">
                        <NoTranslate as="span">{subItem.quantity} un</NoTranslate>
                      </TableCell>
                      <TableCell>
                        {subItem.priority && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">
                            {subItem.priority}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()} className="text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-[11px] text-emerald-700 hover:text-emerald-800"
                          onClick={() => onQuickCompra(subItem, [subItem])}
                        >
                          Individual
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
