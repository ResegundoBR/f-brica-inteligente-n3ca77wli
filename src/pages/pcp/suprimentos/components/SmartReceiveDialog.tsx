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
import { toDateFieldValue, formatQuantity } from '@/lib/pcp-utils'
import { checkAndUpdateAffectedOcs } from '@/services/oc-receiving-automation'

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
    setPurchaseDate(toDateFieldValue(item.purchase_date))
    setArrivalDate(toDateFieldValue(new Date()))
    setUnitPrice(item.unit_price ? String(item.unit_price) : '')
    setFreight('')
    const fetchRelated = async () => {
      try {
        // Se fizer parte de um lote explícito (batch_id), busca primariamente TODOS os membros do lote
        if (item.batch_id) {
          const batchFilter = `batch_id = "${item.batch_id}" && (status = "Compra" || status = "Recebido_Parcial" || status = "Recebido")`
          let batchRes = await pb.collection('material_shortages').getFullList<MaterialShortage>({
            filter: batchFilter,
            expand: 'order_id,order_id.product_id,order_id.client_id',
            sort: 'created',
          })
          if (batchRes.length > 0) {
            // Identifica o representante do lote (com batch_info ou primeiro)
            const parent = batchRes.find((x) => x.batch_info?.is_batch_parent) || item
            const actualQty = parent.batch_info?.actual_quantity

            // Separar membros de OP vs membros de excedente
            const opMembers = batchRes.filter(
              (x) =>
                Boolean(x.order_id) &&
                !x.observation?.includes('Compra para estoque') &&
                x.id !== parent.batch_info?.surplus_shortage_id,
            )
            // Localiza excedente: prioriza surplus_shortage_id do batch_info, ou o mais recente ativo
            const surplusCandidates = batchRes.filter(
              (x) =>
                !x.order_id &&
                (x.observation?.includes('Compra para estoque') ||
                  x.id === parent.batch_info?.surplus_shortage_id),
            )
            const surplusMember =
              surplusCandidates.find((x) => x.id === parent.batch_info?.surplus_shortage_id) ||
              surplusCandidates[surplusCandidates.length - 1]

            // Limpa da lista de exibição quaisquer excedentes duplicados que não sejam o surplusMember escolhido
            if (surplusCandidates.length > 1 && surplusMember) {
              batchRes = batchRes.filter(
                (x) => !surplusCandidates.includes(x) || x.id === surplusMember.id,
              )
            }
            setRelated(batchRes)

            // 1. Pré-preenche a quantidade total recebida com a quantidade real do lote (ex.: 17 un da OC)
            if (actualQty && actualQty > 0) {
              setTotalReceived(String(actualQty))
            } else if (surplusMember && Number(surplusMember.quantity) > 0) {
              const opSum = opMembers.reduce((s, x) => s + (Number(x.quantity) || 0), 0)
              setTotalReceived(String(opSum + Number(surplusMember.quantity)))
            } else {
              const sumTotal = batchRes.reduce((s, x) => s + (Number(x.quantity) || 0), 0)
              setTotalReceived(String(sumTotal))
            }

            // 2. Pré-distribui as quantidades exatas para baixa das OPs vinculadas (ex.: 1/5/4)
            const initialDist: Record<string, string> = {}
            for (const bItem of opMembers) {
              const needed = Number(bItem.quantity) || 0
              const already = Number(bItem.received_quantity) || 0
              const rem = Math.max(0, needed - already)
              if (rem > 0) {
                initialDist[bItem.id] = String(rem)
              }
            }
            setDistributions(initialDist)
            return
          }
        }

        // Caso item avulso ou sem lote explícito: busca solicitações correlatas do mesmo código/descrição
        const code = (item.code || '').trim()
        const filter = code
          ? `code = "${code}" && (status = "Compra" || status = "Recebido_Parcial")`
          : `description = "${item.description}" && (status = "Compra" || status = "Recebido_Parcial")`
        const res = await pb.collection('material_shortages').getFullList<MaterialShortage>({
          filter,
          expand: 'order_id,order_id.product_id,order_id.client_id',
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
        code: item?.code || related[0]?.code || '',
        description: item?.description || related[0]?.description || '',
        purchase_date: purchaseDate ? `${toDateFieldValue(purchaseDate)} 12:00:00.000Z` : undefined,
        arrival_date: arrivalDate ? `${toDateFieldValue(arrivalDate)} 12:00:00.000Z` : undefined,
        unit_price: numUnitPrice > 0 ? numUnitPrice : undefined,
        freight: numFreight > 0 ? numFreight : undefined,
      }

      // 1. Executa a distribuição via endpoint backend (Entrada total_received no inventory + Saída para cada OP)
      // O excedente (received - distribuído) permanece como saldo líquido positivo em `inventory`
      await distributeMaterials(distArray, received, traceabilityInfo, item?.id)

      // 2. Se este lote tiver registro de excedente ("Compra para estoque" sem order_id),
      // atualiza também esse registro para 'Recebido' para refletir a baixa completa do lote na gestão de suprimentos
      const surplusRecord = related.find(
        (x) =>
          !x.order_id &&
          (x.observation?.includes('Compra para estoque') ||
            x.id === item?.batch_info?.surplus_shortage_id),
      )
      if (surplusRecord && surplusRecord.status !== 'Recebido') {
        try {
          const surplusTargetQty = Number(surplusRecord.quantity) || surplus
          await pb.collection('material_shortages').update(surplusRecord.id, {
            status: 'Recebido',
            received_quantity: surplusTargetQty,
            received_by: pb.authStore.record?.id || undefined,
            ...(traceabilityInfo.code && { code: traceabilityInfo.code }),
          })
        } catch (surplusErr) {
          console.warn('Não foi possível marcar registro de excedente como Recebido:', surplusErr)
        }
      }

      toast({
        title: 'Distribuição concluída',
        description: `${received} unidade(s) recebidas: ${totalDistributed} distribuídas para as OPs e ${surplus} unidade(s) adicionadas ao saldo de estoque.`,
      })

      // Automatizar atualização de status de OCs afetadas se todos os itens estiverem totalmente recebidos
      const affectedIds = [
        ...distArray.map((d) => d.shortage_id),
        ...(item?.id ? [item.id] : []),
        ...(surplusRecord ? [surplusRecord.id] : []),
      ]
      await checkAndUpdateAffectedOcs(affectedIds, {
        customToast: (opts) => toast({ title: opts.title, description: opts.description }),
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
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border space-y-2">
              <div className="flex justify-between text-sm items-center">
                <div className="flex items-center gap-2">
                  <span className="font-semibold notranslate" translate="no">
                    {item?.description || related[0]?.description}
                  </span>
                  {item?.batch_id && (
                    <Badge className="bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-200 text-[10px]">
                      Lote Consolidado
                    </Badge>
                  )}
                </div>
                {(item?.code || related[0]?.code) && (
                  <Badge variant="outline" className="text-xs notranslate font-mono" translate="no">
                    {item?.code || related[0]?.code}
                  </Badge>
                )}
              </div>

              {item?.batch_id && (
                <div className="text-xs text-blue-800 dark:text-blue-300 bg-blue-50/70 dark:bg-blue-950/40 p-2 rounded border border-blue-200 dark:border-blue-900 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Membros do Lote:{' '}
                    <strong>
                      {related.filter((x) => Boolean(x.order_id)).length} OPs vinculadas
                    </strong>
                    {surplus > 0 || related.some((x) => !x.order_id)
                      ? ' + Excedente p/ Estoque'
                      : ''}
                  </span>
                  <span className="font-bold text-blue-900 dark:text-blue-200">
                    Qtd Lote Real: {formatQuantity(totalReceived || totalNeeded)} un
                  </span>
                </div>
              )}

              <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                <span>
                  Demanda das OPs:{' '}
                  <strong className="text-foreground notranslate" translate="no">
                    {formatQuantity(
                      related
                        .filter((x) => Boolean(x.order_id))
                        .reduce((s, x) => s + (Number(x.quantity) || 0), 0) || totalNeeded,
                    )}{' '}
                    un
                  </strong>
                </span>
                <span>
                  Já recebido:{' '}
                  <strong className="text-foreground notranslate" translate="no">
                    {formatQuantity(totalAlreadyReceived)} un
                  </strong>
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
                className="max-w-[200px] notranslate"
                translate="no"
                value={totalReceived}
                onChange={(e) => setTotalReceived(e.target.value)}
              />
            </div>

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
                    const isWithoutOp = !s.order_id && !op
                    const needed = Number(s.quantity) || 0
                    const alreadyRcvd = Number(s.received_quantity) || 0
                    const remaining = Math.max(0, needed - alreadyRcvd)
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm font-medium notranslate" translate="no">
                          {op?.op_number ||
                            op?.order_number ||
                            (isWithoutOp ? 'Estoque Geral / Almoxarifado' : '-')}
                        </TableCell>
                        <TableCell
                          className="text-xs text-muted-foreground notranslate"
                          translate="no"
                        >
                          {product?.code ? `${product.code} - ` : ''}
                          {product?.name || (isWithoutOp ? 'Material sem OP vinculada' : '-')}
                        </TableCell>
                        <TableCell className="text-right text-sm notranslate" translate="no">
                          {formatQuantity(needed)}
                        </TableCell>
                        <TableCell
                          className="text-right text-sm text-muted-foreground notranslate"
                          translate="no"
                        >
                          {formatQuantity(alreadyRcvd)}
                        </TableCell>
                        <TableCell>
                          {isWithoutOp ? (
                            <span className="text-xs text-muted-foreground block text-right italic">
                              Entrada em Estoque
                            </span>
                          ) : (
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              max={remaining}
                              placeholder="0"
                              className="h-8 w-full text-right text-sm notranslate"
                              translate="no"
                              value={distributions[s.id] || ''}
                              onChange={(e) =>
                                setDistributions((prev) => ({ ...prev, [s.id]: e.target.value }))
                              }
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {surplus > 0 && (
              <div className="flex flex-col gap-1 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-900 dark:text-emerald-200">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Warehouse className="size-4 text-emerald-600" />
                  <span>
                    Excedente Direcionado ao Estoque:{' '}
                    <strong className="notranslate" translate="no">
                      +{formatQuantity(surplus)} unidade(s)
                    </strong>
                  </span>
                  <ArrowRight className="inline size-3 text-emerald-600" />
                  <Badge className="bg-emerald-600 text-white font-bold text-[10px]">
                    Saldo Inventário Geral
                  </Badge>
                </div>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 pl-6">
                  Este saldo excedente integrará imediatamente o saldo do inventário (
                  <code>inventory</code>), ficando visível ao alerta de estoque mínimo (
                  <code>pcp_material_min_levels</code>) e aos blocos de disponibilidade de
                  separação.
                </p>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm text-muted-foreground">
                Distribuído:{' '}
                <strong className="text-foreground notranslate" translate="no">
                  {formatQuantity(totalDistributed)}
                </strong>{' '}
                /{' '}
                <span className="notranslate" translate="no">
                  {formatQuantity(Number(totalReceived) || 0)}
                </span>
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
