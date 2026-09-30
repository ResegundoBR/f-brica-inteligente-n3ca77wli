import { useState, useEffect, useMemo } from 'react'
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, Copy, Check, Loader2, Trash2, ShoppingCart } from 'lucide-react'
import { MaterialShortage, Quotation } from '@/types'
import { toast } from 'sonner'
import pb from '@/lib/pocketbase/client'
import { selectQuotation, getQuotationsByShortage, createQuotation } from '@/services/quotations'
import { SupplierSearch } from './SupplierSearch'
import { SupplierFormDialog } from './SupplierFormDialog'
import {
  findOtherOpDemands,
  findConsolidatedDemandAsync,
  ItemDemandConsolidation,
} from '@/services/material-consolidation'
import { ConsolidatedDemandBlock } from './ConsolidatedDemandBlock'
import { UserActionBadge } from '@/components/UserActionBadge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn, formatQuantity } from '@/lib/utils'
import { findMostUrgentOp, checkQuotationDeliveryRisk } from './delivery-deadline-risk'
import { QuotationDeadlineWarning } from './QuotationDeadlineWarning'

interface EnhancedQuotationFormProps {
  item: MaterialShortage
  allShortages?: MaterialShortage[]
  groupedItems?: MaterialShortage[]
  onUpdate: () => void
  onClose: () => void
  onDirectCompra?: (
    selectedIds: string[],
    extraCompraInfo?: {
      actualPurchaseQty: number
      requestedBatchQty: number
      componentCode?: string
      componentDescription: string
      selectedQuotation?: Quotation | null
      sector?: string
    },
  ) => void
}

export function EnhancedQuotationForm({
  item,
  allShortages = [],
  groupedItems = [],
  onUpdate,
  onClose,
  onDirectCompra,
}: EnhancedQuotationFormProps) {
  // Se groupedItems tiver itens deste mesmo código, usamos a quantidade consolidada total
  const groupList = groupedItems.length > 0 ? groupedItems : [item]
  const isMultiItem = groupList.length > 1
  const totalGroupQty = groupList.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0)

  // Sublinhas selecionadas no modal para compra do lote/parcial
  const [selectedModalSubIds, setSelectedModalSubIds] = useState<Set<string>>(
    () => new Set(groupList.map((i) => i.id)),
  )

  useEffect(() => {
    setSelectedModalSubIds(new Set(groupList.map((i) => i.id)))
  }, [groupList])

  const modalSelectedUnits = useMemo(() => {
    return groupList
      .filter((i) => selectedModalSubIds.has(i.id))
      .reduce((sum, curr) => sum + (Number(curr.quantity) || 0), 0)
  }, [groupList, selectedModalSubIds])

  // Consolidação síncrona inicial baseada em material_shortages
  const initialConsolidation = useMemo(() => {
    const excluded = isMultiItem ? groupList.map((g) => g.id) : undefined
    return findOtherOpDemands(item, allShortages, excluded)
  }, [item, allShortages, isMultiItem, groupList])

  // Estado da consolidação completa com demandas futuras e estoque
  const [consolidation, setConsolidation] = useState<ItemDemandConsolidation>(initialConsolidation)
  const [loadingConsolidation, setLoadingConsolidation] = useState(false)

  // Carregar consolidação assíncrona (demandas futuras de engenharia e estoque)
  useEffect(() => {
    let active = true
    setLoadingConsolidation(true)

    findConsolidatedDemandAsync({
      currentItem: item,
      groupItems: isMultiItem ? groupList : undefined,
      allShortages,
      includeFutureDemands: true,
      includeStock: true,
    })
      .then((res) => {
        if (active) {
          setConsolidation(res)
        }
      })
      .catch((err) => {
        console.error('Erro ao calcular consolidação assíncrona:', err)
      })
      .finally(() => {
        if (active) setLoadingConsolidation(false)
      })

    return () => {
      active = false
    }
  }, [item, groupList, isMultiItem, allShortages])

  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [desc, setDesc] = useState(item.description)
  // No modo grupo consolidado: exibe a quantidade consolidada total do contexto
  const [qty, setQty] = useState(String(isMultiItem ? totalGroupQty : item.quantity))

  // Quantidade real de compra informada pelo comprador para o lote (permite compra adicional)
  const [purchaseQty, setPurchaseQty] = useState(String(modalSelectedUnits))

  // Atualiza purchaseQty padrão quando a seleção de sublinhas muda (se o usuário ainda não tiver customizado ou se mudar a seleção)
  useEffect(() => {
    setPurchaseQty(String(modalSelectedUnits))
  }, [modalSelectedUnits])

  // Atualizar valores do formulário se o item ou total do grupo mudar
  useEffect(() => {
    setDesc(item.description || '')
    setQty(String(isMultiItem ? totalGroupQty : item.quantity))
  }, [item.description, item.quantity, isMultiItem, totalGroupQty])

  const [supplier, setSupplier] = useState('')
  const [price, setPrice] = useState('')
  const [stValue, setStValue] = useState('')
  const [ipiValue, setIpiValue] = useState('')
  const [deliveryDays, setDeliveryDays] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showSupplierForm, setShowSupplierForm] = useState(false)

  // OP mais urgente do contexto consolidado (do lote no modo grupo, da solicitação no item único)
  const mostUrgentOp = useMemo(() => {
    return findMostUrgentOp({
      currentItem: item,
      groupList: isMultiItem ? groupList : undefined,
      consolidation,
    })
  }, [item, isMultiItem, groupList, consolidation])

  // Verificação em tempo real do prazo que está sendo digitado
  const typingDeliveryRisk = useMemo(() => {
    return checkQuotationDeliveryRisk({
      deliveryDays,
      mostUrgentOp,
    })
  }, [deliveryDays, mostUrgentOp])

  const loadQuotations = async () => {
    try {
      const quots = await pb.collection('quotations').getFullList<Quotation>({
        filter: `material_shortage_id = "${item.id}"`,
        sort: 'price',
        expand: 'quoted_by',
      })
      setQuotations(quots)
    } catch {
      /* ignored */
    }
  }

  useEffect(() => {
    loadQuotations()
  }, [item.id])

  const handleAddQuotation = async () => {
    if (!supplier.trim() || !price.trim()) {
      toast.error('Preencha fornecedor e preço')
      return
    }
    setSaving(true)
    try {
      const parsedSt = stValue ? parseFloat(stValue) : undefined
      const parsedIpi = ipiValue ? parseFloat(ipiValue) : undefined
      await pb.collection('quotations').create({
        material_shortage_id: item.id,
        supplier: supplier.trim(),
        price: parseFloat(price),
        st_value: parsedSt && Number.isFinite(parsedSt) ? parsedSt : undefined,
        ipi_value: parsedIpi && Number.isFinite(parsedIpi) ? parsedIpi : undefined,
        delivery_days: deliveryDays ? parseInt(deliveryDays) : undefined,
        quoted_by: pb.authStore.record?.id || undefined,
        selected: false,
      })
      await loadQuotations()
      setSupplier('')
      setPrice('')
      setStValue('')
      setIpiValue('')
      setDeliveryDays('')
      onUpdate()
      toast.success('Cotação adicionada')
    } catch {
      toast.error('Erro ao adicionar cotação')
    } finally {
      setSaving(false)
    }
  }

  const handleSelectQuotation = async (q: Quotation) => {
    try {
      const extraIds = groupList.filter((it) => it.id !== item.id).map((it) => it.id)
      await selectQuotation(q.id, item.id, extraIds)

      // Garantir que a cotação equivalente exista e esteja marcada nos sub-itens
      if (isMultiItem && extraIds.length > 0) {
        for (const subId of extraIds) {
          try {
            const subQuotes = await getQuotationsByShortage(subId)
            const matching = subQuotes.find((sq) => sq.supplier === q.supplier)
            if (matching) {
              await selectQuotation(matching.id, subId)
            } else {
              const created = await createQuotation({
                material_shortage_id: subId,
                supplier: q.supplier,
                price: q.price,
                delivery_days: q.delivery_days,
                st_value: q.st_value,
                ipi_value: q.ipi_value,
              })
              await selectQuotation(created.id, subId)
            }
          } catch (propErr) {
            console.warn('Erro ao propagar cotação para sub-item do grupo:', subId, propErr)
          }
        }
      }

      await loadQuotations()
      onUpdate()
      toast.success(
        isMultiItem
          ? `Fornecedor selecionado e sincronizado para as ${groupList.length} OPs do grupo`
          : 'Fornecedor selecionado e dados sincronizados',
      )
    } catch {
      toast.error('Erro ao selecionar')
    }
  }

  const handleDeleteQuotation = async (q: Quotation) => {
    try {
      await pb.collection('quotations').delete(q.id)
      setQuotations((prev) => prev.filter((x) => x.id !== q.id))
      onUpdate()
      toast.success('Cotação removida')
    } catch {
      toast.error('Erro ao remover')
    }
  }

  const handleEditItem = async () => {
    // TRAVA DE SEGURANÇA: No modo grupo (isMultiItem), o cabeçalho é somente leitura e NUNCA grava no registro individual!
    if (isMultiItem) return
    if (desc === item.description && qty === String(item.quantity)) return
    try {
      await pb.collection('material_shortages').update(item.id, {
        description: desc,
        quantity: parseFloat(qty),
      })
      onUpdate()
      toast.success('Item atualizado')
    } catch {
      toast.error('Erro ao atualizar item')
    }
  }

  const handleCopyWhatsApp = () => {
    const text = `Solicitação de Cotação\n\nItem: ${desc}\nQuantidade: ${qty}\n\nFavor informar preço e prazo de entrega.`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Texto copiado para área de transferência')
    })
  }

  /**
   * Manipulador para adotar a quantidade consolidada no bloco.
   * - No modo grupo (isMultiItem): apenas atualiza a quantidade exibida no contexto local da cotação
   *   SEM GRAVAR em nenhum registro individual (respeitando estritamente a trava de proteção).
   * - No modo item único: atualiza o registro individual no backend e no estado local.
   */
  const handleApplyConsolidatedTotal = (suggestedQty: number) => {
    setQty(String(suggestedQty))
    if (isMultiItem) {
      // Pré-preenche o campo da Quantidade Real de Compra com a sugestão consolidada
      setPurchaseQty(String(suggestedQty))
      const diff = Math.max(0, suggestedQty - modalSelectedUnits)
      toast.success(
        diff > 0
          ? `Quantidade de compra preenchida com ${suggestedQty} un (+${diff} un excedente para estoque, solicitações mantidas)`
          : `Quantidade de compra ajustada para ${suggestedQty} un`,
      )
      return
    }

    pb.collection('material_shortages')
      .update(item.id, { quantity: suggestedQty })
      .then(() => {
        onUpdate()
        toast.success(`Quantidade atualizada para ${suggestedQty} un (total consolidado)`)
      })
      .catch(() => {
        toast.error('Erro ao atualizar quantidade do item')
      })
  }

  // Cotação selecionada atualmente (se houver)
  const currentSelectedQuotation = useMemo(() => {
    return quotations.find((q) => q.selected) || null
  }, [quotations])

  // Cálculo do excedente do lote
  const parsedActualPurchaseQty = Number(purchaseQty) || 0
  const isFullBatch = selectedModalSubIds.size === groupList.length
  const requestedBaseQty = isFullBatch ? totalGroupQty : modalSelectedUnits
  const surplusQty = Math.max(0, parsedActualPurchaseQty - requestedBaseQty)
  const hasSurplus = surplusQty > 0
  const isPurchaseQtyInvalid = parsedActualPurchaseQty < requestedBaseQty

  const handleConfirmGroupPurchase = () => {
    if (!onDirectCompra || selectedModalSubIds.size === 0) return

    if (isPurchaseQtyInvalid) {
      toast.error(
        `A quantidade real de compra (${parsedActualPurchaseQty} un) não pode ser menor que a soma solicitada das OPs selecionadas (${requestedBaseQty} un).`,
      )
      return
    }

    onDirectCompra(Array.from(selectedModalSubIds), {
      actualPurchaseQty: parsedActualPurchaseQty,
      requestedBatchQty: requestedBaseQty,
      componentCode: item.code,
      componentDescription: item.description,
      selectedQuotation: currentSelectedQuotation,
      sector: item.sector,
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isMultiItem
            ? `Gerenciar Cotações — Grupo Consolidado (${groupList.length} OPs)`
            : 'Gerenciar Cotações'}
        </DialogTitle>
        <DialogDescription>
          {isMultiItem
            ? `Cotação única para o código ${item.code || '-'}. Preço e condições serão distribuídos entre as ${groupList.length} OPs.`
            : 'Adicione e compare cotações de fornecedores.'}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 max-h-[60vh] overflow-y-auto">
        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
          <div className="col-span-2">
            <Label className="text-xs">Descrição</Label>
            {isMultiItem ? (
              <Input
                value={desc}
                readOnly
                disabled
                className="h-8 text-sm notranslate bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 cursor-not-allowed select-none"
                translate="no"
              />
            ) : (
              <Input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="h-8 text-sm notranslate"
                translate="no"
                onBlur={handleEditItem}
              />
            )}
          </div>
          <div>
            <Label className="text-xs">
              {isMultiItem ? 'Total do lote (somatório das OPs)' : 'Quantidade'}
            </Label>
            {isMultiItem ? (
              <Input
                type="text"
                value={`${qty} un`}
                readOnly
                disabled
                className="h-8 text-sm font-semibold notranslate bg-slate-100 dark:bg-slate-900 text-blue-700 dark:text-blue-300 cursor-not-allowed select-none"
                translate="no"
              />
            ) : (
              <Input
                type="number"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="h-8 text-sm notranslate"
                translate="no"
                onBlur={handleEditItem}
              />
            )}
          </div>
        </div>

        {/* Se for grupo consolidado de OPs, mostrar resumo e seleção das OPs atendidas */}
        {isMultiItem && (
          <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900 text-xs space-y-2.5">
            <div className="font-semibold text-blue-900 dark:text-blue-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span>OPs do lote ({groupList.length} OPs):</span>
              </span>
              <span className="font-bold text-blue-700 dark:text-blue-300">
                {selectedModalSubIds.size === groupList.length
                  ? `${totalGroupQty} un (lote completo)`
                  : `${modalSelectedUnits} de ${totalGroupQty} un selecionadas`}
              </span>
            </div>

            {/* Checkbox selecionar todas / limpar */}
            <div className="flex items-center justify-between pb-1 border-b border-blue-200 dark:border-blue-800">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 dark:text-slate-300">
                <Checkbox
                  checked={
                    selectedModalSubIds.size === groupList.length
                      ? true
                      : selectedModalSubIds.size > 0
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedModalSubIds(new Set(groupList.map((i) => i.id)))
                    } else {
                      setSelectedModalSubIds(new Set())
                    }
                  }}
                />
                <span>Selecionar todas as sublinhas ({groupList.length} OPs)</span>
              </label>

              {onDirectCompra && (
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  disabled={selectedModalSubIds.size === 0 || isPurchaseQtyInvalid}
                  className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  onClick={handleConfirmGroupPurchase}
                >
                  <ShoppingCart className="size-3.5 mr-1" />
                  {hasSurplus
                    ? `Comprar ${parsedActualPurchaseQty} un (${requestedBaseQty} OPs + ${surplusQty} Estoque)`
                    : selectedModalSubIds.size === groupList.length
                      ? `Comprar Lote Completo (${totalGroupQty} un)`
                      : `Comprar selecionadas (${modalSelectedUnits} un)`}
                </Button>
              )}
            </div>

            {/* Linha de Quantidade Real de Compra (Permite compras adicionais para estoque) */}
            <div className="p-2 bg-white/80 dark:bg-slate-900/80 rounded border border-blue-200 dark:border-blue-800 space-y-1.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Quantidade real de compra (un):
                    </Label>
                    <span className="text-[11px] text-muted-foreground">
                      (mínimo solicitado:{' '}
                      <strong className="notranslate" translate="no">
                        {requestedBaseQty} un
                      </strong>
                      )
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Compre mais para caixa fechada ou necessidades futuras. O excedente será
                    registrado como{' '}
                    <strong className="text-slate-700 dark:text-slate-300">
                      &ldquo;Compra para estoque&rdquo;
                    </strong>{' '}
                    sem alterar as OPs.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Input
                    type="number"
                    min={requestedBaseQty}
                    step="1"
                    value={purchaseQty}
                    onChange={(e) => setPurchaseQty(e.target.value)}
                    className={cn(
                      'h-8 w-28 text-center text-sm font-bold notranslate',
                      hasSurplus &&
                        'border-emerald-500 bg-emerald-50/50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
                      isPurchaseQtyInvalid &&
                        'border-red-500 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200',
                    )}
                    translate="no"
                  />
                  {consolidation?.totalConsolidatedQuantity &&
                    consolidation.totalConsolidatedQuantity > requestedBaseQty && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-medium border-amber-300 bg-amber-50/70 hover:bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                        onClick={() =>
                          handleApplyConsolidatedTotal(consolidation.totalConsolidatedQuantity)
                        }
                        title="Adota a quantidade da consolidação com necessidades futuras"
                      >
                        Consolidado ({formatQuantity(consolidation.totalConsolidatedQuantity)} un)
                      </Button>
                    )}
                </div>
              </div>

              {/* Feedback visual do excedente ou validação */}
              {hasSurplus && (
                <div className="flex items-center justify-between text-[11px] font-medium text-emerald-700 dark:text-emerald-300 pt-1 border-t border-emerald-100 dark:border-emerald-900/50">
                  <span className="flex items-center gap-1">
                    <span>
                      Excedente calculado:{' '}
                      <strong className="notranslate" translate="no">
                        +{formatQuantity(surplusQty)} un
                      </strong>
                    </span>
                    <span>&bull;</span>
                    <span>Registrado como &ldquo;Compra para estoque&rdquo; (geral)</span>
                  </span>
                  {currentSelectedQuotation?.price ? (
                    <span className="notranslate" translate="no">
                      Custo adicional estimado: R${' '}
                      {(surplusQty * currentSelectedQuotation.price).toFixed(2)} (R${' '}
                      {currentSelectedQuotation.price.toFixed(2)}/un)
                    </span>
                  ) : null}
                </div>
              )}

              {isPurchaseQtyInvalid && (
                <div className="text-[11px] font-medium text-red-600 dark:text-red-400 pt-1">
                  A quantidade informada não pode ser inferior ao total solicitado do lote (
                  {formatQuantity(requestedBaseQty)} un).
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
              {groupList.map((gi) => {
                const isSelected = selectedModalSubIds.has(gi.id)
                return (
                  <label
                    key={gi.id}
                    className={cn(
                      'flex items-center justify-between p-1.5 rounded border text-xs cursor-pointer transition-colors',
                      isSelected
                        ? 'bg-blue-100/70 border-blue-300 dark:bg-blue-900/50 dark:border-blue-700 text-blue-950 dark:text-blue-100 font-medium'
                        : 'bg-white/60 border-slate-200 dark:bg-slate-900/40 dark:border-slate-800 text-slate-600 dark:text-slate-400',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          setSelectedModalSubIds((prev) => {
                            const next = new Set(prev)
                            if (checked) next.add(gi.id)
                            else next.delete(gi.id)
                            return next
                          })
                        }}
                      />
                      <span className="truncate">
                        OP{' '}
                        {gi.expand?.order_id?.op_number || gi.expand?.order_id?.order_number || '-'}{' '}
                        <span className="text-[10px] text-muted-foreground">
                          (
                          {gi.expand?.order_id?.order_number
                            ? `Ped ${gi.expand?.order_id?.order_number}`
                            : 'Req'}
                          )
                        </span>
                      </span>
                    </div>
                    <Badge
                      variant={isSelected ? 'default' : 'outline'}
                      className="text-[10px] ml-2 shrink-0"
                    >
                      {formatQuantity(gi.quantity)} un
                    </Badge>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* Bloco de consolidação de demanda com sugestão de quantidade total (exibido tanto no modo único quanto no modo grupo) */}
        {consolidation && consolidation.otherDemands.length > 0 && (
          <ConsolidatedDemandBlock
            consolidation={consolidation}
            currentItemLabel={
              isMultiItem
                ? `Lote consolidado deste grupo (${formatQuantity(totalGroupQty)} un em ${groupList.length} OPs)`
                : `Esta solicitação (${formatQuantity(item.quantity)} un)`
            }
            itemDescription={item.description}
            itemCode={item.code}
            onApplyTotal={handleApplyConsolidatedTotal}
            applyButtonLabel="Adotar quantidade consolidada"
          />
        )}

        <div className="space-y-2 p-3 border rounded-lg">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">Fornecedor</Label>
              <SupplierSearch value={supplier} onChange={setSupplier} />
            </div>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => setShowSupplierForm(true)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Preço (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-8 text-sm notranslate"
                translate="no"
              />
            </div>
            <div>
              <Label className="text-xs">ST (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={stValue}
                onChange={(e) => setStValue(e.target.value)}
                placeholder="0.00"
                className="h-8 text-sm notranslate"
                translate="no"
              />
            </div>
            <div>
              <Label className="text-xs">IPI (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={ipiValue}
                onChange={(e) => setIpiValue(e.target.value)}
                placeholder="0.00"
                className="h-8 text-sm notranslate"
                translate="no"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Prazo (dias)</Label>
              <Input
                type="number"
                value={deliveryDays}
                onChange={(e) => setDeliveryDays(e.target.value)}
                className={cn(
                  'h-8 text-sm notranslate',
                  typingDeliveryRisk.hasRisk &&
                    (typingDeliveryRisk.urgencyLevel === 'urgent'
                      ? 'border-red-400 focus-visible:ring-red-400'
                      : 'border-amber-400 focus-visible:ring-amber-400'),
                )}
                translate="no"
              />
            </div>
          </div>

          {/* Aviso de Prazo × Vencimento da OP em tempo real na digitação */}
          {typingDeliveryRisk.hasRisk && (
            <QuotationDeadlineWarning checkResult={typingDeliveryRisk} />
          )}

          <Button className="w-full" size="sm" onClick={handleAddQuotation} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Adicionar Cotação
          </Button>
        </div>
        {quotations.length > 0 && (
          <div className="space-y-1">
            {quotations.map((q) => {
              const qRisk = checkQuotationDeliveryRisk({
                deliveryDays: q.delivery_days,
                mostUrgentOp,
              })

              return (
                <div
                  key={q.id}
                  className={cn(
                    'p-2 border rounded-lg transition-colors space-y-1.5',
                    q.selected &&
                      'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={q.selected ? 'default' : 'outline'}
                      className="h-6 px-2"
                      onClick={() => handleSelectQuotation(q)}
                    >
                      {q.selected && <Check className="w-3 h-3 mr-1" />}
                      {q.selected ? 'Sel.' : 'Sel.'}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-sm font-medium notranslate truncate" translate="no">
                          {q.supplier}
                        </p>
                        <UserActionBadge
                          user={q.expand?.quoted_by}
                          date={q.created}
                          prefix="por"
                          compact={true}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground notranslate" translate="no">
                        R$ {q.price.toFixed(2)}
                        {q.st_value ? ` • ST: R$ ${q.st_value.toFixed(2)}` : ''}
                        {q.ipi_value ? ` • IPI: R$ ${q.ipi_value.toFixed(2)}` : ''}
                        {` • ${q.delivery_days || '-'} dias`}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0"
                      onClick={() => handleDeleteQuotation(q)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>

                  {/* Aviso de Prazo × Vencimento da OP para esta cotação salva */}
                  {qRisk.hasRisk && <QuotationDeadlineWarning checkResult={qRisk} />}
                </div>
              )
            })}
          </div>
        )}
        <Button variant="outline" className="w-full" onClick={handleCopyWhatsApp}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          Copiar para WhatsApp/E-mail
        </Button>
      </div>
      <SupplierFormDialog
        open={showSupplierForm}
        onOpenChange={setShowSupplierForm}
        onCreated={(name) => setSupplier(name)}
      />
    </>
  )
}
