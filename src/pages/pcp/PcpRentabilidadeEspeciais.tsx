import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { PcpOrder, PcpCostSettings, PcpOrderCost } from '@/types'
import {
  ORDER_COST_CATEGORIES,
  OrderCostCategory,
  getCostSettings,
  summarizeCosts,
  fetchAutomaticMaterialCosts,
  listOrderCosts,
  fmtBRL,
  fmtPct,
  CostSummary,
  CostLine,
} from '@/services/order-costs'
import { PcpOrderCostsModal } from './components/PcpOrderCostsModal'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  Sparkles,
  Calendar,
  CheckCircle2,
  Clock,
  Layers,
  FileSpreadsheet,
} from 'lucide-react'
import { NoTranslate } from '@/components/NoTranslate'

interface OpRowData {
  order: PcpOrder
  summary: CostSummary
  automaticCount: number
  manualCount: number
}

export default function PcpRentabilidadeEspeciais() {
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [settings, setSettings] = useState<PcpCostSettings | null>(null)
  const [summariesMap, setSummariesMap] = useState<
    Record<string, { summary: CostSummary; automaticCount: number; manualCount: number }>
  >({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Filtros
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'Em Andamento' | 'Concluído' | 'Fila' | 'Parado'
  >('all')
  const [revenueFilter, setRevenueFilter] = useState<'all' | 'with_revenue' | 'without_revenue'>(
    'all',
  )
  const [periodPreset, setPeriodPreset] = useState<'all' | '30d' | '90d' | '180d' | 'this_year'>(
    'all',
  )
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [marginSort, setMarginSort] = useState<
    'default' | 'margin_asc' | 'margin_desc' | 'sale_desc' | 'cost_desc'
  >('default')

  // Modal de Custos da OP
  const [selectedOrderForCost, setSelectedOrderForCost] = useState<PcpOrder | null>(null)
  const [costModalOpen, setCostModalOpen] = useState(false)

  // Carrega OPs Especiais e settings
  const loadData = useCallback(async () => {
    try {
      setRefreshing(true)
      const [costConf, ordersRes] = await Promise.all([
        getCostSettings(),
        pb.collection('pcp_orders').getFullList<PcpOrder>({
          filter: "op_type = 'Especial'",
          sort: '-created',
          expand: 'client_id,operator_id',
        }),
      ])
      setSettings(costConf)
      setOrders(ordersRes)

      // Carrega custos em lote
      // 1. todos pcp_order_costs
      const allCosts = await pb.collection('pcp_order_costs').getFullList<PcpOrderCost>({
        sort: '-created',
      })
      const manualCostsByOrder: Record<string, PcpOrderCost[]> = {}
      for (const c of allCosts) {
        if (!manualCostsByOrder[c.order_id]) manualCostsByOrder[c.order_id] = []
        manualCostsByOrder[c.order_id].push(c)
      }

      // 2. inventory_movements do tipo Entrada com order_id
      const allMovements = await pb.collection('inventory_movements').getFullList({
        filter: "type = 'Entrada' && order_id != ''",
        expand: 'inventory_id',
      })
      const movementsByOrder: Record<string, any[]> = {}
      for (const m of allMovements) {
        if (!movementsByOrder[m.order_id]) movementsByOrder[m.order_id] = []
        movementsByOrder[m.order_id].push(m)
      }

      const map: Record<
        string,
        { summary: CostSummary; automaticCount: number; manualCount: number }
      > = {}
      for (const ord of ordersRes) {
        const orderMovs = movementsByOrder[ord.id] || []
        const totalQty = orderMovs.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0)
        const autoLines: CostLine[] = orderMovs.map((m) => {
          const qty = Number(m.quantity) || 0
          const baseValue =
            m.total_value != null && Number(m.total_value) > 0
              ? Number(m.total_value)
              : (Number(m.unit_price) || 0) * qty
          const freightShare = totalQty > 0 ? (Number(m.freight) || 0) * (qty / totalQty) : 0
          const total = baseValue + freightShare
          return {
            id: `auto-${m.id}`,
            category: 'Material' as OrderCostCategory,
            description: m.expand?.inventory_id?.description || m.reason || 'Material comprado',
            quantity: qty,
            unitCost: qty > 0 ? total / qty : total,
            total,
            source: 'Automático' as const,
          }
        })
        const autoMatTotal = autoLines.reduce((acc, l) => acc + (l.total || 0), 0)

        const manual = (manualCostsByOrder[ord.id] || []).map((c) => ({
          id: c.id,
          category: c.category,
          description: c.description || '',
          quantity: c.quantity ?? 1,
          unitCost: c.unit_cost ?? 0,
          total: c.total ?? 0,
          source: 'Manual' as const,
        }))

        const summary = summarizeCosts({
          automaticMaterial: autoMatTotal,
          manualLines: manual,
          salePrice: ord.sale_price,
          overheadPercent: costConf?.overhead_percent || 0,
        })

        map[ord.id] = {
          summary,
          automaticCount: autoLines.length,
          manualCount: manual.length,
        }
      }

      setSummariesMap(map)
    } catch (err) {
      console.error('Erro ao carregar dados de rentabilidade:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Ajusta período por presets
  const handlePresetChange = (preset: 'all' | '30d' | '90d' | '180d' | 'this_year') => {
    setPeriodPreset(preset)
    const now = new Date()
    if (preset === 'all') {
      setStartDate('')
      setEndDate('')
      return
    }
    const endStr = now.toISOString().slice(0, 10)
    setEndDate(endStr)

    let start = new Date()
    if (preset === '30d') {
      start.setDate(now.getDate() - 30)
    } else if (preset === '90d') {
      start.setDate(now.getDate() - 90)
    } else if (preset === '180d') {
      start.setDate(now.getDate() - 180)
    } else if (preset === 'this_year') {
      start = new Date(now.getFullYear(), 0, 1)
    }
    setStartDate(start.toISOString().slice(0, 10))
  }

  // Filtragem
  const filteredRows = useMemo<OpRowData[]>(() => {
    return orders
      .filter((order) => {
        // Busca textual
        if (search.trim()) {
          const q = search.toLowerCase()
          const opNum = (order.op_number || '').toLowerCase()
          const ordNum = (order.order_number || '').toLowerCase()
          const client = (order.client_name || order.expand?.client_id?.name || '').toLowerCase()
          const product = (order.manual_product_name || '').toLowerCase()
          if (
            !opNum.includes(q) &&
            !ordNum.includes(q) &&
            !client.includes(q) &&
            !product.includes(q)
          ) {
            return false
          }
        }

        // Status
        if (statusFilter !== 'all' && order.status !== statusFilter) {
          return false
        }

        // Receita
        const hasSale =
          order.sale_price !== null &&
          order.sale_price !== undefined &&
          Number(order.sale_price) > 0
        if (revenueFilter === 'with_revenue' && !hasSale) return false
        if (revenueFilter === 'without_revenue' && hasSale) return false

        // Período (baseado em created ou delivery_date)
        const refDate = (order.delivery_date || order.created || '').slice(0, 10)
        if (startDate && refDate < startDate) return false
        if (endDate && refDate > endDate) return false

        return true
      })
      .map((order) => {
        const item = summariesMap[order.id]
        const fallbackSummary = summarizeCosts({
          automaticMaterial: 0,
          manualLines: [],
          salePrice: order.sale_price,
          overheadPercent: settings?.overhead_percent || 0,
        })
        return {
          order,
          summary: item?.summary || fallbackSummary,
          automaticCount: item?.automaticCount || 0,
          manualCount: item?.manualCount || 0,
        }
      })
      .sort((a, b) => {
        if (marginSort === 'margin_desc') {
          const m1 = a.summary.contributionMarginPercent ?? -9999
          const m2 = b.summary.contributionMarginPercent ?? -9999
          return m2 - m1
        }
        if (marginSort === 'margin_asc') {
          const m1 = a.summary.contributionMarginPercent ?? 9999
          const m2 = b.summary.contributionMarginPercent ?? 9999
          return m1 - m2
        }
        if (marginSort === 'sale_desc') {
          return (b.summary.salePrice || 0) - (a.summary.salePrice || 0)
        }
        if (marginSort === 'cost_desc') {
          return (b.summary.directCost || 0) - (a.summary.directCost || 0)
        }
        // default: created desc
        return (b.order.created || '').localeCompare(a.order.created || '')
      })
  }, [
    orders,
    summariesMap,
    search,
    statusFilter,
    revenueFilter,
    startDate,
    endDate,
    marginSort,
    settings,
  ])

  // KPIs agregados
  const kpis = useMemo(() => {
    let totalRevenue = 0
    let totalDirectCost = 0
    let totalFullCost = 0
    let totalMaterial = 0
    let totalLabor = 0
    let totalOutsourcing = 0
    let totalOther = 0

    let opsWithRevenueCount = 0
    let opsWithoutRevenueCount = 0

    // Para médias de margem, EXCLUI OPs sem receita lançada
    let marginContributionSum = 0
    let marginGrossSum = 0

    // Top e piores margens (entre as que possuem receita lançada)
    const withRevenueRows = filteredRows.filter((r) => r.summary.hasSalePrice)

    for (const row of filteredRows) {
      const s = row.summary
      if (s.hasSalePrice) {
        totalRevenue += s.salePrice
        opsWithRevenueCount++
        if (s.contributionMarginPercent !== null) {
          marginContributionSum += s.contributionMarginPercent
        }
        if (s.grossMarginPercent !== null) {
          marginGrossSum += s.grossMarginPercent
        }
      } else {
        opsWithoutRevenueCount++
      }

      totalDirectCost += s.directCost
      totalFullCost += s.fullCost
      totalMaterial += s.materialTotal
      totalLabor += s.manualByCategory['Mão de Obra'] || 0
      totalOutsourcing += s.manualByCategory['Terceirização'] || 0
      totalOther +=
        (s.manualByCategory['Insumo'] || 0) +
        (s.manualByCategory['Impostos'] || 0) +
        (s.manualByCategory['Comissão'] || 0) +
        (s.manualByCategory['RT'] || 0) +
        (s.manualByCategory['Frete'] || 0) +
        (s.manualByCategory['Outros'] || 0)
    }

    const avgContributionMargin =
      opsWithRevenueCount > 0 ? marginContributionSum / opsWithRevenueCount : null
    const avgGrossMargin = opsWithRevenueCount > 0 ? marginGrossSum / opsWithRevenueCount : null

    // Margem global consolidada: (Receita Total - Custo Total das OPs com receita) / Receita Total
    const consolidatedProfit = totalRevenue - totalDirectCost
    const consolidatedMarginPct =
      totalRevenue > 0 ? ((totalRevenue - totalDirectCost) / totalRevenue) * 100 : null

    // Melhores e piores
    const sortedByMargin = [...withRevenueRows].sort((a, b) => {
      const m1 = a.summary.contributionMarginPercent ?? -9999
      const m2 = b.summary.contributionMarginPercent ?? -9999
      return m2 - m1
    })

    const bestMarginOp = sortedByMargin.length > 0 ? sortedByMargin[0] : null
    const worstMarginOp =
      sortedByMargin.length > 0 ? sortedByMargin[sortedByMargin.length - 1] : null

    return {
      totalOps: filteredRows.length,
      opsWithRevenueCount,
      opsWithoutRevenueCount,
      totalRevenue,
      totalDirectCost,
      totalFullCost,
      totalMaterial,
      totalLabor,
      totalOutsourcing,
      totalOther,
      avgContributionMargin,
      avgGrossMargin,
      consolidatedProfit,
      consolidatedMarginPct,
      bestMarginOp,
      worstMarginOp,
    }
  }, [filteredRows])

  const handleOpenCostsModal = (order: PcpOrder) => {
    setSelectedOrderForCost(order)
    setCostModalOpen(true)
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 rounded-lg">
              <DollarSign className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Rentabilidade de Projetos Especiais
              </h1>
              <p className="text-sm text-muted-foreground">
                Apuração financeira, custos diretos por categoria, margem de contribuição e
                lucratividade de OPs Especiais
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/pcp/kanban">
              Ver no Kanban
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Alerta de OPs sem receita */}
      {kpis.opsWithoutRevenueCount > 0 && (
        <div className="p-3.5 rounded-lg border border-amber-300 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Atenção:</strong> Existem <strong>{kpis.opsWithoutRevenueCount}</strong> OP(s)
              Especiais sem valor de venda lançado. Elas foram excluídas do cálculo das margens
              médias para não distorcer o resultado financeiro.
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-xs font-semibold shrink-0"
            onClick={() =>
              setRevenueFilter(revenueFilter === 'without_revenue' ? 'all' : 'without_revenue')
            }
          >
            {revenueFilter === 'without_revenue' ? 'Ver todas' : 'Filtrar pendentes'}
          </Button>
        </div>
      )}

      {/* Cards de Resumo / KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Receita Total */}
        <Card className="border-l-4 border-l-emerald-600 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Receita Total Lançada</span>
              <DollarSign className="size-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
              {fmtBRL(kpis.totalRevenue)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground pt-0">
            {kpis.opsWithRevenueCount} de {kpis.totalOps} OPs com preço cadastrado
          </CardContent>
        </Card>

        {/* Custo Total Direto */}
        <Card className="border-l-4 border-l-blue-600 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Custo Direto Total</span>
              <Layers className="size-4 text-blue-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-blue-700 dark:text-blue-400">
              {fmtBRL(kpis.totalDirectCost)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground pt-0 space-y-0.5">
            <div>
              Material: {fmtBRL(kpis.totalMaterial)} | MO: {fmtBRL(kpis.totalLabor)}
            </div>
            <div>
              Terceirização: {fmtBRL(kpis.totalOutsourcing)} | Outros: {fmtBRL(kpis.totalOther)}
            </div>
          </CardContent>
        </Card>

        {/* Margem Média de Contribuição */}
        <Card className="border-l-4 border-l-purple-600 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Margem de Contribuição Média</span>
              <TrendingUp className="size-4 text-purple-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-purple-700 dark:text-purple-400">
              {fmtPct(kpis.avgContributionMargin)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground pt-0">
            {kpis.consolidatedMarginPct !== null
              ? `Margem consolidada: ${fmtPct(kpis.consolidatedMarginPct)} (${fmtBRL(kpis.consolidatedProfit)})`
              : 'Sem receita suficiente'}
          </CardContent>
        </Card>

        {/* Destaques: Melhor e Pior */}
        <Card className="border-l-4 border-l-amber-600 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Melhores / Piores Margens</span>
              <Sparkles className="size-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-sm font-semibold truncate">
              {kpis.bestMarginOp ? (
                <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <TrendingUp className="size-3.5 inline" />
                  OP {kpis.bestMarginOp.order.op_number || kpis.bestMarginOp.order.order_number}:{' '}
                  {fmtPct(kpis.bestMarginOp.summary.contributionMarginPercent)}
                </span>
              ) : (
                <span className="text-muted-foreground">Nenhuma OP avaliada</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground pt-0">
            {kpis.worstMarginOp && kpis.worstMarginOp !== kpis.bestMarginOp ? (
              <span className="text-rose-700 dark:text-rose-400 flex items-center gap-1">
                <TrendingDown className="size-3.5 inline" />
                OP {kpis.worstMarginOp.order.op_number || kpis.worstMarginOp.order.order_number}:{' '}
                {fmtPct(kpis.worstMarginOp.summary.contributionMarginPercent)}
              </span>
            ) : (
              <span>Cadastre receitas e custos para comparar</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-end">
            {/* Busca */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Search className="size-3.5" />
                Buscar OP, Pedido, Cliente ou Produto
              </label>
              <Input
                placeholder="Ex.: 236/2026, Adriano, Luminária..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Status da OP */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Status da OP</label>
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="Fila">Fila</SelectItem>
                  <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                  <SelectItem value="Parado">Parado</SelectItem>
                  <SelectItem value="Concluído">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro de Receita */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Lançamento de Receita
              </label>
              <Select value={revenueFilter} onValueChange={(v: any) => setRevenueFilter(v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Receita" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as OPs</SelectItem>
                  <SelectItem value="with_revenue">Com Receita Lançada</SelectItem>
                  <SelectItem value="without_revenue">Sem Receita Lançada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Presets de Período */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Calendar className="size-3.5" />
                Período
              </label>
              <Select value={periodPreset} onValueChange={(v: any) => handlePresetChange(v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo o Histórico</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="90d">Últimos 90 dias</SelectItem>
                  <SelectItem value="180d">Últimos 180 dias</SelectItem>
                  <SelectItem value="this_year">Este Ano</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Ordenação */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <SlidersHorizontal className="size-3.5" />
                Ordenar por
              </label>
              <Select value={marginSort} onValueChange={(v: any) => setMarginSort(v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Ordenação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Mais recentes primeiro</SelectItem>
                  <SelectItem value="margin_desc">Maior Margem %</SelectItem>
                  <SelectItem value="margin_asc">Menor Margem %</SelectItem>
                  <SelectItem value="sale_desc">Maior Receita</SelectItem>
                  <SelectItem value="cost_desc">Maior Custo Direto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Filtros manuais de data caso preset personalizado */}
          <div className="flex flex-wrap items-center gap-3 pt-1 border-t text-xs text-muted-foreground">
            <span>Ou informe intervalo personalizado:</span>
            <div className="flex items-center gap-1.5">
              <span>De:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setPeriodPreset('all')
                }}
                className="h-7 w-36 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span>Até:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setPeriodPreset('all')
                }}
                className="h-7 w-36 text-xs"
              />
            </div>
            {(startDate ||
              endDate ||
              search ||
              statusFilter !== 'all' ||
              revenueFilter !== 'all' ||
              marginSort !== 'default') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs ml-auto"
                onClick={() => {
                  setSearch('')
                  setStatusFilter('all')
                  setRevenueFilter('all')
                  setPeriodPreset('all')
                  setStartDate('')
                  setEndDate('')
                  setMarginSort('default')
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabela de OPs Especiais */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="p-4 border-b bg-slate-50/50 dark:bg-slate-900/50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <FileSpreadsheet className="size-4 text-emerald-600" />
              Detalhamento de Custos e Margens por Ordem de Produção
            </CardTitle>
            <CardDescription className="text-xs">
              Exibindo {filteredRows.length} de {orders.length} OPs Especiais
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-50">
                  <TableHead className="w-[120px]">OP / Pedido</TableHead>
                  <TableHead className="min-w-[180px]">Cliente / Produto</TableHead>
                  <TableHead className="w-[100px] text-center">Status</TableHead>
                  <TableHead className="w-[120px] text-right">Receita (Venda)</TableHead>
                  <TableHead className="w-[110px] text-right">Material</TableHead>
                  <TableHead className="w-[110px] text-right">Mão de Obra</TableHead>
                  <TableHead className="w-[110px] text-right">Terceirização</TableHead>
                  <TableHead className="w-[100px] text-right">Outros</TableHead>
                  <TableHead className="w-[120px] text-right font-semibold">Custo Direto</TableHead>
                  <TableHead className="w-[120px] text-right font-semibold">Margem Bruta</TableHead>
                  <TableHead className="w-[120px] text-right font-bold text-emerald-700 dark:text-emerald-400">
                    Margem Contrib.
                  </TableHead>
                  <TableHead className="w-[110px] text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="h-32 text-center text-muted-foreground">
                      Carregando dados financeiros e custos das OPs...
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="h-32 text-center text-muted-foreground">
                      Nenhuma Ordem de Produção Especial encontrada com os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map(({ order, summary, automaticCount, manualCount }) => {
                    const client = order.client_name || order.expand?.client_id?.name || '-'
                    const product = order.manual_product_name || '-'
                    const otherCosts =
                      (summary.manualByCategory['Insumo'] || 0) +
                      (summary.manualByCategory['Impostos'] || 0) +
                      (summary.manualByCategory['Comissão'] || 0) +
                      (summary.manualByCategory['RT'] || 0) +
                      (summary.manualByCategory['Frete'] || 0) +
                      (summary.manualByCategory['Outros'] || 0)

                    return (
                      <TableRow
                        key={order.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors"
                      >
                        {/* OP / Pedido */}
                        <TableCell className="font-medium">
                          <div className="font-semibold text-xs text-foreground">
                            {order.op_number
                              ? `OP ${order.op_number}`
                              : `OP #${order.id.slice(0, 5)}`}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Ped: {order.order_number || '-'}
                          </div>
                        </TableCell>

                        {/* Cliente / Produto */}
                        <TableCell>
                          <div
                            className="font-medium text-xs truncate max-w-[220px]"
                            title={client}
                          >
                            {client}
                          </div>
                          <div
                            className="text-[11px] text-muted-foreground truncate max-w-[220px]"
                            title={product}
                          >
                            <NoTranslate>{product}</NoTranslate>
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <span>Qtd: {order.quantity || 1}</span>
                            {automaticCount > 0 && (
                              <span className="text-blue-600 dark:text-blue-400">
                                • {automaticCount} mat. autom.
                              </span>
                            )}
                            {manualCount > 0 && (
                              <span className="text-muted-foreground">
                                • {manualCount} linha(s) manual
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="text-center">
                          <Badge
                            variant={
                              order.status === 'Concluído'
                                ? 'default'
                                : order.status === 'Em Andamento'
                                  ? 'secondary'
                                  : order.status === 'Parado'
                                    ? 'destructive'
                                    : 'outline'
                            }
                            className="text-[10px] px-1.5 py-0"
                          >
                            {order.status}
                          </Badge>
                        </TableCell>

                        {/* Receita (Venda) */}
                        <TableCell className="text-right">
                          {summary.hasSalePrice ? (
                            <span className="font-semibold text-xs text-foreground">
                              {fmtBRL(summary.salePrice)}
                            </span>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-800 cursor-pointer">
                                  <AlertTriangle className="size-3" />
                                  Sem receita lançada
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Clique em "Custos da OP" para cadastrar o valor de venda deste
                                projeto.
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>

                        {/* Material (automático + manual) */}
                        <TableCell className="text-right text-xs">
                          {summary.materialTotal > 0 ? (
                            <div>
                              <span>{fmtBRL(summary.materialTotal)}</span>
                              {summary.automaticMaterial > 0 && summary.materialManual > 0 && (
                                <div className="text-[10px] text-muted-foreground">
                                  (aut: {fmtBRL(summary.automaticMaterial)})
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </TableCell>

                        {/* Mão de Obra */}
                        <TableCell className="text-right text-xs">
                          {summary.manualByCategory['Mão de Obra'] > 0 ? (
                            fmtBRL(summary.manualByCategory['Mão de Obra'])
                          ) : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </TableCell>

                        {/* Terceirização */}
                        <TableCell className="text-right text-xs">
                          {summary.manualByCategory['Terceirização'] > 0 ? (
                            fmtBRL(summary.manualByCategory['Terceirização'])
                          ) : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </TableCell>

                        {/* Outros */}
                        <TableCell className="text-right text-xs">
                          {otherCosts > 0 ? (
                            fmtBRL(otherCosts)
                          ) : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </TableCell>

                        {/* Custo Direto */}
                        <TableCell className="text-right font-semibold text-xs">
                          {fmtBRL(summary.directCost)}
                        </TableCell>

                        {/* Margem Bruta (Receita - Material) */}
                        <TableCell className="text-right text-xs">
                          {summary.hasSalePrice && summary.grossMarginPercent !== null ? (
                            <div
                              className={
                                summary.grossMarginPercent >= 0
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-rose-600'
                              }
                            >
                              <div className="font-medium">
                                {fmtPct(summary.grossMarginPercent)}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {fmtBRL(summary.grossMarginValue)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </TableCell>

                        {/* Margem de Contribuição (Receita - Custo Direto) */}
                        <TableCell className="text-right text-xs">
                          {summary.hasSalePrice && summary.contributionMarginPercent !== null ? (
                            <div
                              className={
                                summary.contributionMarginPercent >= 0
                                  ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                                  : 'text-rose-600 font-bold'
                              }
                            >
                              <div>{fmtPct(summary.contributionMarginPercent)}</div>
                              <div className="text-[10px] font-normal text-muted-foreground">
                                {fmtBRL(summary.contributionMarginValue)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </TableCell>

                        {/* Ações */}
                        <TableCell className="text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2 gap-1 border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                            onClick={() => handleOpenCostsModal(order)}
                          >
                            <DollarSign className="size-3.5" />
                            Custos da OP
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>

        {/* Rodapé com Totais Consolidados */}
        {filteredRows.length > 0 && (
          <div className="p-4 bg-slate-100/70 dark:bg-slate-900/90 border-t flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="font-semibold text-slate-700 dark:text-slate-300">
              Totais Consolidados ({filteredRows.length} OPs):
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <span className="text-muted-foreground">Receita Total: </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {fmtBRL(kpis.totalRevenue)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Custo Material: </span>
                <span className="font-medium">{fmtBRL(kpis.totalMaterial)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Custo MO: </span>
                <span className="font-medium">{fmtBRL(kpis.totalLabor)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Terceirização: </span>
                <span className="font-medium">{fmtBRL(kpis.totalOutsourcing)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Custo Direto Total: </span>
                <span className="font-bold text-blue-700 dark:text-blue-400">
                  {fmtBRL(kpis.totalDirectCost)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Margem Média Contribuição: </span>
                <span className="font-bold text-purple-700 dark:text-purple-400">
                  {fmtPct(kpis.avgContributionMargin)}
                </span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Modal de Custos da OP integrado */}
      {selectedOrderForCost && (
        <PcpOrderCostsModal
          order={selectedOrderForCost}
          open={costModalOpen}
          onOpenChange={(v) => {
            setCostModalOpen(v)
            if (!v) setSelectedOrderForCost(null)
          }}
          onOrderUpdated={(updated) => {
            setSelectedOrderForCost(updated)
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
            loadData()
          }}
        />
      )}
    </div>
  )
}
