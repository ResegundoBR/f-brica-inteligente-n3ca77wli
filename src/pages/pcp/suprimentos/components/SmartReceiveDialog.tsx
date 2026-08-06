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
import { distributeMaterials } from '@/services/material-distribution'
import { useToast } from '@/hooks/use-toast'

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
  const { toast } = useToast()

  useEffect(() => {
    if (!open || !item) return
    setLoading(true)
    setTotalReceived('')
    setDistributions({})
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
      const surplusInfo =
        surplus > 0 && item
          ? { code: item.code || '', description: item.description, quantity: surplus }
          : undefined
      await distributeMaterials(distArray, surplusInfo)
      toast({
        title: 'Distribuição concluída',
        description: `${received} unidade(s) distribuídas.`,
      })
      onUpdate()
      onOpenChange(false)
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Falha na distribuição.',
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
