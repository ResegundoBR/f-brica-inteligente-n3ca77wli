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
import { Pencil } from 'lucide-react'
import { useSupplierGroups } from '@/hooks/use-supplier-groups'
import { SupplierGroupSection } from './SupplierGroupSection'
import { useMemo } from 'react'
import { findOtherOpDemands } from '@/services/material-consolidation'
import { ConsolidatedDemandBadge } from './ConsolidatedDemandBlock'

interface ComprasTableProps {
  items: MaterialShortage[]
  allShortages?: MaterialShortage[]
  onEdit: (item: MaterialShortage) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onToggleSelectGroup?: (ids: string[]) => void
  grouped?: boolean
}

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function ComprasRow({
  item,
  consolidation,
  onEdit,
  selectedIds,
  onToggleSelect,
}: {
  item: MaterialShortage
  consolidation?: ReturnType<typeof findOtherOpDemands>
  onEdit: (item: MaterialShortage) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
}) {
  const total = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
  const received = Number(item.received_quantity) || 0
  return (
    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selectedIds.has(item.id)}
          onCheckedChange={() => onToggleSelect(item.id)}
        />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {format(parseISO(item.created), 'dd/MM/yy')}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{item.code || '-'}</TableCell>
      <TableCell className="font-medium text-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
          <span>{item.description}</span>
          <ConsolidatedDemandBadge consolidation={consolidation} />
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{item.supplier || '-'}</TableCell>
      <TableCell className="text-right text-sm font-semibold">{item.quantity}</TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">{received || '-'}</TableCell>
      <TableCell className="text-right text-sm">
        {item.unit_price ? formatCurrency(Number(item.unit_price)) : '-'}
      </TableCell>
      <TableCell className="text-right text-sm font-semibold">
        {item.unit_price ? formatCurrency(total) : '-'}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {item.expected_date ? format(parseISO(item.expected_date), 'dd/MM/yy') : '-'}
      </TableCell>
      <TableCell>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(item)}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </TableCell>
    </TableRow>
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
        <TableHead className="w-[60px]"></TableHead>
      </TableRow>
    </TableHeader>
  )
}

export function ComprasTable({
  items,
  allShortages,
  onEdit,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onToggleSelectGroup,
  grouped = false,
}: ComprasTableProps) {
  const groups = useSupplierGroups(items)
  const allSelected = items.length > 0 && selectedIds.size === items.length
  const shortagesPool = allShortages || items

  const consolidationsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findOtherOpDemands>>()
    for (const item of items) {
      map.set(item.id, findOtherOpDemands(item, shortagesPool))
    }
    return map
  }, [items, shortagesPool])

  if (!grouped) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableCols showCheckbox allSelected={allSelected} onToggleSelectAll={onToggleSelectAll} />
          <TableBody>
            {items.map((item) => (
              <ComprasRow
                key={item.id}
                item={item}
                consolidation={consolidationsMap.get(item.id)}
                onEdit={onEdit}
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
      {groups.map((group) => {
        const groupIds = group.items.map((i) => i.id)
        const groupAllSelected = groupIds.every((id) => selectedIds.has(id))
        return (
          <SupplierGroupSection
            key={group.supplier || '__no_supplier__'}
            supplier={group.supplier}
            itemCount={group.items.length}
            totalValue={group.totalValue}
            allSelected={groupAllSelected}
            onSelectAll={() => onToggleSelectGroup?.(groupIds)}
          >
            <Table>
              <TableCols showCheckbox={false} allSelected={false} onToggleSelectAll={() => {}} />
              <TableBody>
                {group.items.map((item) => (
                  <ComprasRow
                    key={item.id}
                    item={item}
                    consolidation={consolidationsMap.get(item.id)}
                    onEdit={onEdit}
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
