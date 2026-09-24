import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Loader2,
  Layers,
  Calendar,
  User,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import type { PcpOrderMaterial, PcpOrder } from '@/types'
import { cn } from '@/lib/utils'

export interface OpModalTarget {
  orderId?: string
  opNumber?: string
  orderNumber?: string
  clientName?: string
  productName?: string
  deliveryDate?: string
}

interface OpMaterialsSummaryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: OpModalTarget | null
}

export function OpMaterialsSummaryModal({
  open,
  onOpenChange,
  target,
}: OpMaterialsSummaryModalProps) {
  const [materials, setMaterials] = useState<PcpOrderMaterial[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvedOrder, setResolvedOrder] = useState<PcpOrder | null>(null)

  useEffect(() => {
    if (!open || !target) {
      setMaterials([])
      setResolvedOrder(null)
      setError(null)
      return
    }

    let isMounted = true

    async function loadOpDetails() {
      setLoading(true)
      setError(null)

      try {
        let orderRecord: PcpOrder | null = null

        // 1. Localizar o registro do pedido / OP se orderId estiver disponível
        if (target?.orderId) {
          try {
            orderRecord = await pb.collection('pcp_orders').getOne<PcpOrder>(target.orderId, {
              expand: 'product_id,client_id',
            })
          } catch {
            // fallback se falhar por id
          }
        }

        // Se não achou por orderId mas temos opNumber ou orderNumber
        if (!orderRecord && (target?.opNumber || target?.orderNumber)) {
          const filterParts: string[] = []
          if (target?.opNumber && target.opNumber !== '-') {
            filterParts.push(`op_number = "${target.opNumber.trim()}"`)
          }
          if (
            target?.orderNumber &&
            target.orderNumber !== 'OP s/ número' &&
            target.orderNumber !== 'OP vinculada'
          ) {
            filterParts.push(`order_number = "${target.orderNumber.trim()}"`)
          }
          if (filterParts.length > 0) {
            try {
              orderRecord = await pb
                .collection('pcp_orders')
                .getFirstListItem<PcpOrder>(filterParts.join(' || '), {
                  expand: 'product_id,client_id',
                })
            } catch {
              // não encontrado
            }
          }
        }

        if (isMounted) {
          setResolvedOrder(orderRecord)
        }

        const effectiveOrderId = orderRecord?.id || target?.orderId

        if (effectiveOrderId) {
          const loadedMaterials = await pb
            .collection('pcp_order_materials')
            .getFullList<PcpOrderMaterial>({
              filter: `order_id = "${effectiveOrderId}"`,
              sort: 'sector,description',
            })
          if (isMounted) {
            setMaterials(loadedMaterials)
          }
        } else {
          if (isMounted) {
            setMaterials([])
          }
        }
      } catch (err: any) {
        console.error('Erro ao carregar componentes da OP:', err)
        if (isMounted) {
          setError('Não foi possível carregar os componentes desta OP.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadOpDetails()

    return () => {
      isMounted = false
    }
  }, [open, target])

  const opNumber = resolvedOrder?.op_number || target?.opNumber || '-'
  const orderNumber = resolvedOrder?.order_number || target?.orderNumber || '-'
  const clientName =
    resolvedOrder?.client_name ||
    (resolvedOrder?.expand?.client_id as any)?.name ||
    target?.clientName ||
    '-'
  const productName =
    (resolvedOrder?.expand?.product_id as any)?.name ||
    resolvedOrder?.manual_product_name ||
    target?.productName ||
    '-'
  const deliveryDateRaw = resolvedOrder?.delivery_date || target?.deliveryDate

  const formattedDeliveryDate = deliveryDateRaw
    ? deliveryDateRaw.slice(0, 10).split('-').reverse().join('/')
    : '-'

  const separatedCount = materials.filter((m) => m.status === 'Separado').length
  const totalCount = materials.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 gap-0 shadow-2xl">
        {/* CABEÇALHO DO MODAL */}
        <DialogHeader className="p-5 pb-3 border-b bg-slate-50/90 dark:bg-slate-900/90">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <DialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
                <Layers className="size-5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>Componentes da Engenharia — OP {opNumber}</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Relação completa de componentes previstos na engenharia da OP e status de separação.
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Badge
                variant="outline"
                className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-300 font-mono text-xs px-2.5 py-1 font-bold"
              >
                OP: {opNumber}
              </Badge>
              {orderNumber && orderNumber !== '-' && (
                <Badge
                  variant="outline"
                  className="font-mono text-xs px-2.5 py-1 text-slate-700 dark:text-slate-300"
                >
                  Ped: {orderNumber}
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* METADADOS DA OP */}
        <div className="p-4 bg-gradient-to-r from-slate-50 to-amber-50/40 dark:from-slate-900/70 dark:to-amber-950/20 border-b border-slate-200 dark:border-slate-800 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                <Layers className="size-3 text-blue-600" /> Nº da OP
              </span>
              <strong
                className="block text-xs font-mono font-bold text-blue-700 dark:text-blue-400 truncate mt-0.5 notranslate"
                translate="no"
              >
                {opNumber}
              </strong>
            </div>

            <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                <FileText className="size-3 text-slate-600" /> Pedido
              </span>
              <strong
                className="block text-xs font-mono font-bold text-slate-800 dark:text-slate-200 truncate mt-0.5 notranslate"
                translate="no"
              >
                {orderNumber}
              </strong>
            </div>

            <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                <User className="size-3 text-slate-600" /> Cliente
              </span>
              <span
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5 notranslate"
                translate="no"
                title={clientName}
              >
                {clientName}
              </span>
            </div>

            <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                <Calendar className="size-3 text-amber-600" /> Data de Vencimento
              </span>
              <span
                className="block text-xs font-bold text-slate-800 dark:text-slate-200 truncate mt-0.5 notranslate"
                translate="no"
              >
                {formattedDeliveryDate}
              </span>
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-muted-foreground font-medium">Produto:</span>
              <span
                className="font-bold text-slate-900 dark:text-slate-100 truncate notranslate"
                translate="no"
                title={productName}
              >
                {productName}
              </span>
            </div>

            {!loading && totalCount > 0 && (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground">Progresso de Separação:</span>
                <Badge
                  variant="secondary"
                  className={cn(
                    'font-semibold text-[11px] px-2 py-0',
                    separatedCount === totalCount
                      ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
                  )}
                >
                  {separatedCount} de {totalCount} separados
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* CORPO DO MODAL — TABELA DE MATERIAIS */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-blue-600" />
              <p className="text-xs sm:text-sm">Carregando componentes da OP {opNumber}...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs sm:text-sm flex items-center gap-2">
              <AlertCircle className="size-5 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          ) : materials.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed rounded-lg border-slate-200 dark:border-slate-800 text-slate-400 text-xs sm:text-sm space-y-1">
              <p className="font-medium text-slate-600 dark:text-slate-300">
                Nenhum componente de engenharia cadastrado para esta OP.
              </p>
              <p className="text-[11px] text-muted-foreground">
                Os itens desta OP ainda não foram importados via PDF de engenharia ou foram gerados
                manualmente.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <Table>
                <TableHeader className="bg-slate-100/70 dark:bg-slate-950 text-[11px]">
                  <TableRow>
                    <TableHead className="w-[120px] font-bold">Código</TableHead>
                    <TableHead className="font-bold">Descrição do Componente</TableHead>
                    <TableHead className="w-[110px] font-bold">Setor</TableHead>
                    <TableHead className="text-right w-[110px] font-bold">
                      Qtde Engenharia
                    </TableHead>
                    <TableHead className="w-[80px] text-center font-bold">Un</TableHead>
                    <TableHead className="w-[130px] text-center font-bold">
                      Status Separação
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {materials.map((mat) => {
                    const isSeparated = mat.status === 'Separado'
                    const isFalta = mat.status === 'Falta'

                    return (
                      <TableRow
                        key={mat.id}
                        className={cn(
                          'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                          isSeparated && 'bg-emerald-50/20 dark:bg-emerald-950/10',
                        )}
                      >
                        <TableCell
                          className="font-mono font-semibold text-blue-700 dark:text-blue-400 notranslate"
                          translate="no"
                        >
                          {mat.code || (
                            <span className="text-muted-foreground font-normal italic">s/ cód</span>
                          )}
                        </TableCell>
                        <TableCell
                          className="font-medium text-slate-800 dark:text-slate-200 notranslate"
                          translate="no"
                        >
                          <div>{mat.description}</div>
                          {mat.measurements && (
                            <span className="text-[10px] text-muted-foreground block font-mono">
                              Corte: {mat.measurements}
                            </span>
                          )}
                          {mat.notes && (
                            <span className="text-[10px] text-amber-700 dark:text-amber-400 block italic">
                              {mat.notes}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 font-medium border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                          >
                            {mat.sector || 'FABRICAÇÃO'}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="text-right font-bold text-slate-900 dark:text-slate-100 font-mono notranslate"
                          translate="no"
                        >
                          {mat.quantity}
                        </TableCell>
                        <TableCell
                          className="text-center font-mono text-[11px] text-muted-foreground notranslate"
                          translate="no"
                        >
                          {mat.unit || 'UN'}
                        </TableCell>
                        <TableCell className="text-center">
                          {isSeparated ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-semibold text-[10px] px-2 py-0.5 inline-flex items-center gap-1">
                              <CheckCircle2 className="size-3" /> Separado
                            </Badge>
                          ) : isFalta ? (
                            <Badge
                              variant="destructive"
                              className="font-semibold text-[10px] px-2 py-0.5 inline-flex items-center gap-1"
                            >
                              <AlertCircle className="size-3" /> Falta
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-2 py-0.5 text-amber-800 bg-amber-50 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800 inline-flex items-center gap-1"
                            >
                              <Clock className="size-3 text-amber-600" /> Não Separado
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* RODAPÉ DO MODAL */}
        <DialogFooter className="p-3 border-t bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-between sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            {totalCount > 0 ? `${totalCount} item(ns) na lista de engenharia` : ''}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs px-4"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
