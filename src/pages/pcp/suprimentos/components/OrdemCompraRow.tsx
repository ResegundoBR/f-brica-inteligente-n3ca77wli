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
import { Eye, Pencil } from 'lucide-react'
import { format, parseISO, isBefore, startOfDay } from 'date-fns'
import type { OrdemCompra } from '@/types'
import { UserActionBadge } from '@/components/UserActionBadge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface OrdemCompraRowProps {
  oc: OrdemCompra
  onStatusChange: (id: string, status: string) => void
  onViewDoc: (oc: OrdemCompra) => void
  onEdit?: (oc: OrdemCompra) => void
}

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function OrdemCompraRow({ oc, onStatusChange, onViewDoc, onEdit }: OrdemCompraRowProps) {
  const overdue =
    oc.expected_date &&
    oc.status !== 'Recebida' &&
    oc.status !== 'Cancelada' &&
    isBefore(parseISO(oc.expected_date), startOfDay(new Date()))

  const isReceived = oc.status === 'Recebida'

  return (
    <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
      <TableCell className="font-bold text-sm notranslate" translate="no">
        {oc.oc_number}
      </TableCell>
      <TableCell className="text-sm font-medium">
        <div className="notranslate" translate="no">
          {oc.supplier}
        </div>
        {oc.expand?.user_id && (
          <div className="mt-0.5">
            <UserActionBadge
              user={oc.expand.user_id}
              date={oc.created}
              prefix="por"
              compact={true}
            />
          </div>
        )}
      </TableCell>
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
      <TableCell className="text-right text-sm font-semibold notranslate" translate="no">
        {oc.total ? formatCurrency(Number(oc.total)) : '-'}
      </TableCell>
      <TableCell className="text-xs">{oc.delivery_type || '-'}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{oc.payment_terms || '-'}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1 justify-end">
          {onEdit && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      disabled={isReceived}
                      onClick={() => onEdit(oc)}
                      aria-label="Editar Ordem de Compra"
                    >
                      <Pencil className="size-3.5 text-slate-600 dark:text-slate-400" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {isReceived
                    ? 'Ordens de compra com status "Recebida" não podem ser editadas.'
                    : 'Editar Ordem de Compra'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => onViewDoc(oc)}
            aria-label="Visualizar documento da OC"
          >
            <Eye className="size-3.5 text-slate-600 dark:text-slate-400" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
