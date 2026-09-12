import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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

import { useMemo } from 'react'
import { findOtherOpDemands } from '@/services/material-consolidation'
import { ConsolidatedDemandBadge } from './ConsolidatedDemandBlock'

interface TriageTableProps {
  items: MaterialShortage[]
  allShortages?: MaterialShortage[]
  onRowClick: (item: MaterialShortage) => void
}

export function TriageTable({ items, allShortages, onRowClick }: TriageTableProps) {
  const shortagesPool = allShortages || items
  const consolidationsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findOtherOpDemands>>()
    for (const item of items) {
      map.set(item.id, findOtherOpDemands(item, shortagesPool))
    }
    return map
  }, [items, shortagesPool])
  const selectedIds = useShortageStore((s) => s.selectedIds)
  const toggle = useShortageStore((s) => s.toggle)
  const { isNew } = useNewRequests()

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
          <TableRow>
            <TableHead className="w-[40px]" />
            <TableHead className="w-[60px]">Status</TableHead>
            <TableHead className="w-[80px]">Data</TableHead>
            <TableHead className="w-[80px]">Código</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="text-right w-[60px]">Qtde</TableHead>
            <TableHead className="w-[100px]">Setor</TableHead>
            <TableHead className="w-[100px]">Prioridade</TableHead>
            <TableHead className="w-[120px]">Solicitante</TableHead>
            <TableHead className="w-[90px]">Nº do Pedido</TableHead>
            <TableHead className="w-[90px]">Nº da OP</TableHead>
            <TableHead className="w-[100px]">Data da Necessidade</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const selected = selectedIds.includes(item.id)
            const newItem = isNew(item.id)
            return (
              <TableRow
                key={item.id}
                className={cn(
                  'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors',
                  newItem && 'bg-blue-50/50 dark:bg-blue-900/10',
                )}
                onClick={() => onRowClick(item)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected} onCheckedChange={() => toggle?.(item.id)} />
                </TableCell>
                <TableCell>
                  {newItem && (
                    <Badge className="bg-blue-600 text-white text-[10px] animate-pulse">Novo</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {format(parseISO(item.created), 'dd/MM/yy')}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{item.code || '-'}</TableCell>
                <TableCell className="font-medium text-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                    <span>{item.description}</span>
                    <ConsolidatedDemandBadge consolidation={consolidationsMap.get(item.id)} />
                  </div>
                </TableCell>
                <TableCell className="text-right text-sm font-semibold">{item.quantity}</TableCell>
                <TableCell className="text-xs">{item.sector || '-'}</TableCell>
                <TableCell className="text-xs">
                  {item.priority && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px]',
                        item.priority === 'Urgente' && 'border-red-500 text-red-600',
                        item.priority === 'Próximos dias' && 'border-yellow-500 text-yellow-600',
                      )}
                    >
                      {item.priority}
                    </Badge>
                  )}
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
                  {item.expand?.order_id?.order_number || '-'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {item.expand?.order_id?.op_number || '-'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {item.expected_date ? format(parseISO(item.expected_date), 'dd/MM/yy') : ''}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
