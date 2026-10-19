import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { OrdemCompra, OrdemCompraItem, MaterialShortage } from '@/types'
import {
  Loader2,
  PackageCheck,
  Warehouse,
  AlertTriangle,
  Info,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { formatQuantity } from '@/lib/utils'
import { NoTranslate } from '@/components/NoTranslate'
import { distributeOcFull } from '@/services/material-distribution'

export interface ItemPrevia {
  ocItem: OrdemCompraItem
  shortage?: MaterialShortage
  code: string
  description: string
  purchasedQty: number
  alreadyRcvd: number
  saldoQty: number
  // Análise da demanda e destino
  hasPendingOpDemand: boolean
  opDemandQty: number
  surplusQty: number
  // Estado no estoque físico atual (heurística para sinalizar itens genuinamente não recebidos)
  isPhysicallyInStock: boolean
  currentStockQty: number
  unit: string
  isFullyReceived: boolean
}

interface EntradaIntegralOcModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  oc: OrdemCompra | null
  items: OrdemCompraItem[]
  shortagesMap: Map<string, MaterialShortage>
  inventoryMap?: Map<string, { quantity: number; unit?: string }>
  onSuccess: () => void
}

export function EntradaIntegralOcModal({
  open,
  onOpenChange,
  oc,
  items,
  shortagesMap,
  inventoryMap = new Map(),
  onSuccess,
}: EntradaIntegralOcModalProps) {
  const [loading, setLoading] = useState(false)
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>({})
  const { toast } = useToast()

  // Montar prévia dos itens da OC
  const previas = useMemo<ItemPrevia[]>(() => {
    if (!oc || !items || items.length === 0) return []

    return items.map((it) => {
      const purchasedQty = Number(it.quantity) || 0
      const directRcvd = Number(it.received_quantity) || 0

      let shortage = it.material_shortage_id ? shortagesMap.get(it.material_shortage_id) : undefined
      if (!shortage && it.expand?.material_shortage_id) {
        shortage = it.expand.material_shortage_id
      }

      let alreadyRcvd = directRcvd
      if (shortage) {
        const sRcvd = Number(shortage.received_quantity) || 0
        const sQty = Number(shortage.quantity) || 0
        if (shortage.status === 'Recebido' && sQty > 0 && sRcvd >= sQty - 0.0001) {
          alreadyRcvd = Math.max(alreadyRcvd, sRcvd, purchasedQty <= sQty ? purchasedQty : sRcvd)
        } else if (sRcvd > alreadyRcvd) {
          alreadyRcvd = sRcvd
        }
      }

      const saldoQty = Math.max(0, Math.round((purchasedQty - alreadyRcvd) * 10000) / 10000)
      const isFullyReceived = saldoQty <= 0.0001 && purchasedQty > 0

      // Demanda de OP vinculada
      let hasPendingOpDemand = false
      let opDemandQty = 0

      if (shortage && Boolean(shortage.order_id)) {
        const sQty = Number(shortage.quantity) || 0
        const sRcvd = Number(shortage.received_quantity) || 0
        const sPending = Math.max(0, Math.round((sQty - sRcvd) * 10000) / 10000)
        if (
          shortage.status !== 'Recebido' &&
          shortage.status !== 'Cancelado' &&
          sPending > 0.0001
        ) {
          hasPendingOpDemand = true
          // Demanda a alocar para a OP limitada pelo saldo disponível deste item
          opDemandQty = Math.min(saldoQty, sPending)
        }
      }

      const surplusQty = Math.max(0, Math.round((saldoQty - opDemandQty) * 10000) / 10000)

      const code = (it.code || shortage?.code || '').trim()
      const invData = code ? inventoryMap.get(code.toUpperCase()) : undefined
      const currentStockQty = invData ? Number(invData.quantity) || 0 : 0
      const unit = invData?.unit || 'un'
      const isPhysicallyInStock = currentStockQty > 0.0001

      return {
        ocItem: it,
        shortage,
        code,
        description: it.description || shortage?.description || '',
        purchasedQty,
        alreadyRcvd,
        saldoQty,
        hasPendingOpDemand,
        opDemandQty,
        surplusQty,
        isPhysicallyInStock,
        currentStockQty,
        unit,
        isFullyReceived,
      }
    })
  }, [oc, items, shortagesMap, inventoryMap])

  // Inicializar seleção quando o modal abrir
  // Regra:
  // - Itens com saldo 0 (já recebidos) ficam desmarcados e desabilitados
  // - Itens genuinamente não recebidos (sem entrada no estoque e saldo não recebido)
  //   começam desmarcados para segurança e proteção do usuário, mas podem ser marcados se o usuário desejar
  // - Itens com saldo que têm excedente ou entrada física prévia começam marcados por padrão
  useMemo(() => {
    if (!open) return
    const initial: Record<string, boolean> = {}
    for (const p of previas) {
      if (p.isFullyReceived || p.saldoQty <= 0.0001) {
        initial[p.ocItem.id] = false
      } else {
        // Se tem estoque físico já presente (entrada fora do fluxo ou excedente em estoque) OU se é item com saldo normal:
        // Caso real 05330124: sem estoque físico (currentStockQty === 0) e com demanda 100% não recebida.
        // O usuário pode marcar ou desmarcar. Para segurança máxima exigida na especificação:
        // "itens genuinamente não recebidos (sem entrada física, ex. 05330124) NÃO são fechados pela ação —
        // o modal deve mostrar cada item como 'Distribuir + excedente ao estoque' e permitir desmarcar/desistir por item;"
        // Marcamos por padrão apenas se o item teve entrada física prévia ou excedente comprovado.
        const isLikelyUnreceived = !p.isPhysicallyInStock && p.alreadyRcvd <= 0.0001
        initial[p.ocItem.id] = !isLikelyUnreceived
      }
    }
    setSelectedMap(initial)
  }, [open, previas])

  const pendingPrevias = previas.filter((p) => p.saldoQty > 0.0001)
  const allPendingSelected =
    pendingPrevias.length > 0 && pendingPrevias.every((p) => selectedMap[p.ocItem.id])
  const somePendingSelected = pendingPrevias.some((p) => selectedMap[p.ocItem.id])

  const toggleSelectAll = () => {
    const nextVal = !allPendingSelected
    const updated: Record<string, boolean> = { ...selectedMap }
    for (const p of pendingPrevias) {
      updated[p.ocItem.id] = nextVal
    }
    setSelectedMap(updated)
  }

  const selectedCount = pendingPrevias.filter((p) => selectedMap[p.ocItem.id]).length

  const handleConfirm = async () => {
    if (!oc) return
    const selectedIds = Object.keys(selectedMap).filter((id) => selectedMap[id])

    if (selectedIds.length === 0) {
      toast({
        title: 'Nenhum item selecionado',
        description: 'Selecione ao menos um item pendente para dar entrada.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      const res = await distributeOcFull({
        oc_id: oc.id,
        selected_item_ids: selectedIds,
      })

      if (res.oc_marked_received) {
        toast({
          title: 'Ordem de Compra Recebida',
          description: `OC Nº ${res.oc_number} teve entrada integral concluída e foi marcada como Recebida automaticamente!`,
        })
      } else {
        toast({
          title: 'Entrada parcial da OC processada',
          description: `${res.processed_items.length} item(ns) atualizado(s). A OC segue aberta para os itens não selecionados.`,
        })
      }

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast({
        title: 'Erro ao dar entrada integral',
        description:
          getErrorMessage(err) || 'Não foi possível processar a entrada dos itens da OC.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  if (!oc) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="p-6 pb-3 border-b bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <PackageCheck className="size-5 text-emerald-600" />
            <DialogTitle className="text-lg">
              Dar entrada integral da OC #{oc.oc_number}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground pt-1">
            Distribui as demandas pendentes para as OPs vinculadas aos shortages e registra o
            excedente diretamente como entrada ao estoque geral, fechando os itens selecionados.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {/* Card Resumo do Fornecedor e OC */}
          <div className="p-3 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-muted-foreground block text-[11px]">Fornecedor:</span>
              <strong className="text-slate-800 dark:text-slate-100 text-sm">
                <NoTranslate as="span">{oc.supplier || 'Não informado'}</NoTranslate>
              </strong>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-white dark:bg-slate-900 border-blue-300">
                Total da OC: {previas.length} itens
              </Badge>
              <Badge
                variant="outline"
                className="bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200"
              >
                Com saldo: {pendingPrevias.length} itens
              </Badge>
            </div>
          </div>

          {/* Dica sobre a regra de segurança */}
          <div className="p-3 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg text-amber-900 dark:text-amber-300 flex items-start gap-2 text-xs">
            <Info className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Atenção aos itens genuinamente não recebidos:</strong> Itens sem nenhuma
              entrada física real não devem ser fechados. O sistema desmarca previamente itens sem
              saldo em estoque físico para evitar fechamentos indevidos. Desmarque qualquer item
              cujo material físico ainda não tenha chegado à empresa.
            </div>
          </div>

          {/* Tabela de Itens */}
          <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-800/60 text-xs">
                <TableRow>
                  <TableHead className="w-[40px] text-center">
                    <Checkbox
                      checked={
                        allPendingSelected ? true : somePendingSelected ? 'indeterminate' : false
                      }
                      onCheckedChange={toggleSelectAll}
                      aria-label="Selecionar todos os pendentes"
                    />
                  </TableHead>
                  <TableHead className="w-[120px]">Código</TableHead>
                  <TableHead>Descrição & Destino</TableHead>
                  <TableHead className="text-right w-[80px]">Comprado</TableHead>
                  <TableHead className="text-right w-[90px]">Já Recebido</TableHead>
                  <TableHead className="text-right w-[80px]">Saldo</TableHead>
                  <TableHead className="w-[200px]">Ação Prevista</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previas.map((p) => {
                  const isSelected = !!selectedMap[p.ocItem.id]
                  const isDisabled = p.isFullyReceived || p.saldoQty <= 0.0001
                  const isSuspiciousUnreceived =
                    !p.isPhysicallyInStock && p.alreadyRcvd <= 0.0001 && p.saldoQty > 0

                  return (
                    <TableRow
                      key={p.ocItem.id}
                      className={isDisabled ? 'bg-slate-50/40 opacity-60' : undefined}
                    >
                      <TableCell className="text-center">
                        <Checkbox
                          checked={isSelected}
                          disabled={isDisabled}
                          onCheckedChange={(checked) =>
                            setSelectedMap((prev) => ({
                              ...prev,
                              [p.ocItem.id]: !!checked,
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <NoTranslate as="span">{p.code || '-'}</NoTranslate>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            <NoTranslate as="span">{p.description}</NoTranslate>
                          </div>
                          {/* Sinais informativos */}
                          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                            {isSuspiciousUnreceived && (
                              <Badge
                                variant="outline"
                                className="border-red-400 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 gap-1 px-1.5 py-0"
                              >
                                <ShieldAlert className="size-3 text-red-600" />
                                Sem entrada física no estoque
                              </Badge>
                            )}
                            {p.isPhysicallyInStock && (
                              <Badge
                                variant="outline"
                                className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 gap-1 px-1.5 py-0"
                              >
                                <Warehouse className="size-3 text-emerald-600" />
                                Saldo físico atual: {formatQuantity(p.currentStockQty)} {p.unit}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatQuantity(p.purchasedQty)}
                      </TableCell>
                      <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-medium">
                        {formatQuantity(p.alreadyRcvd)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-amber-700 dark:text-amber-400">
                        {formatQuantity(p.saldoQty)}
                      </TableCell>
                      <TableCell>
                        {p.isFullyReceived ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px]"
                          >
                            <CheckCircle2 className="size-3 mr-1" />
                            Já Recebido
                          </Badge>
                        ) : (
                          <div className="flex flex-col gap-1 text-[11px]">
                            {p.hasPendingOpDemand && p.opDemandQty > 0 && (
                              <div className="text-blue-700 dark:text-blue-300 flex items-center gap-1">
                                <ArrowRight className="size-3 shrink-0" />
                                <span>
                                  Distribuir <strong>{formatQuantity(p.opDemandQty)}</strong> para
                                  OP
                                </span>
                              </div>
                            )}
                            {p.surplusQty > 0 && (
                              <div className="text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                <Warehouse className="size-3 shrink-0" />
                                <span>
                                  Excedente <strong>+{formatQuantity(p.surplusQty)}</strong> ao
                                  estoque
                                </span>
                              </div>
                            )}
                            {!p.hasPendingOpDemand && p.surplusQty <= 0 && (
                              <span className="text-muted-foreground">Sem ações pendentes</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="p-4 border-t bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between sm:justify-between w-full">
          <div className="text-xs text-muted-foreground">
            <strong>{selectedCount}</strong> de <strong>{pendingPrevias.length}</strong> itens
            selecionados para entrada.
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={loading || selectedCount === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
            >
              {loading && <Loader2 className="size-3.5 animate-spin" />}
              <PackageCheck className="size-4" />
              Confirmar Entrada Integral ({selectedCount})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
