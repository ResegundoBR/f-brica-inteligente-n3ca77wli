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
import { useSupplierGroups } from '@/hooks/use-supplier-groups'
import { SupplierGroupSection } from './SupplierGroupSection'

interface CotacoesTableProps {
  items: MaterialShortage[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onToggleSelectGroup: (ids: string[]) => void
  onRowClick: (item: MaterialShortage) => void
  onQuickCompra: (item: MaterialShortage) => void
  isNew: (id: string) => boolean
  grouped?: boolean
}

function CotacoesRow({
  item,
  selectedIds,
  onToggleSelect,
  onRowClick,
  onQuickCompra,
  isNew,
}: {
  item: MaterialShortage
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onRowClick: (item: MaterialShortage) => void
  onQuickCompra: (item: MaterialShortage) => void
  isNew: (id: string) => boolean
}) {
  return (
    <TableRow
      key={item.id}
      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      onClick={() => onRowClick(item)}
    >
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
        <div className="flex items-center gap-2">
          {item.description}
          {isNew(item.id) && <NovoBadge />}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {item.expand?.requested_by?.name || '-'}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {item.expand?.order_id?.order_number || '-'}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {item.expand?.order_id?.op_number || '-'}
      </TableCell>
      <TableCell className="text-right text-sm font-semibold">{item.quantity}</TableCell>
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
        <TableHead className="w-[120px]">Solicitante</TableHead>
        <TableHead className="w-[100px]">Nº do Pedido</TableHead>
        <TableHead className="w-[100px]">Nº da OP</TableHead>
        <TableHead className="text-right w-[60px]">Qtde</TableHead>
        <TableHead className="w-[80px]">Prioridade</TableHead>
        <TableHead className="w-[110px]">Ações</TableHead>
      </TableRow>
    </TableHeader>
  )
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
  const groups = useSupplierGroups(items)
  const allSelected = items.length > 0 && selectedIds.size === items.length

  if (!grouped) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableCols showCheckbox allSelected={allSelected} onToggleSelectAll={onToggleSelectAll} />
          <TableBody>
            {items.map((item) => (
              <CotacoesRow
                key={item.id}
                item={item}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                onRowClick={onRowClick}
                onQuickCompra={onQuickCompra}
                isNew={isNew}
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
            onSelectAll={() => onToggleSelectGroup(groupIds)}
          >
            <Table>
              <TableCols showCheckbox={false} allSelected={false} onToggleSelectAll={() => {}} />
              <TableBody>
                {group.items.map((item) => (
                  <CotacoesRow
                    key={item.id}
                    item={item}
                    selectedIds={selectedIds}
                    onToggleSelect={onToggleSelect}
                    onRowClick={onRowClick}
                    onQuickCompra={onQuickCompra}
                    isNew={isNew}
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
