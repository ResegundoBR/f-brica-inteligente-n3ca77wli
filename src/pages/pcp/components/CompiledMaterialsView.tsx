import { useState, useMemo, useEffect } from 'react'
import { CompiledMaterialItem, formatQuantity } from '@/services/pcp-programacao'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  FileDown,
  Printer,
  Search,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Layers,
  Cylinder,
  Boxes,
  Send,
  ShoppingCart,
  Tags,
  Loader2,
  CheckSquare,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { PcpOrder, ComponentCategory } from '@/types'
import { getComponentCategories } from '@/services/component-categories'
import pb from '@/lib/pocketbase/client'
import { OpReadOnlyModal } from './OpReadOnlyModal'

interface CompiledMaterialsViewProps {
  selectedOrders: PcpOrder[]
  profileItems: CompiledMaterialItem[]
  otherItems: CompiledMaterialItem[]
  totals: {
    totalDistinctItems: number
    tubesDistinctCount: number
    othersDistinctCount: number
    coveredCount: number
    shortageCount: number
    noStockCount: number
  }
  isLoadingMaterials?: boolean
  onSendToSeparation?: () => void
}

export function CompiledMaterialsView({
  selectedOrders,
  profileItems,
  otherItems,
  totals,
  isLoadingMaterials,
  onSendToSeparation,
}: CompiledMaterialsViewProps) {
  const [filterText, setFilterText] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'shortage' | 'covered' | 'no_stock'>(
    'all',
  )
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
  const [availableCategories, setAvailableCategories] = useState<ComponentCategory[]>([])

  // Seleção múltipla para compra em lote
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(new Set())
  const [isConfirmBatchBuyOpen, setIsConfirmBatchBuyOpen] = useState(false)
  const [isSendingBatchBuy, setIsSendingBatchBuy] = useState(false)

  const [readOnlyModalOpen, setReadOnlyModalOpen] = useState(false)
  const [selectedOpForModal, setSelectedOpForModal] = useState<string | null>(null)
  const { toast } = useToast()

  // Carrega categorias cadastradas para os chips de filtro
  useEffect(() => {
    getComponentCategories({ includeInactive: false })
      .then((cats) => setAvailableCategories(cats))
      .catch(() => {})
  }, [])

  // Métricas de metros e quantidade por categoria (considerando itens consolidados profileItems + otherItems)
  const { categoryMetricsMap, allLinearMetersTotal } = useMemo(() => {
    const allItems = [...profileItems, ...otherItems]
    const map = new Map<string, { count: number; linearMeters: number }>()
    let totalMeters = 0

    allItems.forEach((item) => {
      const catKey = (item.categoryName || 'Outros').toLowerCase().trim()
      const existing = map.get(catKey) || { count: 0, linearMeters: 0 }
      existing.count += 1

      const isMt = (item.unit || '').toUpperCase() === 'MT'
      if (isMt) {
        const qty = Number(item.totalQuantity) || 0
        existing.linearMeters += qty
        totalMeters += qty
      }

      map.set(catKey, existing)
    })

    return { categoryMetricsMap: map, allLinearMetersTotal: totalMeters }
  }, [profileItems, otherItems])

  const handleOpenOpReadOnly = (opStr: string) => {
    setSelectedOpForModal(opStr)
    setReadOnlyModalOpen(true)
  }

  const filterItem = (item: CompiledMaterialItem) => {
    // Filtro por situação de estoque
    if (statusFilter === 'shortage' && item.status !== 'shortage') return false
    if (statusFilter === 'covered' && item.status !== 'covered') return false
    if (statusFilter === 'no_stock' && item.status !== 'no_stock_record') return false

    // Filtro por categoria (chip)
    if (categoryFilter !== 'ALL') {
      const itemCat = (item.categoryName || 'Outros').toLowerCase().trim()
      const targetCat = categoryFilter.toLowerCase().trim()
      if (itemCat !== targetCat) return false
    }

    // Filtro por texto
    if (!filterText.trim()) return true
    const q = filterText.toLowerCase().trim()
    return (
      (item.code || '').toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q) ||
      (item.categoryName || '').toLowerCase().includes(q)
    )
  }

  const filteredProfiles = useMemo(
    () => profileItems.filter(filterItem),
    [profileItems, filterText, statusFilter, categoryFilter],
  )

  const filteredOthers = useMemo(
    () => otherItems.filter(filterItem),
    [otherItems, filterText, statusFilter, categoryFilter],
  )

  // Itens atualmente visíveis em ambas as seções
  const allVisibleItems = useMemo(
    () => [...filteredProfiles, ...filteredOthers],
    [filteredProfiles, filteredOthers],
  )

  // Itens selecionados para envio em lote (se houver seleção explícita, usa eles; se nenhum selecionado, oferece todos os visíveis)
  const itemsToBuy = useMemo(() => {
    if (selectedItemKeys.size > 0) {
      return allVisibleItems.filter((it) => selectedItemKeys.has(it.key))
    }
    return allVisibleItems
  }, [allVisibleItems, selectedItemKeys])

  // Alternar seleção de todos os visíveis
  const toggleSelectAllVisible = () => {
    const visibleKeys = allVisibleItems.map((it) => it.key)
    const allSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedItemKeys.has(k))

    const next = new Set(selectedItemKeys)
    if (allSelected) {
      visibleKeys.forEach((k) => next.delete(k))
    } else {
      visibleKeys.forEach((k) => next.add(k))
    }
    setSelectedItemKeys(next)
  }

  const toggleSelectOne = (key: string) => {
    const next = new Set(selectedItemKeys)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    setSelectedItemKeys(next)
  }

  // Envio em Lote para Material Shortages
  const handleConfirmBatchBuy = async () => {
    if (itemsToBuy.length === 0) {
      toast({
        title: 'Nenhum item para enviar',
        description: 'Não há itens visíveis ou selecionados para enviar à compra.',
        variant: 'destructive',
      })
      setIsConfirmBatchBuyOpen(false)
      return
    }

    setIsSendingBatchBuy(true)
    let createdCount = 0

    try {
      for (const item of itemsToBuy) {
        // Quantidade: se estiver em falta, sugere a missingQuantity (ou totalQuantity se missing for 0)
        const qty =
          item.status === 'shortage' && item.missingQuantity > 0
            ? item.missingQuantity
            : item.totalQuantity

        const categoryLabel = item.categoryName || 'Outros'
        const opsLabel =
          item.orderNumbers.length > 0 ? item.orderNumbers.join(', ') : 'Compilado PCP'
        const observationText = `[Compilado PCP] Categoria: ${categoryLabel} | OPs de origem: ${opsLabel}`

        await pb.collection('material_shortages').create({
          code: item.code || '',
          description: item.description,
          quantity: qty,
          unit: item.unit || 'UN',
          sector: 'Suprimentos',
          status: 'Pendente',
          request_type: 'Materiais',
          priority: 'Média',
          observations: observationText,
        })
        createdCount++
      }

      toast({
        title: 'Itens enviados para Suprimentos/Compra com sucesso!',
        description: `${createdCount} registro(s) gravado(s) em material_shortages com setor Suprimentos e status Pendente.`,
      })

      setSelectedItemKeys(new Set())
      setIsConfirmBatchBuyOpen(false)
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar itens para compra',
        description: err.message || 'Ocorreu um erro ao gravar registros de compras.',
        variant: 'destructive',
      })
    } finally {
      setIsSendingBatchBuy(false)
    }
  }

  // --------------------------------------------------------------------------
  // EXPORTAR PLANILHA (CSV compatível com Excel / Google Sheets)
  // --------------------------------------------------------------------------
  const handleExportSpreadsheet = () => {
    if (profileItems.length === 0 && otherItems.length === 0) {
      toast({
        title: 'Nenhum item para exportar',
        description: 'Selecione ao menos uma OP com materiais para exportar.',
        variant: 'destructive',
      })
      return
    }

    const headers = [
      'Categoria',
      'Código',
      'Descrição',
      'Qtd Total Programada',
      'Unidade',
      'Saldo em Estoque',
      'Unidade Estoque',
      'Situação',
      'Falta / Comprar',
      'Sobra Estimada',
      'OPs Envolvidas',
      'Modo de Casamento',
    ]

    const formatRow = (item: CompiledMaterialItem, category: string) => {
      const codeEsc = `"${(item.code || '').replace(/"/g, '""')}"`
      const descEsc = `"${(item.description || '').replace(/"/g, '""')}"`
      const totalQty = String(item.totalQuantity).replace('.', ',')
      const totalQtyWithUnit = `"${formatQuantity(item.totalQuantity, item.unit)} ${item.unit}"`
      const unitEsc = `"${item.unit}"`
      const stockQty =
        item.stockQuantity !== null ? String(item.stockQuantity).replace('.', ',') : '-'
      const stockQtyWithUnit =
        item.stockQuantity !== null
          ? `"${formatQuantity(item.stockQuantity, item.stockUnit)} ${item.stockUnit}"`
          : '"-"'
      const stockUnitEsc = `"${item.stockUnit}"`

      let situacao = 'Sem Estoque Cadastrado'
      if (item.status === 'covered') situacao = 'Estoque Cobre'
      else if (item.status === 'shortage') situacao = 'Falta no Estoque'

      const falta =
        item.status === 'shortage' ? String(item.missingQuantity).replace('.', ',') : '0'
      const faltaWithUnit =
        item.status === 'shortage'
          ? `"${formatQuantity(item.missingQuantity, item.unit)} ${item.unit}"`
          : '"0"'
      const sobra = item.status === 'covered' ? String(item.surplusQuantity).replace('.', ',') : '0'
      const sobraWithUnit =
        item.status === 'covered'
          ? `"${formatQuantity(item.surplusQuantity, item.unit)} ${item.unit}"`
          : '"0"'
      const ops = `"${item.orderNumbers.join(', ')}"`
      const match = `"${item.matchMethod}"`

      return [
        `"${category}"`,
        codeEsc,
        descEsc,
        totalQtyWithUnit,
        unitEsc,
        stockQtyWithUnit,
        stockUnitEsc,
        `"${situacao}"`,
        faltaWithUnit,
        sobraWithUnit,
        ops,
        match,
      ].join(';')
    }

    const rows = [
      ...profileItems.map((it) => formatRow(it, 'TUBOS, BARRAS E PERFIS')),
      ...otherItems.map((it) => formatRow(it, 'DEMAIS COMPONENTES')),
    ]

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const dateStr = new Date().toISOString().slice(0, 10)
    link.href = url
    link.setAttribute('download', `compilado_materiais_programacao_pcp_${dateStr}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'Planilha exportada com sucesso!',
      description: 'Arquivo CSV gerado com o compilado consolidado para conferência no galpão.',
    })
  }

  // --------------------------------------------------------------------------
  // EXPORTAR PDF / IMPRIMIR (Layout limpo para prancheta no galpão)
  // --------------------------------------------------------------------------
  const handlePrintPdf = () => {
    if (profileItems.length === 0 && otherItems.length === 0) {
      toast({
        title: 'Nenhum item para imprimir',
        description: 'Selecione ao menos uma OP com materiais para exportar.',
        variant: 'destructive',
      })
      return
    }
    window.print()
  }

  return (
    <div className="space-y-6">
      {/* CABEÇALHO DO COMPILADO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-4 rounded-lg shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-blue-400" />
            <h2 className="text-xl font-bold">Compilado Consolidado de Materiais</h2>
            <Badge className="bg-blue-600 text-white font-mono">
              {selectedOrders.length} OP(s) Selecionada(s)
            </Badge>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Visualização consolidada apenas para leitura — nenhum dado das OPs ou do estoque é
            modificado.
          </p>
        </div>

        {/* BOTÕES DE EXPORTAÇÃO, COMPRA EM LOTE E ENVIAR PARA SEPARAÇÃO */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Botão de Enviar em Lote para Cotação/Compra */}
          <Button
            onClick={() => setIsConfirmBatchBuyOpen(true)}
            size="sm"
            disabled={allVisibleItems.length === 0}
            className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-sm"
            title="Enviar itens visíveis ou selecionados em lote para cotação/compra em Suprimentos"
          >
            <ShoppingCart className="size-4" />
            Comprar em Lote{' '}
            {selectedItemKeys.size > 0
              ? `(${selectedItemKeys.size})`
              : `(${allVisibleItems.length})`}
          </Button>

          {onSendToSeparation && (
            <Button
              onClick={onSendToSeparation}
              size="sm"
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md"
              title="Gravar rodada e enviar compilado para separação pelo Operador"
            >
              <Send className="size-4" />
              ENVIAR PARA SEPARAÇÃO
            </Button>
          )}

          <Button
            onClick={handleExportSpreadsheet}
            variant="secondary"
            size="sm"
            className="gap-2 bg-slate-700 hover:bg-slate-600 text-white border-none shadow"
            title="Exportar planilha (.csv) do compilado para conferência física no estoque"
          >
            <FileDown className="size-4" />
            Exportar Planilha
          </Button>

          <Button
            onClick={handlePrintPdf}
            variant="outline"
            size="sm"
            className="gap-2 bg-white text-slate-900 hover:bg-slate-100 border-slate-300 shadow"
            title="Imprimir ou salvar como PDF para conferência física no galpão"
          >
            <Printer className="size-4 text-slate-700" />
            Imprimir PDF
          </Button>
        </div>
      </div>

      {/* CARDS DE RESUMO DE MATERIAIS */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="p-3 bg-card">
          <div className="text-xs text-muted-foreground">Itens Distintos</div>
          <div className="text-2xl font-black text-foreground mt-0.5">
            {totals.totalDistinctItems}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">consolidado</div>
        </Card>

        <Card className="p-3 bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800">
          <div className="text-xs text-sky-800 dark:text-sky-300 font-medium flex items-center gap-1">
            <Cylinder className="size-3.5" />
            Tubos/Barras/Perfis
          </div>
          <div className="text-2xl font-black text-sky-700 dark:text-sky-400 mt-0.5">
            {totals.tubesDistinctCount}
          </div>
          <div className="text-[11px] text-sky-600 dark:text-sky-400 mt-0.5">metragem total</div>
        </Card>

        <Card className="p-3 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            <Boxes className="size-3.5" />
            Demais Componentes
          </div>
          <div className="text-2xl font-black text-foreground mt-0.5">
            {totals.othersDistinctCount}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">unidades/peças</div>
        </Card>

        <Card className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
          <div className="text-xs text-emerald-800 dark:text-emerald-300 font-medium flex items-center gap-1">
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            Estoque Cobre
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
            {totals.coveredCount}
          </div>
          <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400 mt-0.5">
            saldo suficiente
          </div>
        </Card>

        <Card className="p-3 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800">
          <div className="text-xs text-rose-800 dark:text-rose-300 font-medium flex items-center gap-1">
            <AlertTriangle className="size-3.5 text-rose-600" />
            Falta / Comprar
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-0.5">
            {totals.shortageCount}
          </div>
          <div className="text-[11px] text-rose-700/80 dark:text-rose-400 mt-0.5">
            requer compra/insumo
          </div>
        </Card>

        <Card className="p-3 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
          <div className="text-xs text-amber-800 dark:text-amber-300 font-medium flex items-center gap-1">
            <HelpCircle className="size-3.5 text-amber-600" />
            Sem Estoque Cad.
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-0.5">
            {totals.noStockCount}
          </div>
          <div className="text-[11px] text-amber-700/80 dark:text-amber-400 mt-0.5">
            confirmar físico
          </div>
        </Card>
      </div>

      {/* FILEIRA DE CHIPS DE FILTRO POR CATEGORIA NO TOPO COM TOTAL DE METROS */}
      <div className="bg-white dark:bg-slate-900 border rounded-lg p-3 space-y-2.5 shadow-sm">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <Tags className="size-3.5 text-indigo-600" />
              <span>Filtrar por Categoria:</span>
            </div>
            {/* Total Geral de Metros do Compilado */}
            {allLinearMetersTotal > 0 && (
              <Badge
                variant="secondary"
                className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 text-xs font-mono font-bold px-2 py-0.5 gap-1"
                title="Total geral de metros somando todos os itens em MT do compilado"
              >
                <span>Total Geral:</span>
                <span>{formatQuantity(allLinearMetersTotal, 'MT')} MT</span>
              </Badge>
            )}
          </div>

          {categoryFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setCategoryFilter('ALL')}
              className="text-[11px] text-blue-600 hover:underline font-medium"
            >
              Limpar filtro de categoria
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Chip 'Todas' */}
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
              categoryFilter === 'ALL'
                ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400/40'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <span>Todas</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                categoryFilter === 'ALL'
                  ? 'bg-indigo-800 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              {totals.totalDistinctItems}
            </span>
            {allLinearMetersTotal > 0 && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                  categoryFilter === 'ALL'
                    ? 'bg-indigo-700/80 text-white'
                    : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60'
                }`}
              >
                {formatQuantity(allLinearMetersTotal, 'MT')} MT
              </span>
            )}
          </button>

          {/* Chips para cada categoria existente */}
          {(availableCategories.length > 0
            ? availableCategories
            : [
                { id: '1', name: 'Usinagem' },
                { id: '2', name: 'Corte a Laser' },
                { id: '3', name: 'Borracha' },
                { id: '4', name: 'Cabos' },
                { id: '5', name: 'Repuxos' },
                { id: '6', name: 'Pedras' },
                { id: '7', name: 'Ferragens' },
                { id: '8', name: 'Estrutura/Solda' },
                { id: '9', name: 'Pintura' },
                { id: '10', name: 'Elétrica' },
                { id: '11', name: 'Outros' },
              ]
          ).map((cat) => {
            const isSelected = categoryFilter.toLowerCase() === cat.name.toLowerCase()
            const metrics = categoryMetricsMap.get(cat.name.toLowerCase()) || {
              count: 0,
              linearMeters: 0,
            }

            // Omitir categorias sem itens para deixar a barra limpa e objetiva
            if (metrics.count === 0) return null

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(isSelected ? 'ALL' : cat.name)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400/50'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <span>{cat.name}</span>

                {/* Exibe total consolidado em MT se houver itens lineares */}
                {metrics.linearMeters > 0 ? (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                      isSelected
                        ? 'bg-indigo-800 text-white'
                        : 'bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800'
                    }`}
                  >
                    {formatQuantity(metrics.linearMeters, 'MT')} MT
                  </span>
                ) : (
                  <span
                    className={`text-[10px] px-1 rounded-full ${
                      isSelected
                        ? 'bg-indigo-800 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {metrics.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* FILTRO RÁPIDO DO COMPILADO */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-muted/40 p-3 rounded-lg border">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filtrar compilado por código, descrição ou categoria..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="pl-8 text-xs h-9 bg-background"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            variant={statusFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('all')}
            className="text-xs h-8"
          >
            Todos ({totals.totalDistinctItems})
          </Button>
          <Button
            variant={statusFilter === 'shortage' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('shortage')}
            className="text-xs h-8 text-rose-600 border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            Falta ({totals.shortageCount})
          </Button>
          <Button
            variant={statusFilter === 'covered' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('covered')}
            className="text-xs h-8 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          >
            Coberto ({totals.coveredCount})
          </Button>
          <Button
            variant={statusFilter === 'no_stock' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('no_stock')}
            className="text-xs h-8 text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
          >
            Sem Estoque Cad. ({totals.noStockCount})
          </Button>
        </div>
      </div>

      {/* BARRA DE AÇÃO QUANDO ITENS ESTÃO SELECIONADOS */}
      {selectedItemKeys.size > 0 && (
        <div className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 rounded-lg flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckSquare className="size-4 text-amber-600" />
            <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              {selectedItemKeys.size} item(ns) selecionado(s) manualmente
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedItemKeys(new Set())}
              className="text-[11px] h-6 px-1.5 text-muted-foreground hover:text-foreground"
            >
              Limpar seleção
            </Button>
          </div>

          <Button
            size="sm"
            onClick={() => setIsConfirmBatchBuyOpen(true)}
            className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
          >
            <ShoppingCart className="size-3.5" />
            Enviar {selectedItemKeys.size} item(ns) para Compra
          </Button>
        </div>
      )}

      {/* SEÇÃO 1: TUBOS, BARRAS E PERFIS (DESTAQUE NO TOPO) */}
      <Card className="border-2 border-sky-300 dark:border-sky-800 shadow-sm overflow-hidden">
        <CardHeader className="bg-sky-50 dark:bg-sky-950/40 border-b border-sky-200 dark:border-sky-800 py-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-md bg-sky-600 text-white">
                <Cylinder className="size-4" />
              </span>
              <div>
                <CardTitle className="text-base font-bold text-sky-950 dark:text-sky-100 flex items-center gap-2">
                  Tubos, Barras e Chapas de Perfil
                  <Badge
                    variant="outline"
                    className="border-sky-400 text-sky-700 dark:text-sky-300"
                  >
                    {filteredProfiles.length} item(ns)
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-sky-800 dark:text-sky-300">
                  Totalização linear e peças com comparação direta do saldo em estoque.
                </CardDescription>
              </div>
            </div>{' '}
            <div className="text-xs font-semibold text-sky-900 dark:text-sky-200">
              Total programado:{' '}
              <span className="font-mono text-sm underline">
                {formatQuantity(filteredProfiles.reduce((acc, p) => acc + p.totalQuantity, 0))}{' '}
                {filteredProfiles.length > 0 &&
                filteredProfiles.every((p) => p.unit === filteredProfiles[0].unit)
                  ? filteredProfiles[0].unit
                  : 'itens'}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-sky-100/60 dark:bg-sky-950/60 text-xs">
              <TableRow>
                <TableHead className="w-[40px] text-center">
                  <Checkbox
                    checked={
                      filteredProfiles.length > 0 &&
                      filteredProfiles.every((it) => selectedItemKeys.has(it.key))
                    }
                    onCheckedChange={toggleSelectAllVisible}
                    aria-label="Selecionar todos os tubos"
                  />
                </TableHead>
                <TableHead className="w-[110px]">Código</TableHead>
                <TableHead>Descrição do Material</TableHead>
                <TableHead className="w-[120px]">Categoria</TableHead>
                <TableHead className="w-[130px] text-right font-semibold text-slate-900 dark:text-slate-100">
                  Total Programado
                </TableHead>
                <TableHead className="w-[120px] text-right">Saldo Estoque</TableHead>
                <TableHead className="w-[150px] text-center font-bold">Falta / Comprar</TableHead>
                <TableHead className="w-[180px] text-left">OPs que utilizam</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingMaterials ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Carregando materiais das OPs selecionadas...
                  </TableCell>
                </TableRow>
              ) : filteredProfiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-muted-foreground text-xs">
                    Nenhum tubo, barra ou perfil encontrado nas OPs selecionadas com os filtros
                    atuais.
                  </TableCell>
                </TableRow>
              ) : (
                filteredProfiles.map((item) => (
                  <MaterialRow
                    key={item.key}
                    item={item}
                    isTube
                    isSelected={selectedItemKeys.has(item.key)}
                    onToggleSelect={() => toggleSelectOne(item.key)}
                    onOpClick={handleOpenOpReadOnly}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* SEÇÃO 2: DEMAIS COMPONENTES */}
      <Card className="border shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/40 border-b py-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-md bg-slate-700 text-white">
                <Boxes className="size-4" />
              </span>
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  Demais Componentes e Insumos
                  <Badge variant="outline">{filteredOthers.length} item(ns)</Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Vidros, parafusos, buchas, soquetes, chicotes, conexões e outros itens do produto.
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-100/60 dark:bg-slate-800/50 text-xs">
              <TableRow>
                <TableHead className="w-[40px] text-center">
                  <Checkbox
                    checked={
                      filteredOthers.length > 0 &&
                      filteredOthers.every((it) => selectedItemKeys.has(it.key))
                    }
                    onCheckedChange={toggleSelectAllVisible}
                    aria-label="Selecionar todos os demais"
                  />
                </TableHead>
                <TableHead className="w-[110px]">Código</TableHead>
                <TableHead>Descrição do Material</TableHead>
                <TableHead className="w-[120px]">Categoria</TableHead>
                <TableHead className="w-[130px] text-right font-semibold text-slate-900 dark:text-slate-100">
                  Total Programado
                </TableHead>
                <TableHead className="w-[120px] text-right">Saldo Estoque</TableHead>
                <TableHead className="w-[150px] text-center font-bold">Falta / Comprar</TableHead>
                <TableHead className="w-[180px] text-left">OPs que utilizam</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingMaterials ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Carregando materiais das OPs selecionadas...
                  </TableCell>
                </TableRow>
              ) : filteredOthers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-muted-foreground text-xs">
                    Nenhum outro componente encontrado nas OPs selecionadas com os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                filteredOthers.map((item) => (
                  <MaterialRow
                    key={item.key}
                    item={item}
                    isSelected={selectedItemKeys.has(item.key)}
                    onToggleSelect={() => toggleSelectOne(item.key)}
                    onOpClick={handleOpenOpReadOnly}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* MODAL DE CONFIRMAÇÃO DE COMPRA EM LOTE */}
      <Dialog open={isConfirmBatchBuyOpen} onOpenChange={setIsConfirmBatchBuyOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <ShoppingCart className="size-5" />
              Confirmar Envio para Cotação / Compra
            </DialogTitle>
            <DialogDescription className="text-xs">
              Os itens serão gravados em Suprimentos (coleção <code>material_shortages</code>) com
              status <strong>Pendente</strong>, setor <strong>Suprimentos</strong> e observações com
              a categoria e as OPs de origem.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 rounded-md">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                Você está prestes a enviar{' '}
                <span className="text-sm font-bold underline">{itemsToBuy.length}</span> item(ns)
                {selectedItemKeys.size > 0 ? ' selecionado(s)' : ' da listagem filtrada'}.
              </p>
              <p className="text-amber-800 dark:text-amber-300 mt-1">
                {categoryFilter !== 'ALL' && (
                  <span>
                    Filtro de categoria ativo: <strong>{categoryFilter}</strong>.
                  </span>
                )}
              </p>
            </div>

            <div className="max-h-[200px] overflow-y-auto border rounded-md p-2 bg-slate-50 dark:bg-slate-900/50 space-y-1">
              {itemsToBuy.slice(0, 15).map((it) => (
                <div
                  key={it.key}
                  className="flex justify-between items-center text-[11px] py-1 border-b last:border-b-0"
                >
                  <div className="truncate mr-2">
                    <span className="font-mono font-bold text-primary mr-1">
                      {it.code || 'S/Cód'}
                    </span>
                    <span className="font-medium">{it.description}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                    {formatQuantity(
                      it.status === 'shortage' && it.missingQuantity > 0
                        ? it.missingQuantity
                        : it.totalQuantity,
                      it.unit,
                    )}{' '}
                    {it.unit}
                  </Badge>
                </div>
              ))}
              {itemsToBuy.length > 15 && (
                <p className="text-[10px] text-muted-foreground text-center pt-1 italic">
                  ... e mais {itemsToBuy.length - 15} outro(s) item(ns).
                </p>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              ⚠️ Nada é gravado sem este clique explícito. Deseja prosseguir com o envio?
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmBatchBuyOpen(false)}
              disabled={isSendingBatchBuy}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmBatchBuy}
              disabled={isSendingBatchBuy || itemsToBuy.length === 0}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            >
              {isSendingBatchBuy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ShoppingCart className="size-3.5" />
              )}
              Confirmar Envio ({itemsToBuy.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL SOMENTE LEITURA DA OP */}
      <OpReadOnlyModal
        open={readOnlyModalOpen}
        onOpenChange={setReadOnlyModalOpen}
        opIdentifier={selectedOpForModal}
        existingOrders={selectedOrders}
      />

      {/* ÁREA DE IMPRESSÃO (EXIBIDA SOMENTE AO IMPRIMIR / GERAR PDF VIA PRINT) */}
      <PrintableView
        selectedOrders={selectedOrders}
        profileItems={profileItems}
        otherItems={otherItems}
        totals={totals}
      />
    </div>
  )
}

function MaterialRow({
  item,
  isTube,
  isSelected,
  onToggleSelect,
  onOpClick,
}: {
  item: CompiledMaterialItem
  isTube?: boolean
  isSelected?: boolean
  onToggleSelect?: () => void
  onOpClick?: (opNumber: string) => void
}) {
  const code = item.code || '-'
  const unit = item.unit || (isTube ? 'MT' : 'UN')
  const categoryLabel = item.categoryName || 'Outros'

  return (
    <TableRow
      className={`text-xs transition-colors ${
        isSelected ? 'bg-amber-50/60 dark:bg-amber-950/20' : 'hover:bg-muted/40'
      }`}
    >
      {/* Checkbox de seleção */}
      <TableCell className="text-center">
        <Checkbox
          checked={!!isSelected}
          onCheckedChange={onToggleSelect}
          aria-label={`Selecionar ${item.description}`}
        />
      </TableCell>

      {/* Código */}
      <TableCell className="font-mono font-medium">
        {code !== '-' ? (
          <span className="text-blue-600 dark:text-blue-400 font-semibold">{code}</span>
        ) : (
          <span className="text-muted-foreground italic">Sem cód</span>
        )}
      </TableCell>

      {/* Descrição */}
      <TableCell>
        <div className="flex flex-col">
          <span className="font-semibold text-slate-900 dark:text-slate-100 leading-snug">
            {item.description}
          </span>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
            {item.matchMethod === 'code' && (
              <span className="text-emerald-700 dark:text-emerald-400">✓ Vínculo por código</span>
            )}
            {item.matchMethod === 'code_desc' && (
              <span className="text-blue-700 dark:text-blue-400">✓ Vínculo código + descrição</span>
            )}
            {item.matchMethod === 'desc_only' && (
              <span className="text-slate-600 dark:text-slate-400">✓ Vínculo por descrição</span>
            )}
            {item.matchMethod === 'none' && (
              <span className="text-amber-700 dark:text-amber-400">
                ⚠ Não vinculado ao cadastro de estoque
              </span>
            )}
          </div>
        </div>
      </TableCell>

      {/* Categoria */}
      <TableCell>
        <div className="inline-flex items-center gap-1">
          <Badge
            variant="secondary"
            className="text-[10px] font-normal bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800"
          >
            {categoryLabel}
          </Badge>
        </div>
      </TableCell>

      {/* Total Programado */}
      <TableCell className="text-right font-mono font-bold text-sm">
        {formatQuantity(item.totalQuantity, unit)}{' '}
        <span className="text-xs font-normal text-muted-foreground">{unit}</span>
      </TableCell>

      {/* Saldo Estoque */}
      <TableCell className="text-right font-mono">
        {item.hasInventoryRecord && item.stockQuantity !== null ? (
          <span className="font-semibold">
            {formatQuantity(item.stockQuantity, item.stockUnit)}{' '}
            <span className="text-xs text-muted-foreground">{item.stockUnit}</span>
          </span>
        ) : (
          <span className="text-muted-foreground italic">-</span>
        )}
      </TableCell>

      {/* Falta / Comprar (Verde se cobre, Vermelho se falta, Amarelo se sem estoque cadastrado) */}
      <TableCell className="text-center">
        {item.status === 'covered' ? (
          <div className="inline-flex flex-col items-center">
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 font-semibold gap-1 py-0.5 px-2">
              <CheckCircle2 className="size-3 text-emerald-600" />
              Estoque cobre
            </Badge>
            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">
              Sobra: +{formatQuantity(item.surplusQuantity, unit)} {unit}
            </span>
          </div>
        ) : item.status === 'shortage' ? (
          <div className="inline-flex flex-col items-center">
            <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300 font-bold gap-1 py-0.5 px-2">
              <AlertTriangle className="size-3 text-rose-600" />
              Falta: {formatQuantity(item.missingQuantity, unit)} {unit}
            </Badge>
            <span className="text-[10px] text-rose-700 dark:text-rose-400 font-medium mt-0.5">
              Necessário comprar
            </span>
          </div>
        ) : (
          <div className="inline-flex flex-col items-center">
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-300 font-medium text-[11px] py-0.5"
            >
              sem estoque — confirmar fisicamente
            </Badge>
          </div>
        )}
      </TableCell>

      {/* OPs Envolvidas */}
      <TableCell className="text-left text-[11px]">
        <div className="flex flex-wrap gap-1 max-w-[220px]">
          {item.orderNumbers.map((num, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onOpClick?.(num)}
              title="Ver detalhes da OP em modo leitura"
              className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-blue-950/70 text-slate-800 hover:text-blue-700 dark:text-slate-200 dark:hover:text-blue-300 font-mono text-[10px] font-semibold border border-transparent hover:border-blue-300 dark:hover:border-blue-800 cursor-pointer transition-colors"
            >
              {num}
            </button>
          ))}
        </div>
      </TableCell>
    </TableRow>
  )
}

/**
 * Visualização formatada especificamente para impressão em papel / exportar como PDF do navegador
 */
function PrintableView({
  selectedOrders,
  profileItems,
  otherItems,
  totals,
}: {
  selectedOrders: PcpOrder[]
  profileItems: CompiledMaterialItem[]
  otherItems: CompiledMaterialItem[]
  totals: any
}) {
  const currentDate = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="hidden print:block print:fixed print:inset-0 print:bg-white print:text-black print:p-6 print:z-[9999] overflow-y-auto">
      <div className="border-b-2 border-black pb-4 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight">
              Fábrica Inteligente — Programação de Produção (PCP)
            </h1>
            <h2 className="text-lg font-semibold text-gray-800 mt-1">
              Compilado Consolidado de Matérias-Primas para Conferência Física
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              Emitido em: {currentDate} | Gestor responsável: Reginaldo Segundo
            </p>
          </div>
          <div className="text-right border border-black p-2 rounded text-xs">
            <div className="font-bold text-sm">{selectedOrders.length} OP(s) PROGRAMADAS</div>
            <div className="text-[10px] text-gray-700">
              Total itens: {totals.totalDistinctItems}
            </div>
            <div className="text-[10px] text-red-600 font-bold">
              Faltantes: {totals.shortageCount}
            </div>
          </div>
        </div>

        {/* Resumo das OPs selecionadas */}
        <div className="mt-3 text-xs bg-gray-100 p-2 rounded">
          <span className="font-bold">OPs incluídas nesta programação: </span>
          {selectedOrders.map((o) => o.op_number || o.order_number).join(' • ')}
        </div>
      </div>

      {/* SEÇÃO TUBOS / BARRAS / PERFIS */}
      {profileItems.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold uppercase bg-gray-200 p-1.5 border border-black border-b-0">
            1. Tubos, Barras e Chapas de Perfil
          </h3>
          <table className="w-full text-xs border border-black border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-black">
                <th className="border-r border-black p-1 text-left w-20">CÓDIGO</th>
                <th className="border-r border-black p-1 text-left">DESCRIÇÃO DO ITEM</th>
                <th className="border-r border-black p-1 text-right w-24">TOTAL PROGRAMADO</th>
                <th className="border-r border-black p-1 text-right w-24">SALDO ESTOQUE</th>
                <th className="border-r border-black p-1 text-center w-36">SITUAÇÃO / FALTA</th>
                <th className="border-r border-black p-1 text-left w-28">OPS</th>
                <th className="p-1 text-center w-24">CONF. FÍSICA [ ✓ ]</th>
              </tr>
            </thead>
            <tbody>
              {profileItems.map((item, idx) => (
                <tr
                  key={idx}
                  className={`border-b border-gray-400 ${
                    item.status === 'shortage' ? 'bg-red-50' : ''
                  }`}
                >
                  <td className="border-r border-black p-1 font-mono font-bold">
                    {item.code || '-'}
                  </td>
                  <td className="border-r border-black p-1 font-semibold">{item.description}</td>
                  <td className="border-r border-black p-1 text-right font-mono font-bold">
                    {formatQuantity(item.totalQuantity, item.unit)} {item.unit}
                  </td>
                  <td className="border-r border-black p-1 text-right font-mono">
                    {item.hasInventoryRecord && item.stockQuantity !== null
                      ? `${formatQuantity(item.stockQuantity, item.stockUnit)} ${item.stockUnit}`
                      : '-'}
                  </td>
                  <td className="border-r border-black p-1 text-center font-bold">
                    {item.status === 'covered' && (
                      <span className="text-green-700">
                        COBRE (+{formatQuantity(item.surplusQuantity, item.unit)} {item.unit})
                      </span>
                    )}
                    {item.status === 'shortage' && (
                      <span className="text-red-700">
                        FALTA: {formatQuantity(item.missingQuantity, item.unit)} {item.unit}
                      </span>
                    )}
                    {item.status === 'no_stock_record' && (
                      <span className="text-gray-600 font-normal">S/ CAD. — CONFIRMAR</span>
                    )}
                  </td>
                  <td className="border-r border-black p-1 text-[10px]">
                    {item.orderNumbers.join(', ')}
                  </td>
                  <td className="p-1 text-center border-black">
                    <span className="inline-block w-4 h-4 border border-black"></span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* SEÇÃO DEMAIS COMPONENTES */}
      {otherItems.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold uppercase bg-gray-200 p-1.5 border border-black border-b-0">
            2. Demais Componentes e Insumos
          </h3>
          <table className="w-full text-xs border border-black border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-black">
                <th className="border-r border-black p-1 text-left w-20">CÓDIGO</th>
                <th className="border-r border-black p-1 text-left">DESCRIÇÃO DO ITEM</th>
                <th className="border-r border-black p-1 text-right w-24">TOTAL PROGRAMADO</th>
                <th className="border-r border-black p-1 text-right w-24">SALDO ESTOQUE</th>
                <th className="border-r border-black p-1 text-center w-36">SITUAÇÃO / FALTA</th>
                <th className="border-r border-black p-1 text-left w-28">OPS</th>
                <th className="p-1 text-center w-24">CONF. FÍSICA [ ✓ ]</th>
              </tr>
            </thead>
            <tbody>
              {otherItems.map((item, idx) => (
                <tr
                  key={idx}
                  className={`border-b border-gray-400 ${
                    item.status === 'shortage' ? 'bg-red-50' : ''
                  }`}
                >
                  <td className="border-r border-black p-1 font-mono font-bold">
                    {item.code || '-'}
                  </td>
                  <td className="border-r border-black p-1 font-semibold">{item.description}</td>
                  <td className="border-r border-black p-1 text-right font-mono font-bold">
                    {formatQuantity(item.totalQuantity, item.unit)} {item.unit}
                  </td>
                  <td className="border-r border-black p-1 text-right font-mono">
                    {item.hasInventoryRecord && item.stockQuantity !== null
                      ? `${formatQuantity(item.stockQuantity, item.stockUnit)} ${item.stockUnit}`
                      : '-'}
                  </td>
                  <td className="border-r border-black p-1 text-center font-bold">
                    {item.status === 'covered' && (
                      <span className="text-green-700">
                        COBRE (+{formatQuantity(item.surplusQuantity, item.unit)} {item.unit})
                      </span>
                    )}
                    {item.status === 'shortage' && (
                      <span className="text-red-700">
                        FALTA: {formatQuantity(item.missingQuantity, item.unit)} {item.unit}
                      </span>
                    )}
                    {item.status === 'no_stock_record' && (
                      <span className="text-gray-600 font-normal">S/ CAD. — CONFIRMAR</span>
                    )}
                  </td>{' '}
                  <td className="border-r border-black p-1 text-[10px]">
                    {item.orderNumbers.join(', ')}
                  </td>
                  <td className="p-1 text-center border-black">
                    <span className="inline-block w-4 h-4 border border-black"></span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* RODAPÉ DE ASSINATURA */}
      <div className="mt-8 pt-4 border-t border-black flex justify-between text-xs">
        <div>
          <p>Conferência realizada por: _________________________________________</p>
          <p className="mt-1">Data: ____/____/________</p>
        </div>
        <div className="text-right">
          <p>Visto do Gestor PCP: _________________________________________</p>
          <p className="mt-1">Reginaldo Segundo</p>
        </div>
      </div>
    </div>
  )
}
