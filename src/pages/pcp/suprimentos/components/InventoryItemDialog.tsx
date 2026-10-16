import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { NoTranslate } from '@/components/NoTranslate'
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
import { UserActionBadge } from '@/components/UserActionBadge'
import { cn } from '@/lib/utils'
import { formatQuantity, parseQuantityInput } from '@/lib/pcp-utils'
import { format, parseISO, isValid } from 'date-fns'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AlertTriangle, AlertCircle } from 'lucide-react'

function fmtDate(val?: string) {
  if (!val) return '-'
  try {
    const d = parseISO(val)
    return isValid(d) ? format(d, 'dd/MM/yy') : '-'
  } catch {
    return '-'
  }
}

function fmtCurrency(val?: number) {
  if (val == null || val === 0) return '-'
  return `R$ ${Number(val).toFixed(2)}`
}

function fmtDateTime(val?: string) {
  if (!val) return '-'
  try {
    const d = new Date(val)
    return isValid(d) ? format(d, 'dd/MM/yy HH:mm') : '-'
  } catch {
    return '-'
  }
}

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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmLargeOpen, setConfirmLargeOpen] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open && item) {
      getMovementsByInventory(item.id)
        .then(setMovements)
        .catch(() => {})
      setType('Entrada')
      setQuantity('')
      setReason('')
      setConfirmLargeOpen(false)
    }
  }, [open, item])

  const executeMovement = async (confirmedLarge = false) => {
    if (!item) return
    const numQty = parseQuantityInput(quantity)
    if (!Number.isFinite(numQty) || numQty <= 0) {
      toast({ title: 'Erro', description: 'Quantidade inválida', variant: 'destructive' })
      return
    }

    if (numQty > 100000) {
      toast({
        title: 'Quantidade bloqueada',
        description:
          'Quantidades acima de 100.000 unidades não são permitidas por segurança do sistema.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)
    try {
      await createMovement({
        inventory_id: item.id,
        quantity: numQty,
        type,
        reason: reason.trim() || undefined,
        confirmed_large: confirmedLarge,
      })
      const refreshed = await getMovementsByInventory(item.id)
      setMovements(refreshed)
      setQuantity('')
      setReason('')
      setConfirmLargeOpen(false)
      toast({ title: 'Movimentação registrada com sucesso' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddMovement = async () => {
    if (!item) return
    const numQty = parseQuantityInput(quantity)
    if (!Number.isFinite(numQty) || numQty <= 0) {
      toast({ title: 'Erro', description: 'Quantidade inválida', variant: 'destructive' })
      return
    }

    if (numQty > 100000) {
      toast({
        title: 'Quantidade bloqueada',
        description:
          'Quantidades acima de 100.000 unidades não são permitidas por segurança do sistema.',
        variant: 'destructive',
      })
      return
    }

    const currentStock = Number(item.quantity) || 0
    // Regra: se saída > 10x saldo atual, requer confirmação explícita
    if (type === 'Saída' && currentStock > 0 && numQty > currentStock * 10) {
      setConfirmLargeOpen(true)
      return
    }

    await executeMovement(false)
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
      <DialogContent className="sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <NoTranslate as="span">{item.description}</NoTranslate>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded border">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Código</span>
              <NoTranslate as="span" className="font-semibold text-sm">
                {item.code}
              </NoTranslate>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded border">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Saldo Atual
              </span>
              <NoTranslate
                as="span"
                className={cn(
                  'font-bold text-sm',
                  isLow ? 'text-red-600' : 'text-slate-800 dark:text-slate-200',
                )}
              >
                {formatQuantity(item.quantity)} {item.unit}
              </NoTranslate>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded border">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Estoque Mín.
              </span>
              <NoTranslate as="span" className="font-semibold text-sm">
                {formatQuantity(item.min_quantity || 0)} {item.unit}
              </NoTranslate>
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

          <div className="border rounded-md overflow-hidden">
            <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs whitespace-nowrap">Data</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs text-right">Qtde</TableHead>
                    <TableHead className="text-xs text-right">Saldo</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Dt. Compra</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Dt. Chegada</TableHead>
                    <TableHead className="text-xs text-right">Vl. Unit.</TableHead>
                    <TableHead className="text-xs text-right">Vl. Total</TableHead>
                    <TableHead className="text-xs text-right">Frete</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Dt. Saída</TableHead>
                    <TableHead className="text-xs">OP</TableHead>
                    <TableHead className="text-xs">Motivo</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Responsável</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={13}
                        className="text-center text-muted-foreground text-xs py-4"
                      >
                        Sem movimentações.
                      </TableCell>
                    </TableRow>
                  ) : (
                    movements.map((m) => {
                      const isManualWithdrawal = (m.reason || '')
                        .toLowerCase()
                        .includes('retirada manual')
                      const prefix = isManualWithdrawal
                        ? 'Retirado por'
                        : m.type === 'Entrada'
                          ? 'Entrada por'
                          : 'Baixa por'

                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {fmtDateTime(m.created)}
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
                            {formatQuantity(m.quantity)}
                          </TableCell>
                          <TableCell
                            className="text-xs text-right font-semibold whitespace-nowrap notranslate"
                            translate="no"
                          >
                            {m.balance_after != null ? formatQuantity(m.balance_after) : '-'}
                          </TableCell>
                          <TableCell
                            className="text-xs whitespace-nowrap notranslate"
                            translate="no"
                          >
                            {fmtDate(m.purchase_date)}
                          </TableCell>
                          <TableCell
                            className="text-xs whitespace-nowrap notranslate"
                            translate="no"
                          >
                            {fmtDate(m.arrival_date)}
                          </TableCell>
                          <TableCell
                            className="text-xs text-right whitespace-nowrap notranslate"
                            translate="no"
                          >
                            {fmtCurrency(m.unit_price)}
                          </TableCell>
                          <TableCell
                            className="text-xs text-right whitespace-nowrap notranslate"
                            translate="no"
                          >
                            {fmtCurrency(m.total_value)}
                          </TableCell>
                          <TableCell
                            className="text-xs text-right whitespace-nowrap notranslate"
                            translate="no"
                          >
                            {fmtCurrency(m.freight)}
                          </TableCell>
                          <TableCell
                            className="text-xs whitespace-nowrap notranslate"
                            translate="no"
                          >
                            {fmtDate(m.exit_date)}
                          </TableCell>
                          <TableCell
                            className="text-xs whitespace-nowrap notranslate"
                            translate="no"
                          >
                            {orderLabel(m)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                            {m.reason || '-'}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            <UserActionBadge
                              user={m.expand?.user_id}
                              prefix={prefix}
                              compact={true}
                              fallbackText="-"
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
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
                  type="text"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Ex: 5,73 ou 10"
                  className="notranslate"
                  translate="no"
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
            {parseQuantityInput(quantity) > 100000 && (
              <div className="p-2.5 rounded border border-red-300 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0 text-red-600" />
                <span>
                  Atenção: Quantidades acima de 100.000 unidades são rejeitadas pelo sistema.
                </span>
              </div>
            )}
            <Button
              size="sm"
              onClick={handleAddMovement}
              disabled={!quantity || isSubmitting || parseQuantityInput(quantity) > 100000}
            >
              {isSubmitting ? 'Registrando...' : 'Registrar Movimentação'}
            </Button>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={confirmLargeOpen} onOpenChange={setConfirmLargeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="size-5 text-amber-600" />
              Confirmação de Saída de Grande Porte
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <p>
                A quantidade informada para saída é mais de <strong>10 vezes superior</strong> ao
                saldo atual em estoque deste item:
              </p>
              <div className="p-3 rounded-lg border bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200">
                <div className="text-xs uppercase font-bold text-amber-700 dark:text-amber-400">
                  Quantidade Digitada
                </div>
                <div className="text-2xl font-black text-amber-800 dark:text-amber-200">
                  {formatQuantity(parseQuantityInput(quantity))} {item.unit || 'un'}
                </div>
                <div className="text-xs mt-1 text-amber-700 dark:text-amber-300">
                  Saldo atual em estoque:{' '}
                  <strong>
                    {formatQuantity(item.quantity)} {item.unit || 'un'}
                  </strong>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Confirme se a quantidade está correta para autorizar a operação com a sinalização de
                saída extraordinária.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancelar e Corrigir</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
              onClick={(e) => {
                e.preventDefault()
                executeMovement(true)
              }}
            >
              {isSubmitting ? 'Registrando...' : 'Sim, Confirmar Saída Extraordinária'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
