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
import { OrdemCompraItem } from '@/types'
import { Loader2, Warehouse, PackageCheck, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { distributeOcItemDirectToInventory } from '@/services/material-distribution'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { toDateFieldValue, formatQuantity } from '@/lib/pcp-utils'
import { checkAndUpdateAffectedOcs } from '@/services/oc-receiving-automation'
import { NoTranslate } from '@/components/NoTranslate'

interface DirectInventoryReceiveDialogProps {
  ocItem: OrdemCompraItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void
}

export function DirectInventoryReceiveDialog({
  ocItem,
  open,
  onOpenChange,
  onUpdate,
}: DirectInventoryReceiveDialogProps) {
  const [loading, setLoading] = useState(false)
  const [receivedQty, setReceivedQty] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [arrivalDate, setArrivalDate] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [freight, setFreight] = useState('')
  const { toast } = useToast()

  const totalQty = ocItem ? Number(ocItem.quantity) || 0 : 0
  const alreadyRcvd = ocItem ? Number(ocItem.received_quantity) || 0 : 0
  const saldo = Math.max(0, totalQty - alreadyRcvd)

  useEffect(() => {
    if (!open || !ocItem) return
    const currentSaldo = Math.max(
      0,
      (Number(ocItem.quantity) || 0) - (Number(ocItem.received_quantity) || 0),
    )
    setReceivedQty(currentSaldo > 0 ? String(currentSaldo) : String(ocItem.quantity || 0))
    setPurchaseDate(toDateFieldValue(ocItem.created || new Date()))
    setArrivalDate(toDateFieldValue(new Date()))
    setUnitPrice(ocItem.unit_price ? String(ocItem.unit_price) : '')
    setFreight('')
  }, [open, ocItem])

  const numReceivedQty = Number(receivedQty) || 0
  const numUnitPrice = Number(unitPrice) || 0
  const numFreight = Number(freight) || 0
  const isOverSaldo = numReceivedQty > saldo + 0.0001
  const computedTotalValue =
    numUnitPrice > 0 ? numUnitPrice * numReceivedQty + numFreight : numFreight

  const handleConfirm = async () => {
    if (!ocItem) return
    if (numReceivedQty <= 0) {
      toast({
        title: 'Quantidade inválida',
        description: 'Informe uma quantidade a receber maior que zero.',
        variant: 'destructive',
      })
      return
    }

    if (isOverSaldo) {
      toast({
        title: 'Quantidade excede o saldo',
        description: `A quantidade informada (${formatQuantity(numReceivedQty)} un) excede o saldo restante do item da OC (${formatQuantity(saldo)} un).`,
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      await distributeOcItemDirectToInventory({
        oc_item_id: ocItem.id,
        received_quantity: numReceivedQty,
        traceability: {
          code: ocItem.code || undefined,
          description: ocItem.description,
          purchase_date: purchaseDate ? `${purchaseDate} 12:00:00.000Z` : undefined,
          arrival_date: arrivalDate ? `${arrivalDate} 12:00:00.000Z` : undefined,
          unit_price: numUnitPrice > 0 ? numUnitPrice : undefined,
          freight: numFreight > 0 ? numFreight : undefined,
        },
      })

      toast({
        title: 'Recebimento no estoque concluído',
        description: `${formatQuantity(numReceivedQty)} un adicionada(s) diretamente ao estoque geral (sem vínculo com OP).`,
      })

      // Automatizar checagem de fechamento da OC
      if (ocItem.oc_id) {
        await checkAndUpdateAffectedOcs([ocItem.oc_id], {
          customToast: (opts) => toast({ title: opts.title, description: opts.description }),
        })
      }

      onUpdate()
      onOpenChange(false)
    } catch (err) {
      toast({
        title: 'Erro ao receber item',
        description: getErrorMessage(err) || 'Não foi possível registrar o recebimento no estoque.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  if (!ocItem) return null

  const ocNumber = ocItem.expand?.oc_id?.oc_number || ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warehouse className="size-5 text-emerald-600" />
            Recebimento Direto ao Estoque
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Card informativo do item avulso */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border space-y-2">
            <div className="flex justify-between items-start gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  {ocNumber && (
                    <Badge
                      variant="outline"
                      className="text-xs bg-blue-50 text-blue-900 border-blue-300"
                    >
                      OC #{ocNumber}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className="border-amber-400 bg-amber-50 text-amber-900 text-xs"
                  >
                    Item avulso da OC
                  </Badge>
                </div>
                <div className="font-semibold text-slate-800 dark:text-slate-100 mt-1">
                  <NoTranslate as="span">{ocItem.description}</NoTranslate>
                </div>
              </div>
              {ocItem.code && (
                <Badge variant="outline" className="font-mono text-xs notranslate">
                  {ocItem.code}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t text-xs">
              <div>
                <span className="text-muted-foreground block">Comprado:</span>
                <strong className="text-slate-700 dark:text-slate-300">
                  {formatQuantity(totalQty)} un
                </strong>
              </div>
              <div>
                <span className="text-muted-foreground block">Já Recebido:</span>
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {formatQuantity(alreadyRcvd)} un
                </strong>
              </div>
              <div>
                <span className="text-muted-foreground block">Saldo Restante:</span>
                <strong className="text-amber-700 dark:text-amber-400 font-bold">
                  {formatQuantity(saldo)} un
                </strong>
              </div>
            </div>
          </div>

          <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
            <PackageCheck className="size-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong>Destino 100% Estoque Geral:</strong> este item foi adicionado diretamente na
              OC sem ordem de produção (OP) associada. Ao confirmar, o saldo entrará como{' '}
              <em>Entrada</em> no inventário com movimentação registrada e sem envio de mensagem
              para operadores.
            </div>
          </div>

          {/* Campo Quantidade a Receber */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">
              Quantidade a Receber Agora (Saldo máx: {formatQuantity(saldo)} un)
            </Label>
            <Input
              type="number"
              min="0.001"
              step="any"
              max={saldo}
              placeholder="0"
              className="max-w-[200px] notranslate"
              translate="no"
              value={receivedQty}
              onChange={(e) => setReceivedQty(e.target.value)}
            />
            {isOverSaldo && (
              <p className="text-xs text-red-600 font-semibold flex items-center gap-1 mt-1">
                <AlertCircle className="size-3.5" /> Quantidade excede o saldo da OC (
                {formatQuantity(saldo)} un)
              </p>
            )}
          </div>

          {/* Dados complementares de rastreabilidade */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border">
            <div className="space-y-1">
              <Label className="text-xs">Data da Compra</Label>
              <Input
                type="date"
                className="h-9 text-sm notranslate"
                translate="no"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data da Chegada</Label>
              <Input
                type="date"
                className="h-9 text-sm notranslate"
                translate="no"
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
                className="h-9 text-sm notranslate"
                translate="no"
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
                className="h-9 text-sm notranslate"
                translate="no"
                value={freight}
                onChange={(e) => setFreight(e.target.value)}
              />
            </div>
            {computedTotalValue > 0 && (
              <div className="col-span-2 sm:col-span-4 text-xs text-muted-foreground">
                Valor total calculado:{' '}
                <strong className="text-foreground notranslate" translate="no">
                  R$ {computedTotalValue.toFixed(2)}
                </strong>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || numReceivedQty <= 0 || isOverSaldo}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {loading && <Loader2 className="size-4 animate-spin mr-1.5" />}
            Confirmar Recebimento no Estoque
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
