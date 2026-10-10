import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MaterialShortage, Quotation, Supplier } from '@/types'
import { getQuotationsByShortage, selectQuotation } from '@/services/quotations'
import { getSuppliers } from '@/services/suppliers'
import { toast } from 'sonner'
import { Loader2, Save, Check, Trash2, Info, ChevronsUpDown, AlertTriangle } from 'lucide-react'
import { cn, formatQuantity } from '@/lib/utils'
import pb from '@/lib/pocketbase/client'
import { findOtherOpDemands } from '@/services/material-consolidation'
import { ConsolidatedDemandBlock } from './ConsolidatedDemandBlock'
import { toDateFieldValue } from '@/lib/pcp-utils'
import { NoTranslate } from '@/components/NoTranslate'
import { findMostUrgentOp, checkQuotationDeliveryRisk } from './delivery-deadline-risk'
import { QuotationDeadlineWarning } from './QuotationDeadlineWarning'
import { useAuth } from '@/hooks/use-auth'
import {
  calculateBatchQuantityPlan,
  resolveBatchMembers,
  BatchQuantityPlan,
} from './batch-quantity-rules'

interface ComprasItemDialogProps {
  item: MaterialShortage | null
  allShortages?: MaterialShortage[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void
  onDeleteRequest?: (item: MaterialShortage) => void
}

export function ComprasItemDialog({
  item,
  allShortages = [],
  open,
  onOpenChange,
  onUpdate,
  onDeleteRequest,
}: ComprasItemDialogProps) {
  const { user } = useAuth()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedQuotationId, setSelectedQuotationId] = useState('')
  const [supplier, setSupplier] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [quantityInput, setQuantityInput] = useState<string>('')
  const [itemQuantity, setItemQuantity] = useState<number>(0)

  // Confirmação explícita quando a alteração de quantidade afeta uma OP específica
  const [pendingOpConfirmPlan, setPendingOpConfirmPlan] = useState<BatchQuantityPlan | null>(null)
  const [opConfirmOpen, setOpConfirmOpen] = useState(false)

  // Lista de fornecedores cadastrados para o combobox
  const [registeredSuppliers, setRegisteredSuppliers] = useState<Supplier[]>([])
  const [supplierComboboxOpen, setSupplierComboboxOpen] = useState(false)
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('')

  const consolidation = useMemo(() => {
    if (!item) return null
    return findOtherOpDemands(item, allShortages)
  }, [item, allShortages])

  // OP mais urgente do contexto consolidado
  const mostUrgentOp = useMemo(() => {
    return findMostUrgentOp({
      currentItem: item,
      consolidation,
    })
  }, [item, consolidation])

  const fetchQuotations = useCallback(async () => {
    if (!item) return
    setLoading(true)
    try {
      const res = await getQuotationsByShortage(item.id)
      setQuotations(res)
      const selected = res.find((q) => q.selected)
      setSelectedQuotationId(selected?.id || '')
    } catch {
      /* ignored */
    } finally {
      setLoading(false)
    }
  }, [item])

  // Carrega fornecedores cadastrados na coleção 'suppliers' ordenados por nome
  useEffect(() => {
    if (open) {
      getSuppliers()
        .then((data) => setRegisteredSuppliers(data || []))
        .catch((err) => {
          console.warn('Erro ao carregar fornecedores cadastrados:', err)
        })
    }
  }, [open])

  useEffect(() => {
    if (open && item) {
      fetchQuotations()
      setSupplier(item.supplier || '')
      setUnitPrice(item.unit_price ? String(item.unit_price) : '')
      setExpectedDate(toDateFieldValue(item.expected_date))
      const initialQty = Number(item.quantity) || 0
      setQuantityInput(String(initialQty))
      setItemQuantity(initialQty)
      setSupplierSearchQuery('')
      setSupplierComboboxOpen(false)
    }
  }, [open, item, fetchQuotations])

  const handleSelectQuotation = async (quotationId: string) => {
    if (!item) return
    setSelectedQuotationId(quotationId)
    try {
      const selected = await selectQuotation(quotationId, item.id)
      setSupplier(selected.supplier)
      setUnitPrice(String(selected.price))
      if (selected.delivery_days && selected.delivery_days > 0) {
        const date = new Date(Date.now() + selected.delivery_days * 86400000)
        setExpectedDate(toDateFieldValue(date))
      }

      // Se este item fizer parte de um lote consolidado (batch_id ou sub_shortage_ids), sincroniza em todos os membros do lote
      const batchMates = (item.batch_info?.sub_shortage_ids || []).filter((id) => id !== item.id)
      if (item.batch_id || batchMates.length > 0) {
        const otherIds =
          batchMates.length > 0
            ? batchMates
            : allShortages
                .filter((s) => s.batch_id === item.batch_id && s.id !== item.id)
                .map((s) => s.id)

        for (const sid of otherIds) {
          try {
            await pb.collection('material_shortages').update(sid, {
              supplier: selected.supplier,
              unit_price: selected.price,
              ...(selected.delivery_days &&
                selected.delivery_days > 0 && {
                  expected_date: new Date(Date.now() + selected.delivery_days * 86400000)
                    .toISOString()
                    .split('T')[0],
                }),
            })
          } catch (mErr) {
            console.warn('Erro ao propagar cotação para membro do lote:', sid, mErr)
          }
        }
      }

      toast.success('Cotação selecionada e aplicada ao lote')
      onUpdate()
    } catch {
      toast.error('Erro ao selecionar cotação')
    }
  }

  // Identifica se o fornecedor atual está cadastrado na coleção suppliers
  const isSupplierRegistered = useMemo(() => {
    const trimmed = supplier.trim()
    if (!trimmed) return true // Não exibe aviso se o campo estiver vazio
    const lower = trimmed.toLowerCase()
    return registeredSuppliers.some((s) => s.name.trim().toLowerCase() === lower)
  }, [supplier, registeredSuppliers])

  /**
   * Trata a seleção ou alteração de fornecedor (modo aditivo):
   * Se o novo fornecedor tiver uma cotação registrada para este item, mantém a cotação coerente
   * (seleciona a cotação dele, ou preenche preço/prazo se o usuário não tiver sobrescrito).
   */
  const handleSupplierChange = (newSupplier: string) => {
    setSupplier(newSupplier)

    const trimmedNew = newSupplier.trim().toLowerCase()
    if (!trimmedNew) return

    // Verifica se há alguma cotação registrada deste fornecedor
    const matchingQuotation = quotations.find(
      (q) => q.supplier?.trim().toLowerCase() === trimmedNew,
    )

    if (matchingQuotation) {
      setSelectedQuotationId(matchingQuotation.id)
      setUnitPrice(String(matchingQuotation.price))
      if (matchingQuotation.delivery_days && matchingQuotation.delivery_days > 0) {
        const date = new Date(Date.now() + matchingQuotation.delivery_days * 86400000)
        setExpectedDate(toDateFieldValue(date))
      }
    } else {
      // Se não há cotação do fornecedor selecionado, desmarca a cotação selecionada anteriormente
      // (pois a cotação anterior pertencia a outro fornecedor)
      if (selectedQuotationId) {
        const currentSelected = quotations.find((q) => q.id === selectedQuotationId)
        if (currentSelected && currentSelected.supplier?.trim().toLowerCase() !== trimmedNew) {
          setSelectedQuotationId('')
        }
      }
    }
  }

  // Identifica e estrutura os dados do lote
  const batchResolution = useMemo(() => {
    return resolveBatchMembers(item, allShortages)
  }, [item, allShortages])

  const isBatchMember = batchResolution.isBatch

  const effectiveQuantity = useMemo(() => {
    const parsed = Number(quantityInput)
    if (!isNaN(parsed) && quantityInput.trim() !== '') {
      return parsed
    }
    return itemQuantity || (item ? Number(item.quantity) || 0 : 0)
  }, [quantityInput, itemQuantity, item])

  // Plano de redistribuição da quantidade e validações de limite
  const quantityPlan = useMemo(() => {
    if (!item) return null
    return calculateBatchQuantityPlan({
      item,
      targetNewQuantity: effectiveQuantity,
      allShortages,
    })
  }, [item, effectiveQuantity, allShortages])

  // Execução definitiva do salvamento após validações e confirmações
  const executeSave = async (plan: BatchQuantityPlan) => {
    if (!item) return
    setSaving(true)
    try {
      const origQty = Number(item.quantity) || 0
      const userName = user?.name || user?.email || 'Usuário'
      const dateFormatted = new Date().toLocaleString('pt-BR')
      const targetItemUpdate = plan.itemsToUpdate.find((it) => it.id === item.id)
      const finalItemQty = targetItemUpdate ? targetItemUpdate.newQty : plan.totalNewQuantity

      let newObservation = item.observation || ''
      if (finalItemQty !== origQty) {
        const auditLog = `Qtde ajustada de ${origQty} para ${finalItemQty} na Compra por ${userName} em ${dateFormatted}`
        newObservation = newObservation ? `${newObservation} | ${auditLog}` : auditLog
      }

      // 1. Atualiza o registro principal selecionado
      const updateData: Record<string, any> = {
        supplier,
        quantity: finalItemQty,
        observation: newObservation,
        ...(unitPrice !== '' && !isNaN(Number(unitPrice)) && { unit_price: Number(unitPrice) }),
        ...(expectedDate && { expected_date: `${toDateFieldValue(expectedDate)} 12:00:00.000Z` }),
      }

      // Se este item for o líder/representante do lote, atualiza actual_quantity e surplus_quantity no batch_info
      if (item.batch_info?.is_batch_parent) {
        updateData.batch_info = {
          ...item.batch_info,
          actual_quantity: plan.totalNewQuantity,
          surplus_quantity: plan.surplusQty,
          ...(supplier && { supplier }),
          ...(unitPrice !== '' && !isNaN(Number(unitPrice)) && { unit_price: Number(unitPrice) }),
          ...(expectedDate && {
            expected_date: `${toDateFieldValue(expectedDate)} 12:00:00.000Z`,
          }),
        }
      }

      await pb.collection('material_shortages').update(item.id, updateData)

      // 2. Se pertencer a um lote:
      // a) Membros de OP afetados recebem seus valores com auditoria
      // b) Membro de excedente (estoque) é atualizado com a nova quantidade de excedente
      // c) Todos os membros sincronizam fornecedor, preço e prazo
      const otherMembers = plan.itemsToUpdate.filter((it) => it.id !== item.id)
      for (const mate of otherMembers) {
        try {
          const mateShortage = allShortages.find((s) => s.id === mate.id)
          const mateOrigQty = mateShortage ? Number(mateShortage.quantity) || 0 : mate.previousQty
          let mateObs = mateShortage?.observation || ''

          if (mate.isChanged) {
            const mateAudit = `Qtde ajustada de ${mateOrigQty} para ${mate.newQty} na Compra por ${userName} em ${dateFormatted}`
            mateObs = mateObs ? `${mateObs} | ${mateAudit}` : mateAudit
          }

          const mateUpdatePayload: Record<string, any> = {
            supplier,
            ...(mate.isChanged && { quantity: mate.newQty, observation: mateObs }),
            ...(unitPrice !== '' && !isNaN(Number(unitPrice)) && { unit_price: Number(unitPrice) }),
            ...(expectedDate && {
              expected_date: `${toDateFieldValue(expectedDate)} 12:00:00.000Z`,
            }),
          }

          // Se for o parent do lote, sincroniza também o actual_quantity no batch_info
          if (mateShortage?.batch_info?.is_batch_parent) {
            mateUpdatePayload.batch_info = {
              ...mateShortage.batch_info,
              actual_quantity: plan.totalNewQuantity,
              surplus_quantity: plan.surplusQty,
              ...(supplier && { supplier }),
              ...(unitPrice !== '' &&
                !isNaN(Number(unitPrice)) && { unit_price: Number(unitPrice) }),
              ...(expectedDate && {
                expected_date: `${toDateFieldValue(expectedDate)} 12:00:00.000Z`,
              }),
            }
          }

          await pb.collection('material_shortages').update(mate.id, mateUpdatePayload)
        } catch (mErr) {
          console.warn('Erro ao atualizar membro do lote na compra:', mate.id, mErr)
        }
      }

      // Se havia irmãos que não estavam em itemsToUpdate (ex.: pelo batch_id), garante sincronização de fornecedor/preço/prazo
      const updatedIds = new Set(plan.itemsToUpdate.map((it) => it.id))
      const batchMates = (item.batch_info?.sub_shortage_ids || []).filter((id) => id !== item.id)
      const siblingIds =
        batchMates.length > 0
          ? batchMates
          : item.batch_id
            ? allShortages
                .filter((s) => s.batch_id === item.batch_id && s.id !== item.id)
                .map((s) => s.id)
            : []

      for (const sid of siblingIds) {
        if (updatedIds.has(sid)) continue
        try {
          await pb.collection('material_shortages').update(sid, {
            supplier,
            ...(unitPrice !== '' && !isNaN(Number(unitPrice)) && { unit_price: Number(unitPrice) }),
            ...(expectedDate && {
              expected_date: `${toDateFieldValue(expectedDate)} 12:00:00.000Z`,
            }),
          })
        } catch (sErr) {
          console.warn('Erro ao sincronizar fornecedor/preço com membro do lote:', sid, sErr)
        }
      }

      toast.success('Dados salvos com sucesso')
      onUpdate()
      onOpenChange(false)
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
      setPendingOpConfirmPlan(null)
      setOpConfirmOpen(false)
    }
  }

  const handleSave = async () => {
    if (!item) return

    const parsedQty = Number(quantityInput)
    const targetQty =
      !isNaN(parsedQty) && parsedQty >= 0
        ? parsedQty
        : itemQuantity >= 0
          ? itemQuantity
          : Number(item.quantity) || 0

    const plan = calculateBatchQuantityPlan({
      item,
      targetNewQuantity: targetQty,
      allShortages,
    })

    // Validação 1: Limite inferior (não pode ser menor que o já recebido)
    if (plan.isBelowReceived) {
      toast.error(
        plan.validationError ||
          `A quantidade não pode ficar menor que o já recebido (${plan.itemMinReceived} un).`,
      )
      return
    }

    // Validação 2: Limite superior (não exceder o que faz sentido para a demanda)
    if (plan.isAboveSensibleDemand) {
      toast.error(
        plan.validationError ||
          `A quantidade informada excede amplamente o que faz sentido para a demanda (${plan.totalOpDemand} un).`,
      )
      return
    }

    // Regra (1): Se a edição afetar um registro de OP específico, exigir confirmação explícita
    if (plan.needsOpConfirmation && plan.affectedOpMembers.length > 0) {
      setPendingOpConfirmPlan(plan)
      setOpConfirmOpen(true)
      return
    }

    await executeSave(plan)
  }

  const handleApplyConsolidatedTotal = async (suggestedQty: number) => {
    if (!item) return
    setQuantityInput(String(suggestedQty))
    setItemQuantity(suggestedQty)
    try {
      const origQty = Number(item.quantity) || 0
      let newObservation = item.observation || ''
      if (suggestedQty !== origQty) {
        const userName = user?.name || user?.email || 'Usuário'
        const dateFormatted = new Date().toLocaleString('pt-BR')
        const auditLog = `Qtde ajustada de ${origQty} para ${suggestedQty} na Compra por ${userName} em ${dateFormatted}`
        newObservation = newObservation ? `${newObservation} | ${auditLog}` : auditLog
      }

      await pb.collection('material_shortages').update(item.id, {
        quantity: suggestedQty,
        observation: newObservation,
      })
      toast.success(`Quantidade atualizada para ${suggestedQty} un (total consolidado)`)
      onUpdate()
    } catch {
      toast.error('Erro ao atualizar quantidade do item')
    }
  }

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  // Valor Total recalculado com base na quantidade e preço unitário vigentes
  const calculatedTotalValue = useMemo(() => {
    const p = Number(unitPrice) || 0
    return effectiveQuantity * p
  }, [effectiveQuantity, unitPrice])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Compra</DialogTitle>
          </DialogHeader>
          {item && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <NoTranslate as="span" className="font-medium text-foreground">
                  {item.description}
                </NoTranslate>
                {item.code && (
                  <span className="ml-2">
                    — Código: <NoTranslate as="span">{item.code}</NoTranslate>
                  </span>
                )}
                <span className="ml-2">
                  — Qtde: <NoTranslate as="span">{formatQuantity(effectiveQuantity)}</NoTranslate>
                </span>
                {item.expand?.order_id?.order_number && (
                  <span className="ml-2">
                    — Pedido:{' '}
                    <NoTranslate as="span">{item.expand.order_id.order_number}</NoTranslate>
                  </span>
                )}
                {item.expand?.order_id?.op_number && (
                  <span className="ml-2">
                    — OP: <NoTranslate as="span">{item.expand.order_id.op_number}</NoTranslate>
                  </span>
                )}
              </div>{' '}
              {/* Bloco de consolidação de demanda com outras OPs */}
              {consolidation && consolidation.otherDemands.length > 0 && (
                <ConsolidatedDemandBlock
                  consolidation={consolidation}
                  currentItemLabel={`Esta solicitação (${formatQuantity(effectiveQuantity)} un)`}
                  itemDescription={item.description}
                  itemCode={item.code}
                  onApplyTotal={handleApplyConsolidatedTotal}
                  applyButtonLabel="Sugerir e adotar total"
                />
              )}
              {/* Aviso quando o item pertence a um lote */}
              {isBatchMember && (
                <div className="flex items-start gap-2 p-3 text-xs rounded-md bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900/50">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div>
                      <strong>Atenção (Lote Consolidado):</strong> Este item pertence a um lote com{' '}
                      <strong>{batchResolution.opItems.length} OPs vinculadas</strong> (demanda de{' '}
                      {formatQuantity(batchResolution.totalOpDemand)} un)
                      {batchResolution.totalReceived > 0 && (
                        <span>
                          {' '}
                          · Já recebido: {formatQuantity(batchResolution.totalReceived)} un
                        </span>
                      )}
                      .
                    </div>
                    <div className="text-[11px] text-amber-800 dark:text-amber-300">
                      Editar a quantidade ajusta o total de compra do lote de forma coerente sem
                      inflar silenciosamente a demanda das OPs. Fornecedor, valor unitário e prazo
                      de entrega continuam sendo sincronizados com todos os membros do lote.
                    </div>
                  </div>
                </div>
              )}
              <div>
                <h4 className="text-sm font-semibold mb-2">Cotações Registradas</h4>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : quotations.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center border-2 border-dashed rounded-lg">
                    Nenhuma cotação registrada para este material.
                  </p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]"></TableHead>
                          <TableHead>Fornecedor</TableHead>
                          <TableHead className="text-right">Valor Unitário</TableHead>
                          <TableHead className="text-right">Prazo (dias)</TableHead>
                          <TableHead className="text-right">Valor Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {quotations.map((q) => {
                          const qRisk = checkQuotationDeliveryRisk({
                            deliveryDays: q.delivery_days,
                            mostUrgentOp,
                          })

                          return (
                            <TableRow
                              key={q.id}
                              className={cn(
                                'cursor-pointer transition-colors',
                                selectedQuotationId === q.id && 'bg-primary/5',
                              )}
                              onClick={() => handleSelectQuotation(q.id)}
                            >
                              <TableCell>
                                {selectedQuotationId === q.id && (
                                  <Check className="w-4 h-4 text-primary" />
                                )}
                              </TableCell>
                              <TableCell className="font-medium text-sm notranslate" translate="no">
                                <div className="space-y-1">
                                  <span>{q.supplier}</span>
                                  {qRisk.hasRisk && (
                                    <div>
                                      <QuotationDeadlineWarning
                                        checkResult={qRisk}
                                        compact={true}
                                      />
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-sm notranslate" translate="no">
                                {formatCurrency(q.price)}
                              </TableCell>
                              <TableCell className="text-right text-sm notranslate" translate="no">
                                <span
                                  className={cn(
                                    qRisk.hasRisk &&
                                      (qRisk.urgencyLevel === 'urgent'
                                        ? 'text-red-600 font-bold'
                                        : 'text-amber-600 font-semibold'),
                                  )}
                                >
                                  {q.delivery_days || '-'}
                                </span>
                              </TableCell>
                              <TableCell
                                className="text-right text-sm font-semibold notranslate"
                                translate="no"
                              >
                                {formatCurrency(q.price * (effectiveQuantity || 0))}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2 border-t">
                <div className="space-y-1 sm:col-span-1">
                  <Label className="text-xs">Fornecedor</Label>
                  <Popover open={supplierComboboxOpen} onOpenChange={setSupplierComboboxOpen}>
                    <PopoverTrigger asChild>
                      <div className="relative">
                        <Input
                          value={supplier}
                          onChange={(e) => {
                            handleSupplierChange(e.target.value)
                            setSupplierSearchQuery(e.target.value)
                            if (!supplierComboboxOpen) setSupplierComboboxOpen(true)
                          }}
                          onFocus={() => {
                            setSupplierSearchQuery('')
                            setSupplierComboboxOpen(true)
                          }}
                          placeholder="Selecione ou digite..."
                          className="notranslate pr-7"
                          translate="no"
                        />
                        <button
                          type="button"
                          aria-label="Abrir lista de fornecedores"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSupplierComboboxOpen((v) => !v)
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100"
                        >
                          <ChevronsUpDown className="w-4 h-4" />
                        </button>
                      </div>
                    </PopoverTrigger>
                    <PopoverContent
                      className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]"
                      align="start"
                    >
                      <Command
                        filter={(value, search) => {
                          if (!search) return 1
                          return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                        }}
                      >
                        <CommandInput
                          placeholder="Buscar fornecedor cadastrado..."
                          value={supplierSearchQuery}
                          onValueChange={setSupplierSearchQuery}
                        />
                        <CommandList className="max-h-56">
                          <CommandEmpty className="py-2.5 px-3 text-xs text-muted-foreground">
                            Nenhum fornecedor encontrado.
                          </CommandEmpty>
                          <CommandGroup heading="Fornecedores Cadastrados">
                            {registeredSuppliers.map((s) => {
                              const isSelected =
                                supplier.trim().toLowerCase() === s.name.trim().toLowerCase()
                              return (
                                <CommandItem
                                  key={s.id}
                                  value={s.name}
                                  onSelect={() => {
                                    handleSupplierChange(s.name)
                                    setSupplierComboboxOpen(false)
                                  }}
                                  className="cursor-pointer notranslate"
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4 text-primary shrink-0',
                                      isSelected ? 'opacity-100' : 'opacity-0',
                                    )}
                                  />
                                  <span className="truncate">{s.name}</span>
                                </CommandItem>
                              )
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  {/* Aviso discreto quando fornecedor digitado não está cadastrado */}
                  {!isSupplierRegistered && (
                    <div className="flex items-start gap-1.5 pt-1 text-[11px] text-amber-700 dark:text-amber-400 leading-tight">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      <span>
                        Fornecedor não cadastrado — considere cadastrá-lo em{' '}
                        <strong>Suprimentos &gt; Fornecedores</strong>.
                      </span>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantidade</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={quantityInput}
                    onChange={(e) => {
                      setQuantityInput(e.target.value)
                      const parsed = Number(e.target.value)
                      if (!isNaN(parsed) && parsed >= 0) {
                        setItemQuantity(parsed)
                      }
                    }}
                    className="notranslate"
                    translate="no"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor Unitário</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    className="notranslate"
                    translate="no"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Previsão de Entrega</Label>
                  <Input
                    type="date"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="notranslate"
                    translate="no"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Valor Total (Recalculado)</Label>
                  <div
                    className="h-9 px-3 py-2 rounded-md border bg-slate-50 dark:bg-slate-900/50 text-sm font-bold text-foreground flex items-center notranslate"
                    translate="no"
                  >
                    {formatCurrency(calculatedTotalValue)}
                  </div>
                </div>
              </div>
              {/* Aviso visual de limites em tempo real se o usuário digitar valor fora do permitido */}
              {quantityPlan?.isBelowReceived && (
                <div className="flex items-center gap-2 p-2.5 rounded text-xs bg-red-50 text-red-900 border border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900/50">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>
                    <strong>Aviso de Limite:</strong> {quantityPlan.validationError}
                  </span>
                </div>
              )}
              {quantityPlan?.isAboveSensibleDemand && !quantityPlan?.isBelowReceived && (
                <div className="flex items-center gap-2 p-2.5 rounded text-xs bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900/50">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Atenção de Demanda:</strong> {quantityPlan.validationError}
                  </span>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {onDeleteRequest && item && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onDeleteRequest(item)}
                disabled={saving}
                className="sm:mr-auto text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-900/40 dark:hover:bg-red-950/30"
              >
                <Trash2 className="w-4 h-4 mr-1 text-red-500" />
                Remover / Cancelar
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmação explícita quando a edição afeta uma OP específica */}
      <AlertDialog open={opConfirmOpen} onOpenChange={setOpConfirmOpen}>
        <AlertDialogContent className="sm:max-w-[480px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              Confirmação de alteração em OP
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm text-foreground">
              <p>
                Você está alterando a quantidade de uma falta vinculada diretamente a uma Ordem de
                Produção:
              </p>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 space-y-1.5 text-xs">
                {pendingOpConfirmPlan?.affectedOpMembers.map((affected) => (
                  <div key={affected.id} className="flex items-center justify-between font-medium">
                    <span className="notranslate" translate="no">
                      <strong>OP {affected.opLabel}:</strong>
                    </span>
                    <span>
                      quantidade vai de{' '}
                      <strong className="text-red-600 dark:text-red-400">
                        {formatQuantity(affected.oldQty)} un
                      </strong>{' '}
                      para{' '}
                      <strong className="text-emerald-700 dark:text-emerald-300">
                        {formatQuantity(affected.newQty)} un
                      </strong>
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                Esta alteração afeta a demanda oficial desta OP na programação e na separação.
                Deseja realmente prosseguir?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={saving}
              onClick={() => {
                setPendingOpConfirmPlan(null)
                setOpConfirmOpen(false)
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={() => {
                if (pendingOpConfirmPlan) {
                  executeSave(pendingOpConfirmPlan)
                }
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Confirmar Alteração
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
