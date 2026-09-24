import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { NoTranslate } from '@/components/NoTranslate'
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
import { useShortageStore } from '@/stores/useShortageStore'
import { useNewRequests } from '@/hooks/use-new-requests'
import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { UserActionBadge } from '@/components/UserActionBadge'
import { ChevronDown, ChevronRight, Layers, ExternalLink } from 'lucide-react'
import { groupShortagesByCode, ShortageGroup } from '@/lib/shortage-grouping'

interface TriageTableProps {
  items: MaterialShortage[]
  allShortages?: MaterialShortage[]
  onRowClick: (item: MaterialShortage) => void
  onGroupClick?: (group: ShortageGroup) => void
  searchQuery?: string
}

export function TriageTable({
  items,
  onRowClick,
  onGroupClick,
  searchQuery = '',
}: TriageTableProps) {
  const selectedIds = useShortageStore((s) => s.selectedIds)
  const toggle = useShortageStore((s) => s.toggle)
  const toggleMultiple = useShortageStore((s) => s.toggleMultiple)
  const toggleAll = useShortageStore((s) => s.toggleAll)
  const { isNew, markAsViewed } = useNewRequests()

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  // Agrupa os itens da tabela por código + descrição
  const groups = useMemo(() => {
    return groupShortagesByCode(items, isNew)
  }, [items, isNew])

  // Se houver busca, auto-expandir grupos que contenham os itens correspondentes
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const activeExpandedKeys = useMemo(() => {
    if (!normalizedQuery) return expandedKeys
    const autoExpanded = new Set(expandedKeys)
    for (const group of groups) {
      const matchInChild = group.items.some((it) => {
        const op = it.expand?.order_id?.op_number?.toLowerCase() || ''
        const order = it.expand?.order_id?.order_number?.toLowerCase() || ''
        const req = it.expand?.requested_by?.name?.toLowerCase() || ''
        return (
          op.includes(normalizedQuery) ||
          order.includes(normalizedQuery) ||
          req.includes(normalizedQuery)
        )
      })
      if (matchInChild) {
        autoExpanded.add(group.key)
      }
    }
    return autoExpanded
  }, [normalizedQuery, groups, expandedKeys])

  const toggleGroupExpand = (key: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const allItemIds = useMemo(() => items.map((i) => i.id), [items])
  const allSelected = allItemIds.length > 0 && allItemIds.every((id) => selectedIds.includes(id))

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
          <TableRow>
            <TableHead className="w-[44px]">
              <Checkbox checked={allSelected} onCheckedChange={() => toggleAll()} />
            </TableHead>
            <TableHead className="w-[60px]">Status</TableHead>
            <TableHead className="w-[85px]">Data</TableHead>
            <TableHead className="w-[90px]">Código</TableHead>
            <TableHead>Descrição / Grupo</TableHead>
            <TableHead className="text-right w-[90px]">Qtde Total</TableHead>
            <TableHead className="w-[110px]">Setor</TableHead>
            <TableHead className="w-[100px]">Prioridade</TableHead>
            <TableHead className="w-[120px]">Solicitante</TableHead>
            <TableHead className="w-[90px]">Nº do Pedido</TableHead>
            <TableHead className="w-[90px]">Nº da OP</TableHead>
            <TableHead className="w-[100px]">Data Necessidade</TableHead>
            <TableHead className="w-[80px] text-center">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const isGroup = group.items.length > 1
            const isExpanded = activeExpandedKeys.has(group.key)
            const groupItemIds = group.items.map((i) => i.id)
            const allGroupSelected =
              groupItemIds.length > 0 && groupItemIds.every((id) => selectedIds.includes(id))
            const someGroupSelected =
              !allGroupSelected && groupItemIds.some((id) => selectedIds.includes(id))
            const representative = group.items[0]

            if (!isGroup) {
              // Item avulso (1 registro apenas) — renderiza linha única com comportamento normal
              const singleItem = representative
              const selected = selectedIds.includes(singleItem.id)
              const newItem = isNew(singleItem.id)
              return (
                <TableRow
                  key={singleItem.id}
                  className={cn(
                    'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors',
                    newItem && 'bg-blue-50/50 dark:bg-blue-900/10',
                  )}
                  onClick={() => onRowClick(singleItem)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected} onCheckedChange={() => toggle?.(singleItem.id)} />
                  </TableCell>
                  <TableCell>
                    {newItem && (
                      <Badge className="bg-blue-600 text-white text-[10px] animate-pulse">
                        Novo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {singleItem.created ? format(parseISO(singleItem.created), 'dd/MM/yy') : '-'}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    <NoTranslate as="span">{singleItem.code || '-'}</NoTranslate>
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    <NoTranslate as="span">{singleItem.description}</NoTranslate>
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold">
                    <NoTranslate as="span">{singleItem.quantity}</NoTranslate>
                  </TableCell>
                  <TableCell className="text-xs">{singleItem.sector || '-'}</TableCell>
                  <TableCell className="text-xs">
                    {singleItem.priority && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          singleItem.priority === 'Urgente' && 'border-red-500 text-red-600',
                          singleItem.priority === 'Próximos dias' &&
                            'border-yellow-500 text-yellow-600',
                        )}
                      >
                        {singleItem.priority}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <UserActionBadge
                      user={singleItem.expand?.requested_by}
                      date={singleItem.created}
                      prefix="por"
                      compact={true}
                      fallbackText="-"
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <NoTranslate as="span">
                      {singleItem.expand?.order_id?.order_number || '-'}
                    </NoTranslate>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <NoTranslate as="span">
                      {singleItem.expand?.order_id?.op_number || '-'}
                    </NoTranslate>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {singleItem.expected_date
                      ? format(parseISO(singleItem.expected_date), 'dd/MM/yy')
                      : ''}
                  </TableCell>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      onClick={() => onRowClick(singleItem)}
                    >
                      Triagem
                    </Button>
                  </TableCell>
                </TableRow>
              )
            }

            // Grupo com múltiplas OPs
            return (
              <tbody key={group.key} className="border-b">
                {/* Linha Cabeçalho do Grupo */}
                <TableRow
                  className={cn(
                    'cursor-pointer transition-colors font-medium',
                    'bg-slate-50/80 hover:bg-slate-100/80 dark:bg-slate-800/60 dark:hover:bg-slate-800',
                    allGroupSelected && 'bg-blue-50/70 dark:bg-blue-950/40',
                  )}
                  onClick={() => {
                    if (onGroupClick) {
                      onGroupClick(group)
                    } else {
                      toggleGroupExpand(group.key)
                    }
                  }}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={
                        allGroupSelected ? true : someGroupSelected ? 'indeterminate' : false
                      }
                      onCheckedChange={() => toggleMultiple(groupItemIds)}
                      aria-label={`Selecionar todo o lote ${group.description}`}
                    />
                  </TableCell>
                  <TableCell>
                    {group.hasNew && (
                      <Badge className="bg-blue-600 text-white text-[10px] animate-pulse">
                        Novo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
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
                        className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
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
                      <Badge
                        variant="secondary"
                        className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 text-[11px] font-semibold flex items-center gap-1 shrink-0"
                      >
                        <Layers className="size-3" />
                        {group.opCount} OP{group.opCount > 1 ? 's' : ''} ({group.items.length} req)
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm font-extrabold text-blue-700 dark:text-blue-300">
                    <NoTranslate as="span">{group.totalQuantity} un</NoTranslate>
                  </TableCell>
                  <TableCell className="text-xs text-slate-700 dark:text-slate-300">
                    <span className="truncate max-w-[110px] block" title={group.sectors.join(', ')}>
                      {group.sectors.join(', ') || '-'}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
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
                  <TableCell className="text-xs text-muted-foreground italic">
                    Vários ({group.items.length})
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="text-[11px] bg-slate-200/60 dark:bg-slate-700/60 px-1.5 py-0.5 rounded">
                      {group.items.length} pedidos
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="text-[11px] bg-blue-100/70 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 px-1.5 py-0.5 rounded font-medium">
                      {group.opCount} OPs
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <button
                      type="button"
                      onClick={(e) => toggleGroupExpand(group.key, e)}
                      className="text-blue-600 hover:underline text-[11px] flex items-center gap-0.5"
                    >
                      {isExpanded ? 'Ocultar OPs' : 'Ver OPs'}
                    </button>
                  </TableCell>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      className="h-7 px-2.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs"
                      onClick={() => onGroupClick?.(group)}
                    >
                      Lote <ExternalLink className="size-3 ml-1" />
                    </Button>
                  </TableCell>
                </TableRow>

                {/* Linhas Filhas Expandidas (cada OP/solicitação) */}
                {isExpanded &&
                  group.items.map((subItem) => {
                    const subSelected = selectedIds.includes(subItem.id)
                    const subNew = isNew(subItem.id)
                    return (
                      <TableRow
                        key={subItem.id}
                        className={cn(
                          'cursor-pointer hover:bg-blue-50/40 dark:hover:bg-slate-800/80 transition-colors bg-slate-50/30 dark:bg-slate-900/60 border-l-4 border-l-blue-400 dark:border-l-blue-600',
                          subNew && 'bg-blue-50/60 dark:bg-blue-900/20',
                        )}
                        onClick={() => {
                          markAsViewed(subItem.id)
                          onRowClick(subItem)
                        }}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={subSelected}
                            onCheckedChange={() => toggle?.(subItem.id)}
                          />
                        </TableCell>
                        <TableCell>
                          {subNew && (
                            <Badge className="bg-blue-500 text-white text-[9px] px-1 py-0">
                              Novo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {subItem.created ? format(parseISO(subItem.created), 'dd/MM/yy') : '-'}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          <NoTranslate as="span">{subItem.code || '-'}</NoTranslate>
                        </TableCell>
                        <TableCell className="text-xs text-slate-700 dark:text-slate-300 pl-6">
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">↳ OP:</span>
                            <span
                              className="font-semibold text-slate-900 dark:text-slate-100 notranslate"
                              translate="no"
                            >
                              {subItem.expand?.order_id?.op_number || '-'}
                            </span>
                            {subItem.observation && (
                              <span className="text-[10px] text-muted-foreground italic truncate max-w-[200px]">
                                ({subItem.observation})
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold text-slate-800 dark:text-slate-200">
                          <NoTranslate as="span">{subItem.quantity} un</NoTranslate>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {subItem.sector || '-'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {subItem.priority && (
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[9px] px-1 py-0',
                                subItem.priority === 'Urgente' && 'border-red-500 text-red-600',
                                subItem.priority === 'Próximos dias' &&
                                  'border-yellow-500 text-yellow-600',
                              )}
                            >
                              {subItem.priority}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <UserActionBadge
                            user={subItem.expand?.requested_by}
                            date={subItem.created}
                            prefix="por"
                            compact={true}
                            fallbackText="-"
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          <NoTranslate as="span">
                            {subItem.expand?.order_id?.order_number || '-'}
                          </NoTranslate>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono font-medium">
                          <NoTranslate as="span">
                            {subItem.expand?.order_id?.op_number || '-'}
                          </NoTranslate>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {subItem.expected_date
                            ? format(parseISO(subItem.expected_date), 'dd/MM/yy')
                            : '-'}
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-[11px] text-blue-600 hover:text-blue-700"
                            onClick={() => onRowClick(subItem)}
                          >
                            Individual
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
              </tbody>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
