import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import {
  ShoppingCart,
  FileText,
  XCircle,
  Loader2,
  Layers,
  ShoppingBag,
  PackageCheck,
} from 'lucide-react'
import { ShortageGroup } from '@/lib/shortage-grouping'
import { MaterialShortage } from '@/types'
import { formatQuantity } from '@/lib/utils'
import { format, parseISO } from 'date-fns'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'
import { NoTranslate } from '@/components/NoTranslate'
import { UserActionBadge } from '@/components/UserActionBadge'
import { advanceGroupToCompra } from '@/services/quotations'
import { useEffect } from 'react'
import {
  getStockAvailabilityForCodes,
  ComponentStockAvailability,
  normalizeCode,
} from '@/services/material-reservations'
import { releaseGroupFromStock } from '@/services/stock-release'

interface TriageGroupDetailDialogProps {
  group: ShortageGroup | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAction: () => void
  onOpenQuotation?: (item: MaterialShortage, groupItems: MaterialShortage[]) => void
}
export function TriageGroupDetailDialog({
  group,
  open,
  onOpenChange,
  onAction,
  onOpenQuotation,
}: TriageGroupDetailDialogProps) {
  const { toast } = useToast()
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [stockInfo, setStockInfo] = useState<ComponentStockAvailability | null>(null)
  const [checkingStock, setCheckingStock] = useState(false)

  useEffect(() => {
    if (!group || !open) {
      setStockInfo(null)
      return
    }
    const norm = normalizeCode(group.code)
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
  }, [group, open])

  if (!group) return null

  const handleReleaseGroupFromStock = async () => {
    setLoadingAction('LiberarEstoque')
    try {
      const res = await releaseGroupFromStock(group.items)
      if (res.successCount > 0) {
        toast({
          title: 'Lote liberado do estoque',
          description: `${res.successCount} de ${group.items.length} solicitação(ões) liberada(s) (${res.totalReleased} un baixadas do almoxarifado).${res.failCount > 0 ? ` Restante (${res.failCount} itens) mantido na fila.` : ''}`,
        })
      } else {
        toast({
          title: 'Não foi possível liberar do estoque',
          description: res.results[0]?.error || 'Saldo insuficiente.',
          variant: 'destructive',
        })
      }
      onOpenChange(false)
      onAction()
    } catch (err: any) {
      toast({
        title: 'Erro ao liberar lote do estoque',
        description: err.message || 'Falha ao processar movimentações.',
        variant: 'destructive',
      })
    } finally {
      setLoadingAction(null)
    }
  }

  const handleGroupAction = async (status: 'Cotação' | 'Cancelado') => {
    setLoadingAction(status)
    try {
      for (const item of group.items) {
        await pb.collection('material_shortages').update(item.id, {
          status,
          ...(status === 'Cotação' && {
            quotation_date: new Date().toISOString().split('T')[0],
          }),
        })
      }
      toast({
        title:
          status === 'Cotação' ? 'Lote enviado para cotação' : 'Solicitações do lote reprovadas',
        description: `${group.items.length} registro(s) de ${group.description} atualizado(s).`,
      })
      onOpenChange(false)
      onAction()
    } catch (err: any) {
      toast({
        title: 'Erro ao processar lote',
        description: err.message || 'Falha ao atualizar registros.',
        variant: 'destructive',
      })
    } finally {
      setLoadingAction(null)
    }
  }

  const handleSendGroupToCompra = async () => {
    setLoadingAction('Compra')
    try {
      const ids = group.items.map((it) => it.id)
      const batchId = `lote_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      await advanceGroupToCompra(ids, undefined, batchId)
      toast({
        title: 'Lote enviado para compras',
        description: `${group.items.length} registro(s) de ${group.description} (${formatQuantity(group.totalQuantity)} un) enviados diretamente para Compras em lote consolidado.`,
      })
      onOpenChange(false)
      onAction()
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar lote para compras',
        description: err.message || 'Falha ao atualizar registros do lote.',
        variant: 'destructive',
      })
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-blue-600" />
            <span>
              Decisão em Lote — <NoTranslate as="span">{group.description}</NoTranslate>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Resumo do lote consolidado */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">Código:</span>
              <span className="font-semibold notranslate" translate="no">
                {group.code || '-'}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Quantidade Total:</span>
              <span
                className="font-bold text-blue-700 dark:text-blue-300 notranslate"
                translate="no"
              >
                {formatQuantity(group.totalQuantity)} un
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">OPs Atendidas:</span>
              <span className="font-semibold flex items-center gap-1">
                <Layers className="size-3.5 text-blue-600" /> {group.items.length} registro(s) (
                {group.opCount} OP(s))
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Prioridade Geral:</span>
              {group.highestPriority ? (
                <Badge
                  variant="outline"
                  className={
                    group.highestPriority === 'Urgente'
                      ? 'border-red-500 text-red-600'
                      : 'border-yellow-500 text-yellow-600'
                  }
                >
                  {group.highestPriority}
                </Badge>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
          </div>

          {/* Card de disponibilidade do lote */}
          <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Disponibilidade consolidada no Almoxarifado:
              </span>
              {checkingStock ? (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" /> Verificando...
                </span>
              ) : stockInfo ? (
                stockInfo.availableStock >= group.totalQuantity - 0.0001 ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 font-bold">
                    Cobre todo o lote ({stockInfo.availableStock} un livres)
                  </Badge>
                ) : stockInfo.availableStock > 0 ? (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 font-semibold">
                    Cobre parcial ({stockInfo.availableStock} de {group.totalQuantity} un)
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 font-semibold">
                    Sem saldo livre (0 un)
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

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Registros individuais deste código ({group.items.length} OPs/solicitações)
            </h4>
            <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-800/60 text-[11px]">
                  <TableRow>
                    <TableHead className="w-[80px]">Data</TableHead>
                    <TableHead className="text-right w-[60px]">Qtde</TableHead>
                    <TableHead className="w-[100px]">Setor</TableHead>
                    <TableHead className="w-[110px]">Solicitante</TableHead>
                    <TableHead className="w-[90px]">Nº Pedido</TableHead>
                    <TableHead className="w-[90px]">Nº OP</TableHead>
                    <TableHead className="w-[100px]">Necessidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {group.items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-muted-foreground">
                        {it.created ? format(parseISO(it.created), 'dd/MM/yy') : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold notranslate" translate="no">
                        {formatQuantity(it.quantity)}
                      </TableCell>
                      <TableCell>{it.sector || '-'}</TableCell>
                      <TableCell>
                        <UserActionBadge
                          user={it.expand?.requested_by}
                          date={it.created}
                          prefix="por"
                          compact={true}
                          fallbackText="-"
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground notranslate" translate="no">
                        {it.expand?.order_id?.order_number || '-'}
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground font-medium notranslate"
                        translate="no"
                      >
                        {it.expand?.order_id?.op_number || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {it.expected_date ? format(parseISO(it.expected_date), 'dd/MM/yy') : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <p className="text-xs text-muted-foreground italic">
            * A decisão abaixo será aplicada a todos os {group.items.length} registros acima
            simultaneamente.
          </p>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          {stockInfo && stockInfo.availableStock > 0 && (
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              onClick={handleReleaseGroupFromStock}
              disabled={!!loadingAction}
              title={
                stockInfo.availableStock >= group.totalQuantity - 0.0001
                  ? 'Liberar todas as solicitações deste código com baixa no estoque'
                  : `Liberar até ${stockInfo.availableStock} un das OPs prioritárias`
              }
            >
              {loadingAction === 'LiberarEstoque' ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <PackageCheck className="size-4 mr-2" />
              )}
              {stockInfo.availableStock >= group.totalQuantity - 0.0001
                ? 'Liberar Lote do Estoque'
                : `Liberar Parcial (${stockInfo.availableStock} un)`}
            </Button>
          )}

          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => {
              if (onOpenQuotation && group.items[0]) {
                onOpenChange(false)
                onOpenQuotation(group.items[0], group.items)
              } else {
                handleGroupAction('Cotação')
              }
            }}
            disabled={!!loadingAction}
          >
            {loadingAction === 'Cotação' ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <ShoppingCart className="size-4 mr-2" />
            )}
            {onOpenQuotation ? 'Cotar Lote Agora' : 'Todas p/ Cotação'}
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            onClick={() => handleGroupAction('Cancelado')}
            disabled={!!loadingAction}
          >
            {loadingAction === 'Cancelado' ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <XCircle className="size-4 mr-2" />
            )}
            Reprovar Todos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
