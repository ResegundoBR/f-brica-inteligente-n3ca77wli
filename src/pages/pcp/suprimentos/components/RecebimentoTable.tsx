import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MaterialShortage } from '@/types'
import { CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSupplierGroups } from '@/hooks/use-supplier-groups'
import { SupplierGroupSection } from './SupplierGroupSection'

interface RecebimentoTableProps {
  items: MaterialShortage[]
  grouped: boolean
  codeInputs: Record<string, string>
  onCodeChange: (id: string, value: string) => void
  onDistribuir: (item: MaterialShortage) => void
}

function RecebimentoRow({
  item,
  codeInputs,
  onCodeChange,
  onDistribuir,
}: {
  item: MaterialShortage
  codeInputs: Record<string, string>
  onCodeChange: (id: string, value: string) => void
  onDistribuir: (item: MaterialShortage) => void
}) {
  const received = Number(item.received_quantity) || 0
  const total = Number(item.quantity) || 0
  return (
    <TableRow key={item.id}>
      <TableCell className="text-xs text-muted-foreground">
        {item.code ? (
          <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">
            {item.code}
          </span>
        ) : (
          <Input
            placeholder="Cod. opcional"
            className="h-7 w-24 text-xs"
            value={codeInputs[item.id] ?? ''}
            onChange={(e) => onCodeChange(item.id, e.target.value)}
          />
        )}
      </TableCell>
      <TableCell className="font-medium text-sm">{item.description}</TableCell>
      <TableCell className="text-right font-semibold">{total}</TableCell>
      <TableCell className="text-right">
        <span className={cn('font-bold', received > 0 && received < total && 'text-amber-600')}>
          {received}
        </span>
        <span className="text-xs text-muted-foreground"> / {total}</span>
      </TableCell>
      <TableCell className="text-xs">{item.supplier || '-'}</TableCell>
      <TableCell className="text-xs">
        {item.expected_date ? format(parseISO(item.expected_date), 'dd/MM/yyyy') : '-'}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn(
            'whitespace-nowrap',
            item.status === 'Recebido_Parcial' &&
              'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
            item.status === 'Compra' &&
              'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
          )}
        >
          {item.status.replace('_', ' ')}
        </Badge>
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          className="h-8 bg-green-600 hover:bg-green-700 text-white"
          onClick={() => onDistribuir(item)}
        >
          <CheckCircle className="size-3.5 mr-1" />
          Distribuir
        </Button>
      </TableCell>
    </TableRow>
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

export function RecebimentoTable({
  items,
  grouped,
  codeInputs,
  onCodeChange,
  onDistribuir,
}: RecebimentoTableProps) {
  const groups = useSupplierGroups(items)

  if (!grouped) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableCols />
          <TableBody>
            {items.map((item) => (
              <RecebimentoRow
                key={item.id}
                item={item}
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

  return (
    <div className="space-y-3">
      {groups.map((group) => (
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
              {group.items.map((item) => (
                <RecebimentoRow
                  key={item.id}
                  item={item}
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
