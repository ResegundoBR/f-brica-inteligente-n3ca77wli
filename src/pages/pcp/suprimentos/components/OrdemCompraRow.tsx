import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TableCell, TableRow } from '@/components/ui/table'
import { Eye } from 'lucide-react'
import { format, parseISO, isBefore, startOfDay } from 'date-fns'
import type { OrdemCompra } from '@/types'

interface OrdemCompraRowProps {
  oc: OrdemCompra
  onStatusChange: (id: string, status: string) => void
  onViewDoc: (oc: OrdemCompra) => void
}

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function OrdemCompraRow({ oc, onStatusChange, onViewDoc }: OrdemCompraRowProps) {
  const overdue =
    oc.expected_date &&
    oc.status !== 'Recebida' &&
    oc.status !== 'Cancelada' &&
    isBefore(parseISO(oc.expected_date), startOfDay(new Date()))

  return (
    <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
      <TableCell className="font-bold text-sm">{oc.oc_number}</TableCell>
      <TableCell className="text-sm font-medium">{oc.supplier}</TableCell>
      <TableCell>
        <Select value={oc.status || 'Pendente'} onValueChange={(v) => onStatusChange(oc.id, v)}>
          <SelectTrigger className="h-8 w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Pendente">Pendente</SelectItem>
            <SelectItem value="Enviada">Enviada</SelectItem>
            <SelectItem value="Recebida">Recebida</SelectItem>
            <SelectItem value="Cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {oc.expected_date ? format(parseISO(oc.expected_date), 'dd/MM/yy') : '-'}
      </TableCell>
      <TableCell>
        {overdue ? (
          <Badge variant="destructive" className="text-[10px]">
            Atrasada
          </Badge>
        ) : oc.status === 'Recebida' ? (
          <Badge
            variant="outline"
            className="text-[10px] bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400"
          >
            Recebida
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            No prazo
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right text-sm font-semibold">
        {oc.total ? formatCurrency(Number(oc.total)) : '-'}
      </TableCell>
      <TableCell className="text-xs">{oc.delivery_type || '-'}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{oc.payment_terms || '-'}</TableCell>
      <TableCell>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onViewDoc(oc)}>
          <Eye className="size-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  )
}
