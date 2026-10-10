import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShoppingCart, FileText, XCircle, ShoppingBag, Loader2, PackageCheck } from 'lucide-react'
import { MaterialShortage } from '@/types'
import { formatQuantity } from '@/lib/utils'
import { format, parseISO } from 'date-fns'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'
import { sendDirectToCompra } from '@/services/quotations'
import { useState, useEffect } from 'react'

import { useMemo } from 'react'
import { findOtherOpDemands } from '@/services/material-consolidation'
import { ConsolidatedDemandBlock } from './ConsolidatedDemandBlock'
import {
  getStockAvailabilityForCodes,
  ComponentStockAvailability,
  normalizeCode,
} from '@/services/material-reservations'
import { releaseShortageFromStock } from '@/services/stock-release'

interface TriageDetailDialogProps {
  item: MaterialShortage | null
  allShortages?: MaterialShortage[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAction: () => void
  onOpenQuotation?: (item: MaterialShortage) => void
}
export function TriageDetailDialog({
  item,
  allShortages = [],
  open,
  onOpenChange,
  onAction,
  onOpenQuotation,
}: TriageDetailDialogProps) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [stockInfo, setStockInfo] = useState<ComponentStockAvailability | null>(null)
  const [checkingStock, setCheckingStock] = useState(false)

  const consolidation = useMemo(() => {
    if (!item) return null
    return findOtherOpDemands(item, allShortages)
  }, [item, allShortages])

  useEffect(() => {
    if (!item || !open) {
      setStockInfo(null)
      return
    }
    const norm = normalizeCode(item.code)
    if (!norm) {
      setStockInfo(null)
      return
    }
    setCheckingStock(true)
    getStockAvailabilityForCodes([norm])
      .then((map) => {
        setStockInfo(map.get(norm) || null)
      })
      .catch(() => setStockInfo(null))
      .finally(() => setCheckingStock(false))
  }, [item, open])

  if (!item) return null

  const handleReleaseStock = async () => {
    setSubmitting(true)
    try {
      await releaseShortageFromStock(item)
      toast({
        title: 'Material liberado do estoque',
        description: `${formatQuantity(item.quantity)} un baixada(s) do almoxarifado para esta OP com sucesso.`,
      })
      onOpenChange(false)
      onAction()
    } catch (err: any) {
      toast({
        title: 'Erro ao liberar do estoque',
        description: err.message || 'Falha ao processar movimentação de saída.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleTriage = async (status: 'Cotação' | 'Cancelado') => {
    setSubmitting(true)
    try {
      await pb.collection('material_shortages').update(item.id, { status })
      toast({
        title: status === 'Cotação' ? 'Enviado para cotação' : 'Solicitação reprovada',
      })
      onOpenChange(false)
      onAction()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendDirectToCompra = async () => {
    setSubmitting(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      await sendDirectToCompra(item.id, {
        purchase_date: today,
        ...(item.supplier ? { supplier: item.supplier } : {}),
      })
      toast({
        title: 'Enviado para compras',
        description: `Item ${item.description} enviado diretamente para Compras.`,
      })
      onOpenChange(false)
      onAction()
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar para compras',
        description: err.message || 'Falha ao atualizar registro.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-blue-600" />
            <span>Triagem — {item.description}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Código:</span>{' '}
              <span className="font-medium notranslate" translate="no">
                {item.code || '-'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Quantidade:</span>{' '}
              <span className="font-medium notranslate" translate="no">
                {formatQuantity(item.quantity)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Setor:</span>{' '}
              <span className="font-medium">{item.sector || '-'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Data:</span>{' '}
              <span className="font-medium">{format(parseISO(item.created), 'dd/MM/yyyy')}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Tipo:</span>{' '}
              <span className="font-medium">{item.request_type || '-'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Prioridade:</span>{' '}
              {item.priority && (
                <Badge variant="outline" className="text-xs">
                  {item.priority}
                </Badge>
              )}
            </div>
          </div>
          {item.observation && (
            <div className="text-sm">
              <span className="text-muted-foreground">Observação:</span>
              <p className="mt-1 p-2 bg-slate-50 dark:bg-slate-800 rounded text-sm">
                {item.observation}
              </p>
            </div>
          )}

          {/* Card de disponibilidade de estoque */}
          <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Disponibilidade no Almoxarifado:
              </span>
              {checkingStock ? (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" /> Verificando...
                </span>
              ) : stockInfo ? (
                stockInfo.availableStock >= (Number(item.quantity) || 0) - 0.0001 ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 font-bold">
                    Tem em estoque ({stockInfo.availableStock} un livres)
                  </Badge>
                ) : stockInfo.availableStock > 0 ? (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 font-semibold">
                    Parcial ({stockInfo.availableStock} un livres)
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 font-semibold">
                    Não tem saldo livre
                  </Badge>
                )
              ) : (
                <span className="text-muted-foreground">Sem registro de estoque cadastrado</span>
              )}
            </div>
            {stockInfo && (
              <p className="text-[11px] text-muted-foreground">
                Saldo total físico: {stockInfo.totalStock} {stockInfo.unit} &bull; Reservas ativas:{' '}
                {stockInfo.reservedStock} {stockInfo.unit} &bull;{' '}
                <strong>
                  Livre: {stockInfo.availableStock} {stockInfo.unit}
                </strong>
              </p>
            )}
          </div>

          {/* Bloco de consolidação de demanda com outras OPs */}
          {consolidation && consolidation.otherDemands.length > 0 && (
            <ConsolidatedDemandBlock
              consolidation={consolidation}
              currentItemLabel={`Pedido ${item.expand?.order_id?.order_number || 'Req. Geral'} (OP ${item.expand?.order_id?.op_number || '-'})`}
              itemDescription={item.description}
              itemCode={item.code}
            />
          )}
        </div>
        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          {stockInfo && stockInfo.availableStock >= (Number(item.quantity) || 0) - 0.0001 && (
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              onClick={handleReleaseStock}
              disabled={submitting}
              title="Baixa automática no saldo físico e liberação da solicitação"
            >
              {submitting ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <PackageCheck className="size-4 mr-2" />
              )}
              Liberar do Estoque
            </Button>
          )}

          <Button
            className="flex-1 bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700 dark:hover:bg-slate-600"
            onClick={handleSendDirectToCompra}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <ShoppingBag className="size-4 mr-2" />
            )}
            Enviar Compras
          </Button>
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => {
              if (onOpenQuotation) {
                onOpenChange(false)
                onOpenQuotation(item)
              } else {
                handleTriage('Cotação')
              }
            }}
            disabled={submitting}
          >
            <ShoppingCart className="size-4 mr-2" />{' '}
            {onOpenQuotation ? 'Cotar Agora' : 'Para Cotação'}
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            onClick={() => handleTriage('Cancelado')}
            disabled={submitting}
          >
            <XCircle className="size-4 mr-2" /> Reprovar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
