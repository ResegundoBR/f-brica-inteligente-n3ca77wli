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
import { Card, CardContent } from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { PcpOrder, OrderCostCategory, PcpOrderCost, PcpCostSettings } from '@/types'
import {
  ORDER_COST_CATEGORIES,
  CostLine,
  fetchAutomaticMaterialCosts,
  listOrderCosts,
  createOrderCost,
  updateOrderCost,
  deleteOrderCost,
  getCostSettings,
  updateOrderFinancialData,
  summarizeCosts,
  fmtBRL,
  fmtPct,
} from '@/services/order-costs'
import {
  DollarSign,
  Plus,
  Trash2,
  Pencil,
  Wand2,
  Package,
  Layers,
  Percent,
  TrendingUp,
  AlertCircle,
  Check,
  X,
  Loader2,
  Info,
} from 'lucide-react'

interface PcpOrderCostsModalProps {
  order: PcpOrder | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onOrderUpdated?: (order: PcpOrder) => void
}

export function PcpOrderCostsModal({
  order,
  open,
  onOpenChange,
  onOrderUpdated,
}: PcpOrderCostsModalProps) {
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [costSettings, setCostSettings] = useState<PcpCostSettings | null>(null)
  const [automaticLines, setAutomaticLines] = useState<CostLine[]>([])
  const [manualList, setManualList] = useState<PcpOrderCost[]>([])

  // Edição rápida de receita / valor hora da OP
  const [salePriceInput, setSalePriceInput] = useState<string>('')
  const [laborHourRateInput, setLaborHourRateInput] = useState<string>('')
  const [isSavingFinancial, setIsSavingFinancial] = useState(false)

  // Formulário de nova linha / edição
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formCategory, setFormCategory] = useState<OrderCostCategory>('Material')
  const [formDescription, setFormDescription] = useState('')
  const [formQuantity, setFormQuantity] = useState<string>('1')
  const [formUnitCost, setFormUnitCost] = useState<string>('')
  const [formTotal, setFormTotal] = useState<string>('')
  const [formDate, setFormDate] = useState<string>('')
  const [formNotes, setFormNotes] = useState<string>('')
  const [isSubmittingLine, setIsSubmittingLine] = useState(false)

  // Carrega configurações, automáticos e manuais
  const loadData = useCallback(async () => {
    if (!order || !open) return
    setLoading(true)
    try {
      const [settings, autoCosts, manualCosts] = await Promise.all([
        getCostSettings(),
        fetchAutomaticMaterialCosts(order.id),
        listOrderCosts(order.id),
      ])
      setCostSettings(settings)
      setAutomaticLines(autoCosts)
      setManualList(manualCosts)
      setSalePriceInput(
        order.sale_price !== null && order.sale_price !== undefined ? String(order.sale_price) : '',
      )
      setLaborHourRateInput(
        order.labor_hour_rate !== null && order.labor_hour_rate !== undefined
          ? String(order.labor_hour_rate)
          : settings?.default_hour_rate
            ? String(settings.default_hour_rate)
            : '',
      )
    } catch (err) {
      console.error('Erro ao carregar custos da OP:', err)
      toast({
        title: 'Erro ao carregar custos',
        description: 'Não foi possível carregar os dados de custos desta OP.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [order, open, toast])

  useEffect(() => {
    if (open) {
      resetForm()
      loadData()
    }
  }, [open, loadData])

  // Recálculo automático do total ao digitar quantidade/preço unitário
  const handleQuantityChange = (val: string) => {
    setFormQuantity(val)
    const q = parseFloat(val)
    const u = parseFloat(formUnitCost)
    if (!isNaN(q) && !isNaN(u)) {
      setFormTotal((q * u).toFixed(2))
    }
  }

  const handleUnitCostChange = (val: string) => {
    setFormUnitCost(val)
    const q = parseFloat(formQuantity)
    const u = parseFloat(val)
    if (!isNaN(q) && !isNaN(u)) {
      setFormTotal((q * u).toFixed(2))
    }
  }

  const handleTotalChange = (val: string) => {
    setFormTotal(val)
    const t = parseFloat(val)
    const q = parseFloat(formQuantity)
    if (!isNaN(t) && !isNaN(q) && q > 0) {
      setFormUnitCost((t / q).toFixed(2))
    }
  }

  const resetForm = () => {
    setEditingId(null)
    setFormCategory('Material')
    setFormDescription('')
    setFormQuantity('1')
    setFormUnitCost('')
    setFormTotal('')
    setFormDate(new Date().toISOString().slice(0, 10))
    setFormNotes('')
  }

  // Prepara edição
  const startEdit = (cost: PcpOrderCost) => {
    setEditingId(cost.id)
    setFormCategory(cost.category)
    setFormDescription(cost.description || '')
    setFormQuantity(cost.quantity !== undefined ? String(cost.quantity) : '1')
    setFormUnitCost(cost.unit_cost !== undefined ? String(cost.unit_cost) : '')
    setFormTotal(cost.total !== undefined ? String(cost.total) : '')
    setFormDate(cost.date ? cost.date.slice(0, 10) : '')
    setFormNotes(cost.notes || '')
  }

  // Salvar linha (criação ou edição)
  const handleSaveLine = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!order) return
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

      if (editingId) {
        const updated = await updateOrderCost(editingId, {
          category: formCategory,
          description: formDescription,
          quantity: qty,
          unit_cost: unit,
          total: totalVal,
          date: formDate || undefined,
          notes: formNotes,
        })
        setManualList((prev) => prev.map((item) => (item.id === editingId ? updated : item)))
        toast({ title: 'Linha de custo atualizada com sucesso!' })
      } else {
        const created = await createOrderCost({
          order_id: order.id,
          category: formCategory,
          description: formDescription,
          quantity: qty,
          unit_cost: unit,
          total: totalVal,
          date: formDate || undefined,
          notes: formNotes,
        })
        setManualList((prev) => [created, ...prev])
        toast({ title: 'Custo lançado com sucesso!' })
      }
      resetForm()
    } catch (err) {
      console.error('Erro ao salvar custo:', err)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o lançamento de custo.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmittingLine(false)
    }
  }

  const handleDeleteLine = async (id: string) => {
    try {
      await deleteOrderCost(id)
      setManualList((prev) => prev.filter((item) => item.id !== id))
      toast({ title: 'Custo excluído com sucesso.' })
      if (editingId === id) resetForm()
    } catch (err) {
      console.error('Erro ao excluir custo:', err)
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível remover este item.',
        variant: 'destructive',
      })
    }
  }

  // Salvar Preço de Venda e Taxa de Mão de Obra
  const handleSaveFinancials = async () => {
    if (!order) return
    setIsSavingFinancial(true)
    try {
      const parsedSale = salePriceInput.trim() === '' ? null : parseFloat(salePriceInput)
      const parsedRate = laborHourRateInput.trim() === '' ? null : parseFloat(laborHourRateInput)

      await updateOrderFinancialData(order.id, {
        sale_price: parsedSale,
        labor_hour_rate: parsedRate,
      })

      const updatedOrder = {
        ...order,
        sale_price: parsedSale ?? undefined,
        labor_hour_rate: parsedRate ?? undefined,
      } as PcpOrder

      onOrderUpdated?.(updatedOrder)
      toast({ title: 'Dados financeiros atualizados!' })
    } catch (err) {
      console.error('Erro ao atualizar dados financeiros da OP:', err)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar os dados financeiros da OP.',
        variant: 'destructive',
      })
    } finally {
      setIsSavingFinancial(false)
    }
  }

  // Pré-preenchimentos inteligentes
  // 1. Mão de Obra dos processos estimados do outsourcing_data
  const handlePrefillLabor = () => {
    const rate = parseFloat(laborHourRateInput) || costSettings?.default_hour_rate || 50
    const od = order?.outsourcing_data
    const est = od?.estimates || (Array.isArray(od) ? od[0]?.estimates : null)
    let totalHours = 0
    let details: string[] = []

    if (est && typeof est === 'object') {
      for (const [proc, hours] of Object.entries(est)) {
        const h = Number(hours) || 0
        if (h > 0) {
          totalHours += h
          details.push(`${proc}: ${h}h`)
        }
      }
    }

    setFormCategory('Mão de Obra')
    setFormDescription(
      totalHours > 0
        ? `Mão de Obra estimada dos processos (${totalHours}h)`
        : 'Mão de Obra de fabricação',
    )
    setFormQuantity(totalHours > 0 ? String(totalHours) : '1')
    setFormUnitCost(String(rate))
    setFormTotal((totalHours > 0 ? totalHours * rate : rate).toFixed(2))
    setFormNotes(details.join(', '))
  }

  // 2. Terceirização dos serviços listados em outsourcing_data
  const handlePrefillOutsourcing = () => {
    const od = order?.outsourcing_data
    const items = Array.isArray(od) ? od : Array.isArray(od?.services) ? od.services : []

    if (items.length > 0) {
      const item = items[0]
      setFormCategory('Terceirização')
      setFormDescription(
        item.service
          ? `${item.service} (${item.supplier || 'Fornecedor'})`
          : 'Serviço Terceirizado',
      )
      setFormQuantity('1')
      setFormUnitCost(item.cost ? String(item.cost) : '')
      setFormTotal(item.cost ? String(item.cost) : '')
      setFormNotes(item.expected_date ? `Previsão: ${item.expected_date}` : '')
    } else {
      setFormCategory('Terceirização')
      setFormDescription('Serviço de Terceirização')
      setFormQuantity('1')
      setFormUnitCost('')
      setFormTotal('')
    }
  }

  // Cálculo consolidado de margens
  const summary = useMemo(() => {
    const autoMaterialTotal = automaticLines.reduce((acc, l) => acc + (l.total || 0), 0)
    const manualLines: CostLine[] = manualList.map((m) => ({
      id: m.id,
      category: m.category,
      description: m.description || '',
      quantity: m.quantity || 1,
      unitCost: m.unit_cost || 0,
      total: m.total || 0,
      source: 'Manual',
      date: m.date,
      notes: m.notes,
    }))

    const parsedSale = salePriceInput.trim() === '' ? null : parseFloat(salePriceInput)
    const overhead = costSettings?.overhead_percent ?? 0

    return summarizeCosts({
      automaticMaterial: autoMaterialTotal,
      manualLines,
      salePrice: parsedSale,
      overheadPercent: overhead,
    })
  }, [automaticLines, manualList, salePriceInput, costSettings])

  if (!order) return null

  // Só deve abrir para Especial (garantido por quem chama, mas verificamos aqui também)
  if (order.op_type !== 'Especial') return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b shrink-0 bg-slate-50/60 dark:bg-slate-900/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <DollarSign className="size-5 text-emerald-600" />
                  Custos e Rentabilidade da OP Especial
                </DialogTitle>
                <Badge
                  variant="outline"
                  className="bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold"
                >
                  OP {order.op_number || order.order_number}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {order.client_name || order.expand?.client_id?.name || 'Cliente sem nome'} —{' '}
                {order.manual_product_name || 'Produto Especial'} ({order.quantity} un)
              </DialogDescription>
            </div>

            {/* Cabeçalho com Valor de Venda Editável */}
            <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-2 rounded-lg border shadow-sm">
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Valor de Venda (R$)
                </span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  className="h-8 w-36 text-sm font-bold text-emerald-700 dark:text-emerald-400"
                  value={salePriceInput}
                  onChange={(e) => setSalePriceInput(e.target.value)}
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Taxa Hora M.O. (R$)
                </span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 60"
                  className="h-8 w-28 text-sm"
                  value={laborHourRateInput}
                  onChange={(e) => setLaborHourRateInput(e.target.value)}
                />
              </div>

              <Button
                size="sm"
                variant="outline"
                className="h-8 mt-auto text-xs gap-1 border-emerald-500 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                onClick={handleSaveFinancials}
                disabled={isSavingFinancial}
              >
                {isSavingFinancial ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Salvar
              </Button>
            </div>
          </div>

          {/* Cards de Métricas em Tempo Real */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 pt-3">
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
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Overhead
                </span>
                <span className="text-[10px] font-bold text-muted-foreground">
                  {summary.overheadPercent}%
                </span>
              </div>
              <span className="text-sm font-bold text-foreground">
                {fmtBRL(summary.overheadValue)}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                Custo Total: {fmtBRL(summary.fullCost)}
              </span>
            </Card>

            <Card className="p-2.5 bg-background shadow-xs border">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                Margem Contribuição
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-sm font-bold ${
                    summary.contributionMarginPercent != null &&
                    summary.contributionMarginPercent < 20
                      ? 'text-red-600'
                      : 'text-emerald-600'
                  }`}
                >
                  {fmtPct(summary.contributionMarginPercent)}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground block">
                {summary.contributionMarginValue != null
                  ? fmtBRL(summary.contributionMarginValue)
                  : 'Sem receita'}
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

            <Card className="p-2.5 bg-background shadow-xs border">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                Markup
              </span>
              <span className="text-sm font-bold text-foreground">
                {summary.markup != null ? `${summary.markup.toFixed(2)}x` : '—'}
              </span>
              <span className="text-[10px] text-muted-foreground block">Preço / Custo Direto</span>
            </Card>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-sm">Carregando custos da OP...</p>
            </div>
          ) : (
            <>
              {/* Alerta de ausência de preço de venda */}
              {!summary.hasSalePrice && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900 rounded-lg text-xs">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>
                    <strong>OP sem valor de venda lançado.</strong> As margens de contribuição,
                    bruta, líquida e markup só serão computadas após informar o valor de venda
                    acima.
                  </span>
                </div>
              )}

              {/* SEÇÃO 1: Material AUTOMÁTICO (somente leitura, derivado de Suprimentos) */}
              <div className="space-y-2 border rounded-lg p-4 bg-slate-50/50 dark:bg-slate-900/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="size-4 text-blue-600" />
                    <h3 className="font-semibold text-sm">
                      Material Comprado Automático (Suprimentos)
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
                  Alimentado automaticamente a partir das entradas de estoque vinculadas a esta OP
                  com preço unitário e frete rateado proporcional. Somente leitura.
                </p>

                {automaticLines.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground bg-white dark:bg-slate-800 rounded border border-dashed">
                    Nenhum recebimento de material vinculado a esta OP foi registrado ainda em
                    Suprimentos.
                  </div>
                ) : (
                  <div className="border rounded-md bg-white dark:bg-slate-800 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead>Material / Descrição</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Custo Unit.</TableHead>
                          <TableHead className="text-right">Total c/ Frete</TableHead>
                          <TableHead>Data</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {automaticLines.map((line) => (
                          <TableRow key={line.id} className="text-xs">
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
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* SEÇÃO 2: Lançamentos MANUAIS (Todas as categorias) */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <div className="flex items-center gap-2">
                    <Layers className="size-4 text-purple-600" />
                    <h3 className="font-semibold text-sm">Lançamentos Manuais de Custo</h3>
                    <Badge variant="outline" className="text-[10px]">
                      {manualList.length} registro(s)
                    </Badge>
                  </div>

                  {/* Botões de Pré-preenchimento Inteligente */}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5"
                      onClick={handlePrefillLabor}
                    >
                      <Wand2 className="size-3 text-purple-600" />
                      Puxar M.O. (Processos)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5"
                      onClick={handlePrefillOutsourcing}
                    >
                      <Wand2 className="size-3 text-blue-600" />
                      Puxar Terceirização
                    </Button>
                  </div>
                </div>

                {/* Formulário de Adicionar / Editar Linha */}
                <form
                  onSubmit={handleSaveLine}
                  className="p-3.5 bg-slate-50 dark:bg-slate-900 border rounded-lg space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      {editingId ? (
                        <>
                          <Pencil className="size-3.5 text-amber-500" />
                          Editando Lançamento
                        </>
                      ) : (
                        <>
                          <Plus className="size-3.5 text-emerald-600" />
                          Novo Lançamento de Custo
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
                    {/* Categoria */}
                    <div className="lg:col-span-2">
                      <Label className="text-[11px] text-muted-foreground">Categoria</Label>
                      <Select
                        value={formCategory}
                        onValueChange={(val) => setFormCategory(val as OrderCostCategory)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-800">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {ORDER_COST_CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat} className="text-xs">
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Descrição */}
                    <div className="lg:col-span-4">
                      <Label className="text-[11px] text-muted-foreground">Descrição</Label>
                      <Input
                        className="h-8 text-xs bg-white dark:bg-slate-800"
                        placeholder="Ex: Pintura eletrostática especial, frete urgente, corte laser..."
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        required
                      />
                    </div>

                    {/* Quantidade */}
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Qtd / Horas</Label>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 text-xs bg-white dark:bg-slate-800"
                        value={formQuantity}
                        onChange={(e) => handleQuantityChange(e.target.value)}
                      />
                    </div>

                    {/* Custo Unitário */}
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

                    {/* Total */}
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

                    {/* Data */}
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Data</Label>
                      <Input
                        type="date"
                        className="h-8 text-xs bg-white dark:bg-slate-800"
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                      />
                    </div>

                    {/* Observações */}
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

                {/* Tabela de Lançamentos Manuais */}
                {manualList.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-lg bg-slate-50/40 dark:bg-slate-900/30">
                    Nenhum lançamento manual cadastrado ainda. Use o formulário acima para lançar
                    Mão de Obra, Insumos, Impostos, Terceirização, etc.
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
                        {manualList.map((item) => (
                          <TableRow key={item.id} className="text-xs">
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] font-semibold">
                                {item.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              {item.description}
                              {item.notes && (
                                <span className="block text-[10px] text-muted-foreground">
                                  {item.notes}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{item.quantity ?? 1}</TableCell>
                            <TableCell className="text-right">{fmtBRL(item.unit_cost)}</TableCell>
                            <TableCell className="text-right font-bold text-foreground">
                              {fmtBRL(item.total)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {item.date ? new Date(item.date).toLocaleDateString('pt-BR') : '—'}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 text-slate-500 hover:text-foreground"
                                  onClick={() => startEdit(item)}
                                >
                                  <Pencil className="size-3" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 text-red-500 hover:text-red-700"
                                  onClick={() => handleDeleteLine(item.id)}
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
    </Dialog>
  )
}
