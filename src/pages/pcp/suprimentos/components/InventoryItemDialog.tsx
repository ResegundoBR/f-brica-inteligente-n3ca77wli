import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Inventory, InventoryMovement } from '@/types'
import { getMovementsByInventory, createMovement } from '@/services/inventory'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

export function InventoryItemDialog({
  item,
  open,
  onOpenChange,
}: {
  item: Inventory | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [type, setType] = useState<'Entrada' | 'Saída'>('Entrada')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const { toast } = useToast()

  useEffect(() => {
    if (open && item) {
      getMovementsByInventory(item.id)
        .then(setMovements)
        .catch(() => {})
      setType('Entrada')
      setQuantity('')
      setReason('')
    }
  }, [open, item])

  const handleAddMovement = async () => {
    if (!item) return
    const numQty = Number(quantity)
    if (!Number.isFinite(numQty) || numQty <= 0) {
      toast({ title: 'Erro', description: 'Quantidade inválida', variant: 'destructive' })
      return
    }
    try {
      await createMovement({
        inventory_id: item.id,
        quantity: numQty,
        type,
        reason: reason.trim() || undefined,
      })
      const refreshed = await getMovementsByInventory(item.id)
      setMovements(refreshed)
      setQuantity('')
      setReason('')
      toast({ title: 'Movimentação registrada' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  if (!item) return null
  const isLow = item.quantity <= (item.min_quantity || 0)

  const orderLabel = (m: InventoryMovement) => {
    const o = m.expand?.order_id
    if (!o) return '-'
    return o.op_number || o.order_number || '-'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[780px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item.description}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded border">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Código</span>
              <span className="font-semibold text-sm">{item.code}</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded border">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Saldo Atual
              </span>
              <span
                className={cn(
                  'font-bold text-sm',
                  isLow ? 'text-red-600' : 'text-slate-800 dark:text-slate-200',
                )}
              >
                {item.quantity} {item.unit}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded border">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Estoque Mín.
              </span>
              <span className="font-semibold text-sm">
                {item.min_quantity || 0} {item.unit}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded border">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Status</span>
              {isLow ? (
                <Badge variant="destructive" className="text-[10px]">
                  Baixo
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  OK
                </Badge>
              )}
            </div>
          </div>

          <div className="border rounded-md overflow-hidden max-h-[260px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs text-right">Qtde</TableHead>
                  <TableHead className="text-xs">Motivo</TableHead>
                  <TableHead className="text-xs">Ordem</TableHead>
                  <TableHead className="text-xs">Responsável</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground text-xs py-4"
                    >
                      Sem movimentações.
                    </TableCell>
                  </TableRow>
                ) : (
                  movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(m.created), 'dd/MM/yy HH:mm')}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          variant={m.type === 'Entrada' ? 'secondary' : 'destructive'}
                          className="text-[10px]"
                        >
                          {m.type}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-xs text-right font-semibold whitespace-nowrap',
                          m.type === 'Entrada' ? 'text-green-600' : 'text-red-500',
                        )}
                      >
                        {m.type === 'Entrada' ? '+' : '-'}
                        {m.quantity}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                        {m.reason || '-'}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{orderLabel(m)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {m.expand?.user_id?.name || '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="border-t pt-3 space-y-3">
            <Label className="font-semibold text-sm">Nova Movimentação Manual</Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={type} onValueChange={(v) => setType(v as 'Entrada' | 'Saída')}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Entrada">Entrada</SelectItem>
                    <SelectItem value="Saída">Saída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantidade</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Motivo</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Motivo..."
                />
              </div>
            </div>
            <Button size="sm" onClick={handleAddMovement} disabled={!quantity}>
              Registrar Movimentação
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
