import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import {
  PcpOrder,
  PcpCostSettings,
  PcpOrderCost,
  OrderCostCategory,
  PcpCostCategory,
} from '@/types'
import {
  ORDER_COST_CATEGORIES,
  getCostSettings,
  summarizeCosts,
  fetchAutomaticMaterialCosts,
  listOrderCosts,
  listCostCategories,
  fmtBRL,
  fmtPct,
  CostSummary,
  CostLine,
} from '@/services/order-costs'
import { PcpOrderCostsModal } from './components/PcpOrderCostsModal'
import { OrderLevelCostsModal } from './components/OrderLevelCostsModal'
import { listOrderCostsByOrderNumber } from '@/services/order-costs'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  Users,
  ChevronDown,
  Archive,
  ArchiveRestore,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useToast } from '@/hooks/use-toast'
import { NoTranslate } from '@/components/NoTranslate'

interface OpRowData {
  order: PcpOrder
  orders: PcpOrder[]
  label: string
  summary: CostSummary
  automaticCount: number
  manualCount: number
  automaticMaterial: number
  manualLines: CostLine[]
  /** Linhas de custo attachadas ao PEDIDO (sem OP) — só no modo Por Pedido */
  orderLevelLines?: CostLine[]
  /** Quantidade de OPs arquivadas dentro da linha (1 no modo Por OP) */
  archivedCount: number
  /** true quando TODAS as OPs da linha estão arquivadas */
  archivedAll: boolean
}

const statusBadgeVariant = (
  status?: string | null,
): 'default' | 'secondary' | 'destructive' | 'outline' =>
  status === 'Concluído'
    ? 'default'
    : status === 'Em Andamento'
      ? 'secondary'
      : status === 'Parado'
        ? 'destructive'
        : 'outline'

function sortOpRows(
  rows: OpRowData[],
  marginSort: 'default' | 'margin_asc' | 'margin_desc' | 'sale_desc' | 'cost_desc',
): OpRowData[] {
  const sorted = [...rows]
  if (marginSort === 'margin_desc') {
    sorted.sort(
      (a, b) =>
        (b.summary.contributionMarginPercent ?? -9999) -
        (a.summary.contributionMarginPercent ?? -9999),
    )
  } else if (marginSort === 'margin_asc') {
    sorted.sort(
      (a, b) =>
        (a.summary.contributionMarginPercent ?? 9999) -
        (b.summary.contributionMarginPercent ?? 9999),
    )
  } else if (marginSort === 'sale_desc') {
    sorted.sort((a, b) => (b.summary.salePrice || 0) - (a.summary.salePrice || 0))
  } else if (marginSort === 'cost_desc') {
    sorted.sort((a, b) => (b.summary.directCost || 0) - (a.summary.directCost || 0))
  } else {
    // default: mais recentes primeiro (na consolidada, usa a OP mais recente do grupo)
    sorted.sort((a, b) => {
      const da = a.orders.reduce((acc, o) => (o.created || '' > acc ? o.created || '' : acc), '')
      const db = b.orders.reduce((acc, o) => (o.created || '' > acc ? o.created || '' : acc), '')
      return db.localeCompare(da)
    })
  }
  return sorted
}

export default function PcpRentabilidadeEspeciais() {
  const { toast } = useToast()
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [settings, setSettings] = useState<PcpCostSettings | null>(null)
  const [summariesMap, setSummariesMap] = useState<
    Record<
      string,
      {
        summary: CostSummary
        automaticCount: number
        manualCount: number
        manualLines: CostLine[]
        automaticMaterial: number
      }
    >
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

  // Alternador de visualização: Por OP (padrão) ou consolidado Por Pedido
  const [viewMode, setViewMode] = useState<'op' | 'order'>('op')

  // Arquivamento: por padrão o painel exclui as OPs arquivadas
  const [showArchived, setShowArchived] = useState(false)
  const [archivingRow, setArchivingRow] = useState<OpRowData | null>(null)
  const [archivingInProgress, setArchivingInProgress] = useState(false)

  // Modal de Custos da OP
  const [selectedOrderForCost, setSelectedOrderForCost] = useState<PcpOrder | null>(null)
  const [costModalOpen, setCostModalOpen] = useState(false)

  // Modal de Custos do Pedido (nível order_number, sem OP)
  const [orderLevelCostState, setOrderLevelCostState] = useState<{
    orderNumber: string
    representativeOrder: PcpOrder
    orders: PcpOrder[]
  } | null>(null)
  const [orderLevelCostOpen, setOrderLevelCostOpen] = useState(false)
  const [orderLevelCostsByNumber, setOrderLevelCostsByNumber] = useState<
    Record<string, PcpOrderCost[]>
  >({})

  // Categorias cadastradas para agrupamento dinâmico
  const [registeredCategories, setRegisteredCategories] = useState<PcpCostCategory[]>([])

  // Carrega OPs Especiais, settings e categorias
  const loadData = useCallback(async () => {
    try {
      setRefreshing(true)
      const [costConf, ordersRes, catRes] = await Promise.all([
        getCostSettings(),
        pb.collection('pcp_orders').getFullList<PcpOrder>({
          filter: "op_type = 'Especial'",
          sort: '-created',
          expand: 'client_id,operator_id',
        }),
        listCostCategories(true).catch(() => [] as PcpCostCategory[]),
      ])
      setSettings(costConf)
      setOrders(ordersRes)
      setRegisteredCategories(catRes)

      // Carrega custos em lote
      // 1. todos pcp_order_costs
      const allCosts = await pb.collection('pcp_order_costs').getFullList<PcpOrderCost>({
        sort: '-created',
      })
      const manualCostsByOrder: Record<string, PcpOrderCost[]> = {}
      const orderLevelCosts: Record<string, PcpOrderCost[]> = {}
      for (const c of allCosts) {
        // Linhas attachadas ao PEDIDO (order_id vazio + order_number) ficam fora
        // do detalhamento por OP, mas entram no consolidado do período.
        if (!c.order_id) {
          const onum = (c.order_number || '').trim()
          if (onum) {
            if (!orderLevelCosts[onum]) orderLevelCosts[onum] = []
            orderLevelCosts[onum].push(c)
          }
          continue
        }
        if (!manualCostsByOrder[c.order_id]) manualCostsByOrder[c.order_id] = []
        manualCostsByOrder[c.order_id].push(c)
      }
      const orderLevelCount: Record<string, number> = {}
      for (const [onum, lines] of Object.entries(orderLevelCosts)) {
        orderLevelCount[onum] = lines.length
      }
      setOrderLevelCostsByNumber(orderLevelCosts)

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
        {
          summary: CostSummary
          automaticCount: number
          manualCount: number
          manualLines: CostLine[]
          automaticMaterial: number
        }
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
          manualLines: manual,
          automaticMaterial: autoMatTotal,
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

  // Filtragem base (busca, status, período) — por OP
  const baseRows = useMemo<OpRowData[]>(() => {
    return orders
      .filter((order) => {
        // Arquivadas só aparecem quando "Ver arquivados" está ativo
        if (order.archived && !showArchived) return false

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
          orders: [order],
          label: order.op_number ? `OP ${order.op_number}` : `OP #${order.id.slice(0, 5)}`,
          summary: item?.summary || fallbackSummary,
          automaticCount: item?.automaticCount || 0,
          manualCount: item?.manualCount || 0,
          automaticMaterial: item?.automaticMaterial || 0,
          manualLines: item?.manualLines || [],
          archivedCount: order.archived ? 1 : 0,
          archivedAll: order.archived === true,
        }
      })
  }, [orders, summariesMap, search, statusFilter, startDate, endDate, settings, showArchived])

  // Visualização: Por OP (padrão) ou consolidada Por Pedido
  const viewRows = useMemo<OpRowData[]>(() => {
    const passesRevenueFilter = (hasSale: boolean) => {
      if (revenueFilter === 'with_revenue') return hasSale
      if (revenueFilter === 'without_revenue') return !hasSale
      return true
    }

    if (viewMode === 'op') {
      return sortOpRows(
        baseRows.filter((r) => passesRevenueFilter(r.summary.hasSalePrice)),
        marginSort,
      )
    }

    // Agrupa as OPs Especiais do mesmo order_number numa única linha consolidada
    const groups = new Map<string, OpRowData[]>()
    for (const row of baseRows) {
      const key = row.order.order_number || `__op_${row.order.id}`
      const list = groups.get(key) || []
      list.push(row)
      groups.set(key, list)
    }
    // Ordena OPs de cada grupo pela numeração da OP (quando existir)
    for (const list of groups.values()) {
      list.sort((a, b) =>
        (a.order.op_number || a.order.id).localeCompare(b.order.op_number || b.order.id),
      )
    }

    const overheadPercent = settings?.overhead_percent || 0
    const consolidated = Array.from(groups.values()).map((rows) => {
      const first = rows[0].order
      const groupOrders = rows.map((r) => r.order)
      const automaticMaterial = rows.reduce((acc, r) => acc + (r.automaticMaterial || 0), 0)
      const manualLines = rows.flatMap((r) => r.manualLines)
      const archivedCount = rows.reduce((acc, r) => acc + (r.archivedCount || 0), 0)
      const archivedAll = groupOrders.every((o) => o.archived === true)
      // Linhas de custo attachadas ao PEDIDO (sem OP) entram no consolidado
      const orderLines = orderLevelCostsByNumber[first.order_number || ''] || []
      const orderLevelLines = orderLines.map((c) => ({
        id: c.id,
        category: c.category,
        description: c.description || '',
        quantity: c.quantity ?? 1,
        unitCost: c.unit_cost ?? 0,
        total: c.total ?? 0,
        source: 'Manual' as const,
      }))
      // Receita do pedido = soma dos sale_price das OPs; sem nenhuma receita, fica sinalizado
      const salePrice = groupOrders.reduce((acc, o) => acc + (Number(o.sale_price) || 0), 0)
      const summary = summarizeCosts({
        automaticMaterial,
        manualLines: [...manualLines, ...orderLevelLines],
        salePrice,
        overheadPercent,
      })
      return {
        order: first,
        orders: groupOrders,
        orderLevelLines,
        archivedCount,
        archivedAll,
        label: first.order_number
          ? `Pedido ${first.order_number} · ${
              first.client_name || first.expand?.client_id?.name || '-'
            } · ${groupOrders.length} OP${groupOrders.length > 1 ? 's' : ''}`
          : 'Pedido —',
        summary,
        automaticCount: rows.reduce((acc, r) => acc + r.automaticCount, 0),
        manualCount: rows.reduce((acc, r) => acc + r.manualCount, 0),
        automaticMaterial,
        manualLines,
      }
    })

    return sortOpRows(
      consolidated.filter((r) => passesRevenueFilter(r.summary.hasSalePrice)),
      marginSort,
    )
  }, [baseRows, viewMode, revenueFilter, marginSort, settings, orderLevelCostsByNumber])

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
    const withRevenueRows = viewRows.filter((r) => r.summary.hasSalePrice)

    for (const row of viewRows) {
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

      // "Outros" soma qualquer categoria manual além de Mão de Obra e Terceirização (exceto Material que já está em materialTotal)
      for (const [catName, val] of Object.entries(s.manualByCategory)) {
        if (catName !== 'Mão de Obra' && catName !== 'Terceirização' && catName !== 'Material') {
          totalOther += val || 0
        }
      }
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
      totalOps: viewRows.length,
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
  }, [viewRows])

  const entityPlural = viewMode === 'op' ? 'OPs' : 'pedidos'

  // Categorias adicionais além das 9 fixas padrão que aparecem como colunas/grupos
  const additionalCategories = useMemo<string[]>(() => {
    const names = new Set<string>()
    // 1. categorias cadastradas ativas que não sejam uma das 9 fixas
    for (const cat of registeredCategories) {
      if (!ORDER_COST_CATEGORIES.includes(cat.name as any)) {
        names.add(cat.name)
      }
    }
    // 2. categorias encontradas nas linhas de custo carregadas
    for (const row of viewRows) {
      for (const catName of Object.keys(row.summary.manualByCategory)) {
        if (!ORDER_COST_CATEGORIES.includes(catName as any)) {
          names.add(catName)
        }
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [registeredCategories, viewRows])

  const handleOpenCostsModal = (order: PcpOrder) => {
    setSelectedOrderForCost(order)
    setCostModalOpen(true)
  }

  const archivedTotalCount = orders.filter((o) => o.archived === true).length

  /** Grava o flag archived nas OPs da linha. Afeta SOMENTE a rentabilidade:
   *  não cancela, não exclui e não muda status/estágio da OP. */
  const applyArchivedFlag = async (ids: string[], archived: boolean) => {
    if (ids.length === 0) return
    setArchivingInProgress(true)
    try {
      await Promise.all(ids.map((id) => pb.collection('pcp_orders').update(id, { archived })))
      setOrders((prev) => prev.map((o) => (ids.includes(o.id) ? { ...o, archived } : o)))
      toast({
        title: archived ? 'Projeto arquivado' : 'Projeto desarquivado',
        description: archived
          ? `${ids.length} OP(s) ${ids.length > 1 ? 'saíram' : 'saiu'} da tabela e dos totais de rentabilidade. Kanban e demais fluxos permanecem inalterados.`
          : `${ids.length} OP(s) ${ids.length > 1 ? 'voltaram' : 'voltou'} para a rentabilidade.`,
      })
    } catch (err) {
      console.error('Erro ao atualizar arquivamento:', err)
      toast({
        title: archived ? 'Erro ao arquivar' : 'Erro ao desarquivar',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setArchivingInProgress(false)
      setArchivingRow(null)
    }
  }

  const handleOpenOrderLevelCosts = (row: OpRowData) => {
    const orderNumber = row.order.order_number || ''
    if (!orderNumber) return
    setOrderLevelCostState({
      orderNumber,
      representativeOrder: row.order,
      orders: row.orders,
    })
    setOrderLevelCostOpen(true)
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
              <strong>Atenção:</strong> Existem <strong>{kpis.opsWithoutRevenueCount}</strong>{' '}
              {entityPlural} sem valor de venda lançado. Foram excluídos do cálculo das margens
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
            {kpis.opsWithRevenueCount} de {kpis.totalOps} {entityPlural} com preço cadastrado
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
                  {kpis.bestMarginOp.label}:{' '}
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
                {kpis.worstMarginOp.label}:{' '}
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
          {/* Alternador de visualização */}
          <div className="flex flex-wrap items-center gap-3 pb-2 border-b">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Layers className="size-3.5" />
              Visualização
            </span>
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'op' | 'order')}>
              <TabsList>
                <TabsTrigger value="op" className="text-xs px-3">
                  Por OP
                </TabsTrigger>
                <TabsTrigger value="order" className="text-xs px-3">
                  Por Pedido
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="text-[11px] text-muted-foreground">
              {viewMode === 'op'
                ? 'Uma linha por OP Especial'
                : 'OPs do mesmo pedido consolidadas em uma linha'}
            </span>
            <label className="ml-auto flex items-center gap-1.5 text-xs font-medium text-muted-foreground cursor-pointer select-none">
              <Checkbox
                checked={showArchived}
                onCheckedChange={(v) => setShowArchived(v === true)}
              />
              <Archive className="size-3.5" />
              Ver arquivados
              {archivedTotalCount > 0 ? ` (${archivedTotalCount})` : ''}
            </label>
          </div>
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
              {viewMode === 'op'
                ? 'Detalhamento de Custos e Margens por Ordem de Produção'
                : 'Detalhamento de Custos e Margens por Pedido (consolidado)'}
            </CardTitle>
            <CardDescription className="text-xs">
              {viewMode === 'op'
                ? `Exibindo ${viewRows.length} de ${orders.length} OPs Especiais`
                : `Exibindo ${viewRows.length} pedido(s) cobrindo ${viewRows.reduce((acc, r) => acc + r.orders.length, 0)} de ${orders.length} OPs Especiais`}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-50">
                  <TableHead className="w-[120px]">
                    {viewMode === 'op' ? 'OP / Pedido' : 'Pedido / OPs'}
                  </TableHead>
                  <TableHead className="min-w-[180px]">
                    {viewMode === 'op' ? 'Cliente / Produto' : 'Cliente / Produtos'}
                  </TableHead>
                  <TableHead className="w-[100px] text-center">Status</TableHead>
                  <TableHead className="w-[120px] text-right">Receita (Venda)</TableHead>
                  <TableHead className="w-[110px] text-right">Material</TableHead>
                  <TableHead className="w-[110px] text-right">Mão de Obra</TableHead>
                  <TableHead className="w-[110px] text-right">Terceirização</TableHead>
                  {additionalCategories.map((catName) => (
                    <TableHead key={catName} className="w-[110px] text-right">
                      {catName}
                    </TableHead>
                  ))}
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
                    <TableCell
                      colSpan={12 + additionalCategories.length}
                      className="h-32 text-center text-muted-foreground"
                    >
                      Carregando dados financeiros e custos das OPs...
                    </TableCell>
                  </TableRow>
                ) : viewRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={12 + additionalCategories.length}
                      className="h-32 text-center text-muted-foreground"
                    >
                      Nenhuma Ordem de Produção Especial encontrada com os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  viewRows.map(
                    ({
                      order,
                      orders,
                      label,
                      summary,
                      automaticCount,
                      manualCount,
                      automaticMaterial,
                      manualLines,
                      archivedCount,
                      archivedAll,
                    }) => {
                      const client = order.client_name || order.expand?.client_id?.name || '-'
                      const productNames = Array.from(
                        new Set(orders.map((o) => o.manual_product_name).filter(Boolean)),
                      )
                      const product = productNames.join(' · ') || '-'
                      const otherCosts =
                        (summary.manualByCategory['Insumo'] || 0) +
                        (summary.manualByCategory['Impostos'] || 0) +
                        (summary.manualByCategory['Comissão'] || 0) +
                        (summary.manualByCategory['RT'] || 0) +
                        (summary.manualByCategory['Frete'] || 0) +
                        (summary.manualByCategory['Outros'] || 0)

                      return (
                        <TableRow
                          key={orders.map((o) => o.id).join('-')}
                          className="hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors"
                        >
                          {/* OP / Pedido */}
                          <TableCell className="font-medium">
                            {viewMode === 'op' ? (
                              <>
                                <div className="font-semibold text-xs text-foreground">
                                  {order.op_number
                                    ? `OP ${order.op_number}`
                                    : `OP #${order.id.slice(0, 5)}`}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  Ped: {order.order_number || '-'}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="font-semibold text-xs text-foreground">{label}</div>
                                <div
                                  className="text-[11px] text-muted-foreground truncate max-w-[150px]"
                                  title={orders
                                    .map((o) =>
                                      o.op_number ? `OP ${o.op_number}` : `#${o.id.slice(0, 5)}`,
                                    )
                                    .join(', ')}
                                >
                                  {orders.length} OP(s)
                                </div>
                              </>
                            )}
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
                              <span>
                                Qtd:{' '}
                                {viewMode === 'op'
                                  ? order.quantity || 1
                                  : orders.reduce((acc, o) => acc + (o.quantity || 0), 0)}
                              </span>
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
                            {(() => {
                              const statuses = Array.from(
                                new Set(orders.map((o) => o.status).filter(Boolean)),
                              )
                              if (viewMode === 'op' || statuses.length <= 1) {
                                return (
                                  <Badge
                                    variant={statusBadgeVariant(statuses[0] || order.status)}
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {statuses[0] || order.status}
                                  </Badge>
                                )
                              }
                              return (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {statuses.length} status
                                </Badge>
                              )
                            })()}
                            {archivedCount > 0 && (
                              <Badge
                                variant="outline"
                                className="mt-1 text-[9px] px-1.5 py-0 border-slate-400 text-slate-600 dark:text-slate-400"
                              >
                                <Archive className="size-2.5 mr-0.5" />
                                {archivedAll ? 'Arquivado' : `${archivedCount} arquivada(s)`}
                              </Badge>
                            )}
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

                          {/* Categorias adicionais dinâmicas */}
                          {additionalCategories.map((catName) => {
                            const val = summary.manualByCategory[catName] || 0
                            return (
                              <TableCell key={catName} className="text-right text-xs">
                                {val > 0 ? (
                                  fmtBRL(val)
                                ) : (
                                  <span className="text-muted-foreground text-[11px]">—</span>
                                )}
                              </TableCell>
                            )
                          })}

                          {/* Outros (Insumo, Impostos, Comissão, RT, Frete, Outros padrão) */}
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
                            {viewMode === 'op' ? (
                              <div className="flex flex-col items-center gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs px-2 gap-1 border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                  onClick={() => handleOpenCostsModal(order)}
                                >
                                  <DollarSign className="size-3.5" />
                                  Custos da OP
                                </Button>
                                {order.archived ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[10px] px-2 gap-1 text-muted-foreground hover:text-foreground"
                                    onClick={() => applyArchivedFlag([order.id], false)}
                                  >
                                    <ArchiveRestore className="size-3" />
                                    Desarquivar
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[10px] px-2 gap-1 text-muted-foreground hover:text-foreground"
                                    onClick={() =>
                                      setArchivingRow({
                                        order,
                                        orders,
                                        label,
                                        summary,
                                        automaticCount,
                                        manualCount,
                                        automaticMaterial,
                                        manualLines,
                                        archivedCount,
                                        archivedAll,
                                      })
                                    }
                                  >
                                    <Archive className="size-3" />
                                    Arquivar
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-1.5">
                                {order.order_number ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs px-2 gap-1 border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                    onClick={() =>
                                      handleOpenOrderLevelCosts({
                                        order,
                                        orders,
                                        label,
                                        summary,
                                        automaticCount,
                                        manualCount,
                                        automaticMaterial,
                                        manualLines,
                                        archivedCount,
                                        archivedAll,
                                      })
                                    }
                                  >
                                    <DollarSign className="size-3.5" />
                                    Custos do Pedido
                                    {orderLevelCostsByNumber[order.order_number || '']?.length ? (
                                      <Badge
                                        variant="secondary"
                                        className="ml-0.5 h-4 px-1 text-[9px]"
                                      >
                                        {orderLevelCostsByNumber[order.order_number || ''].length}
                                      </Badge>
                                    ) : null}
                                  </Button>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">
                                    Sem nº pedido
                                  </span>
                                )}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs px-2 gap-1"
                                    >
                                      <Users className="size-3.5" />
                                      {orders.length} OPs
                                      <ChevronDown className="size-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="max-h-64 overflow-y-auto"
                                  >
                                    {orders.map((o) => (
                                      <DropdownMenuItem
                                        key={o.id}
                                        onClick={() => handleOpenCostsModal(o)}
                                      >
                                        <DollarSign className="size-3.5" />
                                        Custos da OP {o.op_number || `#${o.id.slice(0, 5)}`}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                {archivedAll ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[10px] px-2 gap-1 text-muted-foreground hover:text-foreground"
                                    onClick={() =>
                                      applyArchivedFlag(
                                        orders.map((o) => o.id),
                                        false,
                                      )
                                    }
                                  >
                                    <ArchiveRestore className="size-3" />
                                    Desarquivar
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[10px] px-2 gap-1 text-muted-foreground hover:text-foreground"
                                    onClick={() =>
                                      setArchivingRow({
                                        order,
                                        orders,
                                        label,
                                        summary,
                                        automaticCount,
                                        manualCount,
                                        automaticMaterial,
                                        manualLines,
                                        archivedCount,
                                        archivedAll,
                                      })
                                    }
                                  >
                                    <Archive className="size-3" />
                                    Arquivar
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    },
                  )
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>

        {/* Rodapé com Totais Consolidados */}
        {viewRows.length > 0 && (
          <div className="p-4 bg-slate-100/70 dark:bg-slate-900/90 border-t flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="font-semibold text-slate-700 dark:text-slate-300">
              Totais Consolidados ({viewRows.length} {entityPlural}):
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

      {/* Confirmação antes de arquivar */}
      <AlertDialog open={archivingRow !== null} onOpenChange={(v) => !v && setArchivingRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {viewMode === 'order'
                ? `Arquivar pedido ${archivingRow?.order.order_number || ''}`
                : `Arquivar ${archivingRow?.label || 'OP'}`}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                {viewMode === 'order'
                  ? `Todas as ${archivingRow?.orders.length ?? 0} OP(s) deste pedido serão marcadas como arquivadas e sairão da tabela, dos cards de resumo e dos totais de rentabilidade.`
                  : 'Esta OP sairá da tabela, dos cards de resumo e dos totais de rentabilidade.'}
              </span>
              <span className="block text-xs">
                O arquivamento é apenas visual/financeiro: não cancela, não exclui a OP e não afeta
                o Kanban, gargalos ou qualquer outro fluxo do PCP. É possível desarquivar a qualquer
                momento.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={archivingInProgress}
              onClick={(e) => {
                e.preventDefault()
                if (archivingRow) {
                  applyArchivedFlag(
                    archivingRow.orders.map((o) => o.id),
                    true,
                  )
                }
              }}
            >
              {archivingInProgress ? 'Arquivando...' : 'Arquivar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Modal de Custos do Pedido (nível order_number, sem OP) */}
      {orderLevelCostState && (
        <OrderLevelCostsModal
          open={orderLevelCostOpen}
          onOpenChange={(v) => {
            setOrderLevelCostOpen(v)
            if (!v) setOrderLevelCostState(null)
          }}
          orderNumber={orderLevelCostState.orderNumber}
          representativeOrder={orderLevelCostState.representativeOrder}
          orders={orderLevelCostState.orders}
          onChanged={() => loadData()}
          onOpen={() => loadData()}
        />
      )}
    </div>
  )
}
