import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { PcpOrder, PcpCostCategory, PcpOrderCost, PcpCostSettings } from '@/types'
import {
  CostLine,
  fetchAutomaticMaterialCosts,
  listOrderCosts,
  listOrderCostsByOrderNumber,
  createOrderCost,
  updateOrderCost,
  deleteOrderCost,
  getCostSettings,
  listCostCategories,
  summarizeCosts,
  fmtBRL,
  fmtPct,
} from '@/services/order-costs'
import { NewCostCategoryDialog } from './NewCostCategoryDialog'
import { DollarSign, Plus, Trash2, Pencil, Package, Layers, Info, Loader2 } from 'lucide-react'
import { NoTranslate } from '@/components/NoTranslate'

interface OrderLevelCostModalProps {
  /** order_number do pedido consolidado (ignorado no modo grupo) */
  orderNumber: string
  /** Quando preenchido, o modal opera no modo GRUPO de pedidos (Rentabilidade Especiais):
   *  grava linhas com order_group e order_id/order_number vazios. */
  orderGroup?: string
  /** Primeira OP do grupo (para cliente / produto no cabeçalho) */
  representativeOrder: PcpOrder
  /** Todas as OPs Especiais do pedido (ou do grupo) */
  orders: PcpOrder[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Chamado após qualquer mutação (o painel recalcula os totais) */
  onChanged?: () => void
  /** Chamado quando a janela abre (o painel recarrega custos de pedido) */
  onOpen?: () => void
}

/**
 * Custos no nível do PEDIDO (conjunto de OPs Especiais com o mesmo order_number):
 * - material automático consolidado das OPs (leitura);
 * - linhas manuais das OPs agrupadas por OP (leitura aqui; edição no modal da OP);
 * - linhas attachadas ao pedido (order_number, sem OP) com CRUD completo.
 */
export function OrderLevelCostsModal({
  orderNumber,
  orderGroup,
  representativeOrder,
  orders,
  open,
  onOpenChange,
  onChanged,
  onOpen,
}: OrderLevelCostModalProps) {
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [costSettings, setCostSettings] = useState<PcpCostSettings | null>(null)
  const [categoriesList, setCategoriesList] = useState<PcpCostCategory[]>([])
  const [automaticByOp, setAutomaticByOp] = useState<Record<string, CostLine[]>>({})
  const [manualByOp, setManualByOp] = useState<Record<string, PcpOrderCost[]>>({})
  const [orderLevelLines, setOrderLevelLines] = useState<PcpOrderCost[]>([])

  // Formulário de nova linha / edição (nível do pedido)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formCategory, setFormCategory] = useState<string>('Material')
  const [formCategoryId, setFormCategoryId] = useState<string>('')
  const [formDescription, setFormDescription] = useState('')
  const [formQuantity, setFormQuantity] = useState<string>('1')
  const [formUnitCost, setFormUnitCost] = useState<string>('')
  const [formTotal, setFormTotal] = useState<string>('')
  const [formDate, setFormDate] = useState<string>('')
  const [formNotes, setFormNotes] = useState<string>('')
  const [isSubmittingLine, setIsSubmittingLine] = useState(false)

  // Diálogo de nova categoria
  const [newCatDialogOpen, setNewCatDialogOpen] = useState(false)

  const loadData = useCallback(async () => {
    if (!open) return
    const isGroup = !!orderGroup
    if (!isGroup && !orderNumber) return
    setLoading(true)
    try {
      const [settings, cats, autoResults, manualResults, orderLines] = await Promise.all([
        getCostSettings(),
        listCostCategories(),
        Promise.all(orders.map((o) => fetchAutomaticMaterialCosts(o.id))),
        Promise.all(orders.map((o) => listOrderCosts(o.id))),
        isGroup ? listOrderCostsByOrderGroup(orderGroup) : listOrderCostsByOrderNumber(orderNumber),
      ])

      const auto: Record<string, CostLine[]> = {}
      autoResults.forEach((lines, i) => {
        auto[orders[i].id] = lines
      })
      const manual: Record<string, PcpOrderCost[]> = {}
      manualResults.forEach((lines, i) => {
        manual[orders[i].id] = lines
      })

      setCostSettings(settings)
      setCategoriesList(cats)
      setAutomaticByOp(auto)
      setManualByOp(manual)
      setOrderLevelLines(orderLines)

      const foundCat = cats.find((c) => c.name === 'Material')
      if (foundCat) {
        setFormCategoryId(foundCat.id)
      }
    } catch (err) {
      console.error('Erro ao carregar custos do pedido:', err)
      toast({
        title: 'Erro ao carregar custos',
        description: 'Não foi possível carregar os dados de custos deste pedido.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [open, orderNumber, orderGroup, orders, toast])

  useEffect(() => {
    if (open) {
      resetForm()
      loadData()
      onOpen?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderNumber, orderGroup])

  // Recálculo automático do total ao digitar quantidade/preço unitário
  const handleQuantityChange = (val: string) => {
    setFormQuantity(val)
    const q = parseFloat(val)
    const u = parseFloat(formUnitCost)
    if (!isNaN(q) && !isNaN(u)) setFormTotal((q * u).toFixed(2))
  }

  const handleUnitCostChange = (val: string) => {
    setFormUnitCost(val)
    const q = parseFloat(formQuantity)
    const u = parseFloat(val)
    if (!isNaN(q) && !isNaN(u)) setFormTotal((q * u).toFixed(2))
  }

  const handleTotalChange = (val: string) => {
    setFormTotal(val)
    const t = parseFloat(val)
    const q = parseFloat(formQuantity)
    if (!isNaN(t) && !isNaN(q) && q > 0) setFormUnitCost((t / q).toFixed(2))
  }

  const resetForm = () => {
    setEditingId(null)
    const matCat = categoriesList.find((c) => c.name === 'Material')
    setFormCategory('Material')
    setFormCategoryId(matCat ? matCat.id : '')
    setFormDescription('')
    setFormQuantity('1')
    setFormUnitCost('')
    setFormTotal('')
    setFormDate(new Date().toISOString().slice(0, 10))
    setFormNotes('')
  }

  const startEdit = (cost: PcpOrderCost) => {
    setEditingId(cost.id)
    const effectiveCategoryName = cost.expand?.category_id?.name || cost.category || 'Outros'
    setFormCategory(effectiveCategoryName)
    setFormCategoryId(cost.category_id || '')
    setFormDescription(cost.description || '')
    setFormQuantity(cost.quantity !== undefined ? String(cost.quantity) : '1')
    setFormUnitCost(cost.unit_cost !== undefined ? String(cost.unit_cost) : '')
    setFormTotal(cost.total !== undefined ? String(cost.total) : '')
    setFormDate(cost.date ? cost.date.slice(0, 10) : '')
    setFormNotes(cost.notes || '')
  }

  const handleSelectCategory = (catName: string) => {
    setFormCategory(catName)
    const found = categoriesList.find((c) => c.name === catName)
    setFormCategoryId(found ? found.id : '')
  }

  const handleCategoryCreated = (newCat: PcpCostCategory) => {
    setCategoriesList((prev) => {
      const exists = prev.some((c) => c.id === newCat.id)
      if (exists) return prev
      return [...prev, newCat].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    })
    setFormCategory(newCat.name)
    setFormCategoryId(newCat.id)
  }

  const handleSaveLine = async (e: React.FormEvent) => {
    e.preventDefault()
    const totalVal = parseFloat(formTotal)
    if (isNaN(totalVal) || totalVal < 0) {
      toast({
        title: 'Valor total inválido',
        description: 'Informe um valor total numérico positivo.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmittingLine(true)
    try {
      const qty = parseFloat(formQuantity) || 1
      const unit = parseFloat(formUnitCost) || (qty > 0 ? totalVal / qty : totalVal)

      let catId = formCategoryId
      if (!catId) {
        const match = categoriesList.find((c) => c.name === formCategory)
        if (match) catId = match.id
      }

      if (editingId) {
        const updated = await updateOrderCost(editingId, {
          category: formCategory,
          category_id: catId || undefined,
          description: formDescription,
          quantity: qty,
          unit_cost: unit,
          total: totalVal,
          date: formDate || undefined,
          notes: formNotes,
        })
        setOrderLevelLines((prev) => prev.map((c) => (c.id === editingId ? updated : c)))
        toast({ title: 'Linha de custo do pedido atualizada com sucesso!' })
      } else {
        const created = await createOrderCost({
          order_number: orderGroup ? '' : orderNumber,
          order_group: orderGroup || undefined,
          category: formCategory,
          category_id: catId || undefined,
          description: formDescription,
          quantity: qty,
          unit_cost: unit,
          total: totalVal,
          date: formDate || undefined,
          notes: formNotes,
        })
        setOrderLevelLines((prev) => [created, ...prev])
        toast({
          title: orderGroup
            ? 'Custo do grupo lançado com sucesso!'
            : 'Custo do pedido lançado com sucesso!',
        })
      }
      resetForm()
      onChanged?.()
    } catch (err) {
      console.error('Erro ao salvar custo do pedido:', err)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o lançamento de custo do pedido.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmittingLine(false)
    }
  }

  const handleDeleteLine = async (id: string) => {
    try {
      await deleteOrderCost(id)
      setOrderLevelLines((prev) => prev.filter((c) => c.id !== id))
      toast({ title: 'Custo do pedido excluído com sucesso.' })
      if (editingId === id) resetForm()
      onChanged?.()
    } catch (err) {
      console.error('Erro ao excluir custo do pedido:', err)
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível remover este item.',
        variant: 'destructive',
      })
    }
  }

  // Consolidado do pedido: material automático das OPs + manuais das OPs + linhas do pedido
  const summary = useMemo(() => {
    const allAuto = Object.values(automaticByOp).flat()
    const allOpManual = Object.values(manualByOp).flat()
    const toCostLine = (c: PcpOrderCost): CostLine => ({
      id: c.id,
      category: c.expand?.category_id?.name || c.category || 'Outros',
      categoryId: c.category_id,
      description: c.description || '',
      quantity: c.quantity ?? 1,
      unitCost: c.unit_cost ?? 0,
      total: c.total ?? 0,
      source: 'Manual',
      date: c.date,
      notes: c.notes,
    })

    return summarizeCosts({
      automaticMaterial: allAuto.reduce((acc, l) => acc + (l.total || 0), 0),
      manualLines: [...allOpManual, ...orderLevelLines].map(toCostLine),
      salePrice: orders.reduce((acc, o) => acc + (Number(o.sale_price) || 0), 0),
      overheadPercent: costSettings?.overhead_percent ?? 0,
    })
  }, [automaticByOp, manualByOp, orderLevelLines, orders, costSettings])

  const clientName =
    representativeOrder.client_name || representativeOrder.expand?.client_id?.name || 'Cliente'
  const opLabel = (o: PcpOrder) => `OP ${o.op_number || `#${o.id.slice(0, 5)}`}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b shrink-0 bg-slate-50/60 dark:bg-slate-900/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <DollarSign className="size-5 text-emerald-600" />
                  {orderGroup ? 'Custos do Grupo (consolidado)' : 'Custos do Pedido (consolidado)'}
                </DialogTitle>
                <Badge
                  variant="outline"
                  className="bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold"
                >
                  {orderGroup ? (
                    <NoTranslate>{orderGroup}</NoTranslate>
                  ) : (
                    <NoTranslate>Pedido {orderNumber}</NoTranslate>
                  )}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {orderGroup
                  ? `${clientName} — ${orders.length} OP${orders.length > 1 ? 's' : ''} neste grupo`
                  : `${clientName} — ${orders.length} OP${orders.length > 1 ? 's' : ''} Especial${
                      orders.length > 1 ? 'is' : ''
                    } neste pedido`}
              </DialogDescription>
            </div>

            <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-2 rounded-lg border shadow-sm">
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Receita do Pedido
                </span>
                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  {fmtBRL(summary.salePrice ?? 0)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Margem Líquida
                </span>
                <span
                  className={`text-sm font-bold ${
                    summary.netMarginPercent != null && summary.netMarginPercent < 10
                      ? 'text-red-600'
                      : 'text-emerald-600'
                  }`}
                >
                  {fmtPct(summary.netMarginPercent)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
            <Card className="p-2.5 bg-background shadow-xs border">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                Custo Direto
              </span>
              <span className="text-sm font-bold text-foreground">
                {fmtBRL(summary.directCost)}
              </span>
              <span className="text-[10px] text-muted-foreground block">Mat + M.O. + Outros</span>
            </Card>
            <Card className="p-2.5 bg-background shadow-xs border">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                Overhead ({summary.overheadPercent}%)
              </span>
              <span className="text-sm font-bold text-foreground">
                {fmtBRL(summary.overheadValue)}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                Custo Total: {fmtBRL(summary.fullCost)}
              </span>
            </Card>
            <Card className="p-2.5 bg-background shadow-xs border">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                Margem Bruta
              </span>
              <span
                className={`text-sm font-bold ${
                  summary.grossMarginPercent != null && summary.grossMarginPercent < 30
                    ? 'text-amber-600'
                    : 'text-foreground'
                }`}
              >
                {fmtPct(summary.grossMarginPercent)}
              </span>
              <span className="text-[10px] text-muted-foreground block">Sobre materiais</span>
            </Card>
            <Card className="p-2.5 bg-background shadow-xs border">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                Margem Líquida
              </span>
              <span
                className={`text-sm font-bold ${
                  summary.netMarginPercent != null && summary.netMarginPercent < 10
                    ? 'text-red-600'
                    : 'text-emerald-600'
                }`}
              >
                {fmtPct(summary.netMarginPercent)}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                {summary.netMarginValue != null ? fmtBRL(summary.netMarginValue) : 'Sem receita'}
              </span>
            </Card>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-sm">Carregando custos do pedido...</p>
            </div>
          ) : (
            <>
              {!summary.hasSalePrice && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900 rounded-lg text-xs">
                  <Info className="size-4 shrink-0" />
                  <span>
                    <strong>Nenhuma OP deste pedido tem valor de venda lançado.</strong> As margens
                    do pedido só serão computadas após lançar o valor de venda em uma das OPs (modal
                    "Custos da OP" no dropdown do painel).
                  </span>
                </div>
              )}

              {/* SEÇÃO 1: Material automático consolidado (leitura) */}
              <div className="space-y-2 border rounded-lg p-4 bg-slate-50/50 dark:bg-slate-900/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="size-4 text-blue-600" />
                    <h3 className="font-semibold text-sm">
                      Material Comprado Automático (consolidado do pedido)
                    </h3>
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-blue-50 text-blue-700 border-blue-200"
                    >
                      Automático
                    </Badge>
                  </div>
                  <span className="text-sm font-bold text-foreground">
                    Total: {fmtBRL(summary.automaticMaterial)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Soma dos recebimentos de material de todas as OPs do pedido, com preço unitário e
                  frete rateado proporcional. Somente leitura.
                </p>

                {Object.values(automaticByOp).flat().length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground bg-white dark:bg-slate-800 rounded border border-dashed">
                    Nenhum recebimento de material vinculado às OPs deste pedido foi registrado
                    ainda em Suprimentos.
                  </div>
                ) : (
                  <div className="border rounded-md bg-white dark:bg-slate-800 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead className="w-28">OP</TableHead>
                          <TableHead>Material / Descrição</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Custo Unit.</TableHead>
                          <TableHead className="text-right">Total c/ Frete</TableHead>
                          <TableHead>Data</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.map((o) => {
                          const lines = automaticByOp[o.id] || []
                          if (lines.length === 0) return null
                          return lines.map((line, idx) => (
                            <TableRow key={line.id} className="text-xs">
                              <TableCell className="text-muted-foreground">
                                {idx === 0 ? <NoTranslate>{opLabel(o)}</NoTranslate> : ''}
                              </TableCell>
                              <TableCell className="font-medium">
                                {line.description}
                                {line.notes && (
                                  <span className="block text-[10px] text-muted-foreground">
                                    {line.notes}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">{line.quantity}</TableCell>
                              <TableCell className="text-right">{fmtBRL(line.unitCost)}</TableCell>
                              <TableCell className="text-right font-bold text-foreground">
                                {fmtBRL(line.total)}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {line.date ? new Date(line.date).toLocaleDateString('pt-BR') : '—'}
                              </TableCell>
                            </TableRow>
                          ))
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* SEÇÃO 2: Lançamentos manuais das OPs, agrupados por OP (leitura) */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <div className="flex items-center gap-2">
                    <Layers className="size-4 text-purple-600" />
                    <h3 className="font-semibold text-sm">Lançamentos Manuais das OPs do Pedido</h3>
                    <Badge variant="outline" className="text-[10px]">
                      {Object.values(manualByOp).flat().length} registro(s)
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Edite cada linha no modal "Custos da OP" da OP de origem (dropdown do painel).
                  </span>
                </div>

                {Object.values(manualByOp).flat().length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground border border-dashed rounded-lg bg-slate-50/40 dark:bg-slate-900/30">
                    Nenhuma linha manual lançada nas OPs deste pedido.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orders.map((o) => {
                      const lines = manualByOp[o.id] || []
                      if (lines.length === 0) return null
                      return (
                        <div
                          key={o.id}
                          className="border rounded-md bg-white dark:bg-slate-800 overflow-hidden"
                        >
                          <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900 text-[11px] font-semibold text-muted-foreground">
                            <NoTranslate>{opLabel(o)}</NoTranslate>
                          </div>
                          <Table>
                            <TableBody>
                              {lines.map((c) => (
                                <TableRow key={c.id} className="text-xs">
                                  <TableCell>
                                    <Badge variant="outline" className="text-[10px] font-semibold">
                                      {c.category}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {c.description}
                                    {c.notes && (
                                      <span className="block text-[10px] text-muted-foreground">
                                        {c.notes}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">{c.quantity ?? 1}</TableCell>
                                  <TableCell className="text-right">
                                    {fmtBRL(c.unit_cost)}
                                  </TableCell>
                                  <TableCell className="text-right font-bold text-foreground">
                                    {fmtBRL(c.total)}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {c.date ? new Date(c.date).toLocaleDateString('pt-BR') : '—'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* SEÇÃO 3: Lançamentos DO PEDIDO (order_number, sem OP) — CRUD completo */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="size-4 text-emerald-600" />
                    <h3 className="font-semibold text-sm">
                      {orderGroup
                        ? 'Lançamentos do Grupo Inteiro'
                        : 'Lançamentos do Pedido Inteiro'}
                    </h3>
                    <Badge variant="outline" className="text-[10px]">
                      {orderLevelLines.length} registro(s)
                    </Badge>
                  </div>
                </div>

                {/* Formulário de Adicionar / Editar Linha (nível pedido) */}
                <form
                  onSubmit={handleSaveLine}
                  className="p-3.5 bg-slate-50 dark:bg-slate-900 border rounded-lg space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      {editingId ? (
                        <>
                          <Pencil className="size-3.5 text-amber-500" />
                          {orderGroup
                            ? 'Editando Lançamento do Grupo'
                            : 'Editando Lançamento do Pedido'}
                        </>
                      ) : (
                        <>
                          <Plus className="size-3.5 text-emerald-600" />
                          {orderGroup ? 'Novo Custo do Grupo' : 'Novo Custo do Pedido'}
                        </>
                      )}
                    </span>
                    {editingId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-muted-foreground"
                        onClick={resetForm}
                      >
                        Cancelar Edição
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                    <div className="lg:col-span-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <Label className="text-[11px] text-muted-foreground">Categoria</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-[10px] text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 gap-1"
                          onClick={() => setNewCatDialogOpen(true)}
                        >
                          <Plus className="size-2.5" />
                          Nova categoria
                        </Button>
                      </div>
                      <Select value={formCategory} onValueChange={handleSelectCategory}>
                        <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-800">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {categoriesList.map((cat) => (
                            <SelectItem key={cat.id} value={cat.name} className="text-xs">
                              {cat.name}
                            </SelectItem>
                          ))}
                          {formCategory && !categoriesList.some((c) => c.name === formCategory) && (
                            <SelectItem value={formCategory} className="text-xs">
                              {formCategory}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="lg:col-span-4">
                      <Label className="text-[11px] text-muted-foreground">Descrição</Label>
                      <Input
                        className="h-8 text-xs bg-white dark:bg-slate-800"
                        placeholder="Ex: Comissão do pedido, frete do conjunto, impostos da nota..."
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <Label className="text-[11px] text-muted-foreground">Qtd</Label>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 text-xs bg-white dark:bg-slate-800"
                        value={formQuantity}
                        onChange={(e) => handleQuantityChange(e.target.value)}
                      />
                    </div>

                    <div>
                      <Label className="text-[11px] text-muted-foreground">Unitário (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        className="h-8 text-xs bg-white dark:bg-slate-800"
                        value={formUnitCost}
                        onChange={(e) => handleUnitCostChange(e.target.value)}
                      />
                    </div>

                    <div>
                      <Label className="text-[11px] text-muted-foreground">Total (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        className="h-8 text-xs font-bold text-foreground bg-white dark:bg-slate-800"
                        value={formTotal}
                        onChange={(e) => handleTotalChange(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <Label className="text-[11px] text-muted-foreground">Data</Label>
                      <Input
                        type="date"
                        className="h-8 text-xs bg-white dark:bg-slate-800"
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <Label className="text-[11px] text-muted-foreground">Observações / NF</Label>
                      <Input
                        className="h-8 text-xs bg-white dark:bg-slate-800"
                        placeholder="NF, fornecedor, detalhe..."
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="submit"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      disabled={isSubmittingLine}
                    >
                      {isSubmittingLine && <Loader2 className="size-3.5 animate-spin" />}
                      {editingId ? 'Salvar Alteração' : 'Adicionar Lançamento'}
                    </Button>
                  </div>
                </form>

                {orderLevelLines.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-lg bg-slate-50/40 dark:bg-slate-900/30">
                    Nenhum lançamento no nível do pedido ainda. Use o formulário acima para lançar
                    comissão, frete ou impostos do conjunto inteiro — eles entram no consolidado do
                    pedido sem pertencer a nenhuma OP individual.
                  </div>
                ) : (
                  <div className="border rounded-md bg-white dark:bg-slate-800 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead>Categoria</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Unitário</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead className="w-20 text-center">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderLevelLines.map((c) => (
                          <TableRow key={c.id} className="text-xs">
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="text-[10px] font-semibold bg-slate-50 dark:bg-slate-900"
                              >
                                {c.expand?.category_id?.name || c.category || 'Outros'}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              {c.description}
                              {c.notes && (
                                <span className="block text-[10px] text-muted-foreground">
                                  {c.notes}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{c.quantity ?? 1}</TableCell>
                            <TableCell className="text-right">{fmtBRL(c.unit_cost)}</TableCell>
                            <TableCell className="text-right font-bold text-foreground">
                              {fmtBRL(c.total)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {c.date ? new Date(c.date).toLocaleDateString('pt-BR') : '—'}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 text-slate-500 hover:text-foreground"
                                  onClick={() => startEdit(c)}
                                >
                                  <Pencil className="size-3" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 text-red-500 hover:text-red-700"
                                  onClick={() => handleDeleteLine(c.id)}
                                >
                                  <Trash2 className="size-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>

      <NewCostCategoryDialog
        open={newCatDialogOpen}
        onOpenChange={setNewCatDialogOpen}
        onCategorySelected={handleCategoryCreated}
      />
    </Dialog>
  )
}
