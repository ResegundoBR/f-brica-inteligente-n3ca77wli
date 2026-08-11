import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Loader2, Package, ArrowRight, Warehouse } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { distributeMaterials, type TraceabilityInfo } from '@/services/material-distribution'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface SmartReceiveDialogProps {
  item: MaterialShortage | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void
}

export function SmartReceiveDialog({
  item,
  open,
  onOpenChange,
  onUpdate,
}: SmartReceiveDialogProps) {
  const [related, setRelated] = useState<MaterialShortage[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [totalReceived, setTotalReceived] = useState('')
  const [distributions, setDistributions] = useState<Record<string, string>>({})
  const [purchaseDate, setPurchaseDate] = useState('')
  const [arrivalDate, setArrivalDate] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [freight, setFreight] = useState('')
  const { toast } = useToast()

  useEffect(() => {
    if (!open || !item) return
    setLoading(true)
    setTotalReceived('')
    setDistributions({})
    setPurchaseDate(item.purchase_date ? item.purchase_date.substring(0, 10) : '')
    setArrivalDate(new Date().toISOString().split('T')[0])
    setUnitPrice(item.unit_price ? String(item.unit_price) : '')
    setFreight('')
    const fetchRelated = async () => {
      try {
        const code = (item.code || '').trim()
        const filter = code
          ? `code = "${code}" && (status = "Compra" || status = "Recebido_Parcial")`
          : `description = "${item.description}" && (status = "Compra" || status = "Recebido_Parcial")`
        const res = await pb.collection('material_shortages').getFullList<MaterialShortage>({
          filter,
          expand: 'order_id,order_id.product_id',
          sort: 'created',
        })
        setRelated(res.length > 0 ? res : [item])
      } catch {
        setRelated([item])
      } finally {
        setLoading(false)
      }
    }
    fetchRelated()
  }, [open, item])

  const totalNeeded = related.reduce((s, x) => s + (Number(x.quantity) || 0), 0)
  const totalAlreadyReceived = related.reduce((s, x) => s + (Number(x.received_quantity) || 0), 0)
  const totalDistributed = Object.values(distributions).reduce((s, q) => s + (Number(q) || 0), 0)
  const surplus = Math.max(0, (Number(totalReceived) || 0) - totalDistributed)

  const numUnitPrice = Number(unitPrice) || 0
  const numFreight = Number(freight) || 0
  const numTotalReceived = Number(totalReceived) || 0
  const computedTotalValue =
    numUnitPrice > 0 ? numUnitPrice * numTotalReceived + numFreight : numFreight

  const handleConfirm = async () => {
    const received = Number(totalReceived) || 0
    if (received <= 0) {
      toast({
        title: 'Erro',
        description: 'Informe a quantidade recebida.',
        variant: 'destructive',
      })
      return
    }
    const distArray = Object.entries(distributions)
      .filter(([, q]) => q && Number(q) > 0)
      .map(([sid, q]) => ({ shortage_id: sid, quantity: Number(q) }))

    if (distArray.length === 0 && surplus === 0) {
      toast({
        title: 'Erro',
        description: 'Distribua a quantidade entre as OPs.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const traceabilityInfo: TraceabilityInfo = {
        code: item?.code || '',
        description: item?.description || '',
        purchase_date: purchaseDate || undefined,
        arrival_date: arrivalDate || undefined,
        unit_price: numUnitPrice > 0 ? numUnitPrice : undefined,
        freight: numFreight > 0 ? numFreight : undefined,
      }
      await distributeMaterials(distArray, received, traceabilityInfo)
      toast({
        title: 'Distribuição concluída',
        description: `${received} unidade(s) recebidas. ${totalDistributed} distribuídas. ${surplus} em estoque.`,
      })
      onUpdate()
      onOpenChange(false)
    } catch (err: unknown) {
      const errAny = err as { response?: { error?: string }; message?: string }
      const msg = errAny?.response?.error || getErrorMessage(err)
      toast({
        title: 'Erro',
        description: msg || 'Falha na distribuição.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-5" /> Recebimento Inteligente
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border">
              <div className="flex justify-between text-sm">
                <span className="font-semibold">{item?.description}</span>
                {item?.code && (
                  <Badge variant="outline" className="text-xs">
                    {item.code}
                  </Badge>
                )}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span>
                  Total necessário: <strong className="text-foreground">{totalNeeded}</strong>
                </span>
                <span>
                  Já recebido: <strong className="text-foreground">{totalAlreadyReceived}</strong>
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Quantidade total recebida</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0"
                className="max-w-[200px]"
                value={totalReceived}
                onChange={(e) => setTotalReceived(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border">
              <div className="space-y-1">
                <Label className="text-xs">Data da Compra</Label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data da Chegada</Label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={arrivalDate}
                  onChange={(e) => setArrivalDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor Unitário (R$)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="h-9 text-sm"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Frete (R$)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="h-9 text-sm"
                  value={freight}
                  onChange={(e) => setFreight(e.target.value)}
                />
              </div>
              {computedTotalValue > 0 && (
                <div className="col-span-2 sm:col-span-4 text-xs text-muted-foreground">
                  Valor total calculado:{' '}
                  <strong className="text-foreground">R$ {computedTotalValue.toFixed(2)}</strong>
                </div>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OP</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Necessita</TableHead>
                    <TableHead className="text-right">Recebido</TableHead>
                    <TableHead className="text-right w-[120px]">Distribuir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {related.map((s) => {
                    const op = s.expand?.order_id
                    const product = op?.expand?.product_id
                    const needed = Number(s.quantity) || 0
                    const alreadyRcvd = Number(s.received_quantity) || 0
                    const remaining = Math.max(0, needed - alreadyRcvd)
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm font-medium">
                          {op?.op_number || op?.order_number || '-'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {product?.code ? `${product.code} - ` : ''}
                          {product?.name || '-'}
                        </TableCell>
                        <TableCell className="text-right text-sm">{needed}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {alreadyRcvd}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            max={remaining}
                            placeholder="0"
                            className="h-8 w-full text-right text-sm"
                            value={distributions[s.id] || ''}
                            onChange={(e) =>
                              setDistributions((prev) => ({ ...prev, [s.id]: e.target.value }))
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {surplus > 0 && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <Warehouse className="size-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Excedente: {surplus} unidade(s) <ArrowRight className="inline size-3" /> Estoque
                </span>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm text-muted-foreground">
                Distribuído: <strong className="text-foreground">{totalDistributed}</strong> /{' '}
                {Number(totalReceived) || 0}
              </span>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={saving || loading}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Confirmar Distribuição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
