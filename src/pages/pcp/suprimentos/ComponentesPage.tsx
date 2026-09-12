import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Boxes,
  Search,
  AlertTriangle,
  Trash2,
  EyeOff,
  Edit2,
  RefreshCw,
  FileSpreadsheet,
  Download,
  Info,
  Filter,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Package,
} from 'lucide-react'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UserActionBadge } from '@/components/UserActionBadge'
import { ProductDossierModal } from './components/ProductDossierModal'
import { EditInventoryItemDialog } from './components/EditInventoryItemDialog'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'
import { cn } from '@/lib/utils'
import pb from '@/lib/pocketbase/client'
import { MasterComponent, Inventory } from '@/types'
import {
  getMasterComponents,
  deactivateMasterComponent,
  checkComponentUsage,
  deleteMasterComponent,
  ComponentUsageCheckResult,
} from '@/services/components'
import { resolveSourceLabel } from '@/lib/duplicate-detector'

export interface ComponentRowItem {
  component: MasterComponent
  inventoryItem?: Inventory
  code: string
  description: string
  unit: string
  sourceLabel: 'Estoque' | 'Catálogo' | 'Histórico' | 'Manual'
  stockQuantity?: number
  hasStock: boolean
  active: boolean
  deactivated_by?: any
  deactivated_at?: string
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200]

export default function ComponentesPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [components, setComponents] = useState<MasterComponent[]>([])
  const [inventory, setInventory] = useState<Inventory[]>([])

  // Filtros de busca e seleção
  const [searchTerm, setSearchTerm] = useState('')
  const [sourceFilter, setSourceFilter] = useState<
    'ALL' | 'Estoque' | 'Catálogo' | 'Histórico' | 'Manual'
  >('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')

  // Paginação
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // Diálogo "Marcar como Inativo"
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false)
  const [itemToDeactivate, setItemToDeactivate] = useState<ComponentRowItem | null>(null)
  const [isDeactivating, setIsDeactivating] = useState(false)

  // Diálogo "Excluir" (com validação estrita de vínculos e dupla confirmação)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<ComponentRowItem | null>(null)
  const [isCheckingUsage, setIsCheckingUsage] = useState(false)
  const [usageCheckResult, setUsageCheckResult] = useState<ComponentUsageCheckResult | null>(null)
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1)
  const [isDeleting, setIsDeleting] = useState(false)

  // Modais de Ficha (Dossiê) e Edição
  const [dossierOpen, setDossierOpen] = useState(false)
  const [dossierItem, setDossierItem] = useState<any>(null)
  const [editInventoryItem, setEditInventoryItem] = useState<{
    id?: string
    componentId?: string
    code: string
    description: string
    quantity?: number
    min_quantity?: number
    unit?: string
    isCatalogOnly?: boolean
  } | null>(null)

  // Carrega componentes com includeInactive = true e todo o inventário
  const loadData = useCallback(
    async (quiet = false) => {
      if (!quiet) setIsLoading(true)
      else setIsRefreshing(true)

      try {
        const [comps, inv] = await Promise.all([
          getMasterComponents('', { includeInactive: true, expand: 'deactivated_by' }),
          pb.collection('inventory').getFullList<Inventory>(),
        ])
        setComponents(comps)
        setInventory(inv)
      } catch (err: any) {
        toast({
          title: 'Erro ao carregar dados',
          description: err.message || 'Não foi possível carregar os materiais do cadastro mestre.',
          variant: 'destructive',
        })
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  // Tempo real para refletir modificações
  useRealtime('components', () => loadData(true))
  useRealtime('inventory', () => loadData(true))

  // Mapeia todos os componentes unificando dados de estoque
  const rowItems = useMemo<ComponentRowItem[]>(() => {
    const invByCompId = new Map<string, Inventory>()
    const invByCode = new Map<string, Inventory>()
    const invByDesc = new Map<string, Inventory>()

    inventory.forEach((inv) => {
      if (inv.component_id) invByCompId.set(inv.component_id, inv)
      if (inv.code) invByCode.set(inv.code.toLowerCase().trim(), inv)
      if (inv.description) invByDesc.set(inv.description.toLowerCase().trim(), inv)
    })

    return components.map((comp) => {
      const inv =
        invByCompId.get(comp.id) ||
        (comp.code ? invByCode.get(comp.code.toLowerCase().trim()) : undefined) ||
        invByDesc.get(comp.description.toLowerCase().trim())

      const hasStock = !!inv && inv.quantity !== undefined && inv.quantity !== null
      const stockQuantity = hasStock ? Number(inv.quantity) || 0 : undefined
      const sourceLabel = resolveSourceLabel(comp.source, hasStock)
      const isActive = comp.active !== false

      return {
        component: comp,
        inventoryItem: inv,
        code: comp.code || inv?.code || '',
        description: comp.description || '',
        unit: comp.unit || inv?.unit || 'un',
        sourceLabel,
        stockQuantity,
        hasStock,
        active: isActive,
        deactivated_by: comp.expand?.deactivated_by,
        deactivated_at: comp.deactivated_at,
      }
    })
  }, [components, inventory])

  // Contadores para cards de métricas
  const metrics = useMemo(() => {
    const total = rowItems.length
    const activeCount = rowItems.filter((it) => it.active).length
    const inactiveCount = total - activeCount
    const withStockCount = rowItems.filter(
      (it) => it.hasStock && (it.stockQuantity || 0) > 0,
    ).length
    const catalogOnlyCount = rowItems.filter(
      (it) => !it.hasStock || (it.stockQuantity || 0) === 0,
    ).length

    return {
      total,
      activeCount,
      inactiveCount,
      withStockCount,
      catalogOnlyCount,
    }
  }, [rowItems])

  // Filtragem da lista
  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()

    return rowItems.filter((item) => {
      // Filtro de situação
      if (statusFilter === 'ACTIVE' && !item.active) return false
      if (statusFilter === 'INACTIVE' && item.active) return false

      // Filtro de origem
      if (sourceFilter !== 'ALL' && item.sourceLabel !== sourceFilter) return false

      // Busca por código e descrição
      if (term) {
        const matchCode = item.code.toLowerCase().includes(term)
        const matchDesc = item.description.toLowerCase().includes(term)
        if (!matchCode && !matchDesc) return false
      }

      return true
    })
  }, [rowItems, searchTerm, sourceFilter, statusFilter])

  // Resetar página quando filtros mudarem
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, sourceFilter, statusFilter, pageSize])

  // Itens paginados
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredItems.slice(start, start + pageSize)
  }, [filteredItems, currentPage, pageSize])

  // -------------------------------------------------------------------------
  // EXPORTAÇÃO CSV
  // Colunas: código, descrição, unidade, origem, saldo, situação
  // -------------------------------------------------------------------------
  const handleExportCsv = () => {
    if (filteredItems.length === 0) {
      toast({
        title: 'Nenhum item para exportar',
        description: 'Os filtros aplicados não retornaram registros.',
        variant: 'destructive',
      })
      return
    }

    const headers = ['Código', 'Descrição', 'Unidade', 'Origem', 'Saldo em Estoque', 'Situação']

    const rows = filteredItems.map((it) => {
      const codeEscaped = `"${(it.code || '').replace(/"/g, '""')}"`
      const descEscaped = `"${(it.description || '').replace(/"/g, '""')}"`
      const unitEscaped = `"${(it.unit || 'un').replace(/"/g, '""')}"`
      const origemEscaped = `"${(it.sourceLabel || '').replace(/"/g, '""')}"`
      const saldoStr =
        it.hasStock && it.stockQuantity !== undefined ? String(it.stockQuantity) : '-'
      const situacao = it.active ? 'Ativo' : 'Inativo'

      return [codeEscaped, descEscaped, unitEscaped, origemEscaped, saldoStr, situacao].join(';')
    })

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const dateStr = new Date().toISOString().slice(0, 10)
    link.href = url
    link.setAttribute('download', `componentes_cadastro_mestre_${dateStr}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'Exportação concluída',
      description: `${filteredItems.length} componente(s) exportado(s) com sucesso.`,
    })
  }

  // -------------------------------------------------------------------------
  // AÇÃO 1: Ficha (ProductDossierModal)
  // -------------------------------------------------------------------------
  const handleOpenDossier = (item: ComponentRowItem) => {
    setDossierItem(item.component)
    setDossierOpen(true)
  }

  // -------------------------------------------------------------------------
  // AÇÃO 2: Editar (EditInventoryItemDialog - Saldo somente leitura)
  // -------------------------------------------------------------------------
  const handleOpenEdit = (item: ComponentRowItem) => {
    const isCatalogOnly = !item.inventoryItem
    setEditInventoryItem({
      id: item.inventoryItem?.id || item.component.id,
      componentId: item.component.id,
      code: item.code,
      description: item.description,
      quantity: item.stockQuantity,
      min_quantity: item.inventoryItem?.min_quantity,
      unit: item.unit,
      isCatalogOnly,
    })
  }

  // -------------------------------------------------------------------------
  // AÇÃO 3: Marcar como Inativo (se estiver ativo)
  // -------------------------------------------------------------------------
  const handleOpenDeactivate = (item: ComponentRowItem) => {
    setItemToDeactivate(item)
    setDeactivateModalOpen(true)
  }

  const handleConfirmDeactivate = async () => {
    if (!itemToDeactivate) return
    if (!user?.id) {
      toast({
        title: 'Usuário não autenticado',
        description: 'Faça login novamente para realizar esta ação.',
        variant: 'destructive',
      })
      return
    }

    setIsDeactivating(true)
    try {
      await deactivateMasterComponent(itemToDeactivate.component.id, user.id)
      toast({
        title: 'Componente inativado',
        description: `O item "${itemToDeactivate.description}" foi marcado como inativo e preservado no histórico.`,
      })
      setDeactivateModalOpen(false)
      setItemToDeactivate(null)
      loadData(true)
    } catch (err: any) {
      toast({
        title: 'Erro ao inativar componente',
        description: err.message || 'Ocorreu um erro durante a inativação.',
        variant: 'destructive',
      })
    } finally {
      setIsDeactivating(false)
    }
  }

  // -------------------------------------------------------------------------
  // AÇÃO 4: Excluir (mesma validação de vínculos da aba Duplicatas)
  // -------------------------------------------------------------------------
  const handleOpenDelete = async (item: ComponentRowItem) => {
    setItemToDelete(item)
    setDeleteModalOpen(true)
    setDeleteStep(1)
    setIsCheckingUsage(true)
    setUsageCheckResult(null)

    try {
      const result = await checkComponentUsage(item.component)
      setUsageCheckResult(result)
    } catch (err: any) {
      toast({
        title: 'Erro ao validar vínculos',
        description: err.message || 'Não foi possível verificar os vínculos do componente.',
        variant: 'destructive',
      })
    } finally {
      setIsCheckingUsage(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return
    if (!user?.id) {
      toast({
        title: 'Usuário não autenticado',
        description: 'Faça login novamente para realizar esta ação.',
        variant: 'destructive',
      })
      return
    }

    setIsDeleting(true)
    try {
      await deleteMasterComponent(itemToDelete.component, {
        id: user.id,
        name: user.name,
        email: user.email,
      })
      toast({
        title: 'Item excluído com sucesso',
        description: `O registro "${itemToDelete.description}" foi removido do cadastro mestre.`,
      })
      setDeleteModalOpen(false)
      setItemToDelete(null)
      setDeleteStep(1)
      loadData(true)
    } catch (err: any) {
      toast({
        title: 'Exclusão bloqueada ou erro',
        description: err.message || 'Não foi possível concluir a exclusão.',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <SuprimentosHeader
        title="Cadastro Mestre de Componentes"
        description="Listagem completa e unificada de todos os componentes do sistema: itens com estoque, só catálogo, do histórico e manuais, ativos e inativos."
        icon={Boxes}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={isLoading || filteredItems.length === 0}
              className="text-xs"
              title="Exportar listagem filtrada para arquivo CSV"
            >
              <Download className="size-3.5 mr-1.5 text-blue-600" />
              Exportar CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData(true)}
              disabled={isLoading || isRefreshing}
              className="text-xs"
            >
              <RefreshCw className={cn('size-3.5 mr-1.5', isRefreshing && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        }
      />

      {/* CARDS DE RESUMO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total no Cadastro Mestre
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-blue-600">{metrics.total}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Todos os registros da coleção components
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Situação Cadastral
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600">{metrics.activeCount}</span>
              <span className="text-xs text-muted-foreground">ativos</span>
              <span className="text-muted-foreground/40">/</span>
              <span className="text-lg font-bold text-amber-600">{metrics.inactiveCount}</span>
              <span className="text-xs text-muted-foreground">inativos</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Histórico preservado sem perdas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Com Saldo em Estoque
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-emerald-600">{metrics.withStockCount}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Itens com quantidade física positiva vinculada
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Catálogo / Sem Estoque
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-slate-700 dark:text-slate-300">
              {metrics.catalogOnlyCount}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Itens técnicos de catálogo, históricos ou manuais
            </p>
          </CardContent>
        </Card>
      </div>

      {/* BARRA DE FILTROS E BUSCA */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Busca por código e descrição */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-8"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                title="Limpar busca"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filtro por Origem */}
          <div className="w-full sm:w-[170px]">
            <Select value={sourceFilter} onValueChange={(val: any) => setSourceFilter(val)}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-xs">
                  Origem: Todas
                </SelectItem>
                <SelectItem value="Estoque" className="text-xs">
                  Estoque
                </SelectItem>
                <SelectItem value="Catálogo" className="text-xs">
                  Catálogo
                </SelectItem>
                <SelectItem value="Histórico" className="text-xs">
                  Histórico
                </SelectItem>
                <SelectItem value="Manual" className="text-xs">
                  Manual
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filtro por Situação */}
          <div className="w-full sm:w-[170px]">
            <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-xs">
                  Situação: Todas
                </SelectItem>
                <SelectItem value="ACTIVE" className="text-xs">
                  Ativos
                </SelectItem>
                <SelectItem value="INACTIVE" className="text-xs">
                  Inativos
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Indicador de registros filtrados */}
        <div className="text-xs text-muted-foreground flex items-center gap-2 self-start md:self-center">
          <Filter className="size-3.5" />
          <span>
            Exibindo <strong>{filteredItems.length}</strong> de <strong>{rowItems.length}</strong>{' '}
            componente(s)
          </span>
        </div>
      </div>

      {/* TABELA DE COMPONENTES */}
      <Card className="border shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-100/60 dark:bg-slate-800/40">
              <TableRow>
                <TableHead className="w-[140px] text-xs">Código</TableHead>
                <TableHead className="text-xs">Descrição</TableHead>
                <TableHead className="w-[80px] text-xs text-center">Unidade</TableHead>
                <TableHead className="w-[110px] text-xs text-center">Origem</TableHead>
                <TableHead className="w-[120px] text-xs text-right">Saldo em Estoque</TableHead>
                <TableHead className="w-[110px] text-xs text-center">Situação</TableHead>
                <TableHead className="w-[200px] text-xs">Rastreabilidade</TableHead>
                <TableHead className="w-[230px] text-xs text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                    <RefreshCw className="size-6 animate-spin mx-auto mb-2 text-blue-600" />
                    <p className="text-xs">Carregando componentes do cadastro mestre...</p>
                  </TableCell>
                </TableRow>
              ) : paginatedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    <Package className="size-10 mx-auto mb-2 text-slate-400" />
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Nenhum componente encontrado
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {searchTerm || sourceFilter !== 'ALL' || statusFilter !== 'ALL'
                        ? 'Tente ajustar os filtros ou o termo de busca.'
                        : 'Nenhum registro encontrado no cadastro mestre.'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedItems.map((item) => {
                  const isInactive = !item.active
                  const code = item.code || '-'
                  const hasStock = item.hasStock && item.stockQuantity !== undefined

                  return (
                    <TableRow
                      key={item.component.id}
                      className={cn(
                        'transition-colors',
                        isInactive
                          ? 'bg-slate-100/60 dark:bg-slate-900/40 text-muted-foreground opacity-85'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                      )}
                    >
                      {/* Código */}
                      <TableCell className="font-mono text-xs font-semibold">
                        <span
                          className={cn(
                            code.startsWith('REF-')
                              ? 'text-amber-600 dark:text-amber-400'
                              : code !== '-'
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-slate-400',
                          )}
                        >
                          {code}
                        </span>
                      </TableCell>

                      {/* Descrição */}
                      <TableCell className="text-xs">
                        <p
                          className={cn(
                            'font-medium text-slate-900 dark:text-slate-100 leading-snug',
                            isInactive && 'line-through text-slate-500',
                          )}
                          title={item.description}
                        >
                          {item.description}
                        </p>
                      </TableCell>

                      {/* Unidade */}
                      <TableCell className="text-center text-xs uppercase text-muted-foreground">
                        {item.unit || 'un'}
                      </TableCell>

                      {/* Origem */}
                      <TableCell className="text-center text-xs">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] font-normal',
                            item.sourceLabel === 'Estoque' &&
                              'border-emerald-300 text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20',
                            item.sourceLabel === 'Catálogo' &&
                              'border-blue-300 text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/20',
                            item.sourceLabel === 'Histórico' &&
                              'border-purple-300 text-purple-700 dark:text-purple-300 bg-purple-50/50 dark:bg-purple-950/20',
                            item.sourceLabel === 'Manual' &&
                              'border-slate-300 text-slate-700 dark:text-slate-300',
                          )}
                        >
                          {item.sourceLabel}
                        </Badge>
                      </TableCell>

                      {/* Saldo em Estoque */}
                      <TableCell className="text-right text-xs">
                        {hasStock ? (
                          (item.stockQuantity || 0) > 0 ? (
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {item.stockQuantity} {item.unit}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0 {item.unit}</span>
                          )
                        ) : (
                          <span
                            className="text-slate-400 dark:text-slate-600"
                            title="Item sem cadastro de saldo físico em estoque"
                          >
                            —
                          </span>
                        )}
                      </TableCell>

                      {/* Situação */}
                      <TableCell className="text-center text-xs">
                        {item.active ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300"
                          >
                            Ativo
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium"
                          >
                            <EyeOff className="size-3 mr-1" /> Inativo
                          </Badge>
                        )}
                      </TableCell>

                      {/* Rastreabilidade (UserActionBadge de quem editou / inativou) */}
                      <TableCell className="text-xs">
                        {item.deactivated_by || item.deactivated_at ? (
                          <UserActionBadge
                            user={item.deactivated_by}
                            date={item.deactivated_at}
                            prefix="inativado por"
                            showTime={true}
                            compact={true}
                            fallbackText="Inativado"
                          />
                        ) : item.component.updated &&
                          item.component.updated !== item.component.created ? (
                          <UserActionBadge
                            date={item.component.updated}
                            prefix="editado"
                            showTime={false}
                            compact={true}
                            fallbackText="Atualizado"
                          />
                        ) : item.component.created ? (
                          <UserActionBadge
                            date={item.component.created}
                            prefix="criado"
                            showTime={false}
                            compact={true}
                          />
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>

                      {/* Ações por linha */}
                      <TableCell className="text-center text-xs">
                        <div className="flex items-center justify-center gap-1">
                          {/* Ficha (ProductDossierModal) */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                            onClick={() => handleOpenDossier(item)}
                            title="Ver Ficha / Dossiê do Componente"
                          >
                            <FileSpreadsheet className="size-3 mr-1" /> Ficha
                          </Button>

                          {/* Editar (EditInventoryItemDialog - saldo não editável) */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => handleOpenEdit(item)}
                            title="Editar dados cadastrais do item"
                          >
                            <Edit2 className="size-3 mr-1" /> Editar
                          </Button>

                          {/* Inativar (se ativo) */}
                          {item.active && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/50"
                              onClick={() => handleOpenDeactivate(item)}
                              title="Marcar componente como inativo"
                            >
                              <EyeOff className="size-3 mr-1" /> Inativar
                            </Button>
                          )}

                          {/* Excluir (mesma validação de vínculos) */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                            onClick={() => handleOpenDelete(item)}
                            title="Excluir componente do cadastro mestre (revalida vínculos)"
                          >
                            <Trash2 className="size-3 mr-1" /> Excluir
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>

        {/* CONTROLES DE PAGINAÇÃO */}
        {filteredItems.length > 0 && (
          <div className="p-3 border-t bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Itens por página:</span>
              <Select value={String(pageSize)} onValueChange={(val) => setPageSize(Number(val))}>
                <SelectTrigger className="w-[75px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={String(opt)} className="text-xs">
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>
                Mostrando{' '}
                <strong>
                  {Math.min((currentPage - 1) * pageSize + 1, filteredItems.length)}-
                  {Math.min(currentPage * pageSize, filteredItems.length)}
                </strong>{' '}
                de <strong>{filteredItems.length}</strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                title="Página anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="px-2">
                Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
              </span>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                title="Próxima página"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* =========================================================================
          MODAL: Marcar como Inativo (Confirmação com Rastreabilidade)
         ========================================================================= */}
      <Dialog open={deactivateModalOpen} onOpenChange={setDeactivateModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <EyeOff className="size-5" /> Confirmar Inativação do Componente
            </DialogTitle>
            <DialogDescription>
              O componente continuará registrado para manter a integridade de ordens de produção,
              movimentações e histórico de compras, mas deixará de aparecer em buscas ativas.
            </DialogDescription>
          </DialogHeader>

          {itemToDeactivate && (
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-md border space-y-2 text-xs">
              <div>
                <span className="font-bold text-slate-500 uppercase text-[10px] block">Código</span>
                <span className="font-mono font-semibold text-blue-600">
                  {itemToDeactivate.code || '-'}
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-500 uppercase text-[10px] block">
                  Descrição
                </span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {itemToDeactivate.description}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground border-t">
                <span>
                  Saldo em Estoque:{' '}
                  {itemToDeactivate.hasStock && itemToDeactivate.stockQuantity !== undefined
                    ? `${itemToDeactivate.stockQuantity} ${itemToDeactivate.unit}`
                    : 'Sem estoque vinculado'}
                </span>
                <span>Origem: {itemToDeactivate.sourceLabel}</span>
              </div>
              <div className="pt-1 text-[11px] text-slate-500 border-t">
                Ação será assinada por: <strong>{user?.name || user?.email}</strong>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeactivateModalOpen(false)}
              disabled={isDeactivating}
            >
              Cancelar
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleConfirmDeactivate}
              disabled={isDeactivating}
            >
              {isDeactivating ? 'Inativando...' : 'Marcar como Inativo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          MODAL: Excluir (com Revalidação Estrita de Vínculos e Dupla Confirmação)
         ========================================================================= */}
      <Dialog
        open={deleteModalOpen}
        onOpenChange={(open) => {
          if (!isDeleting) {
            setDeleteModalOpen(open)
            if (!open) {
              setItemToDelete(null)
              setUsageCheckResult(null)
              setDeleteStep(1)
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="size-5" /> Exclusão Segura de Componente
            </DialogTitle>
            <DialogDescription>
              Validação estrita de integridade referencial em tempo real no servidor.
            </DialogDescription>
          </DialogHeader>

          {itemToDelete && (
            <div className="space-y-4 text-xs">
              {/* Resumo do item */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-md border space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-blue-600">
                    {itemToDelete.code || 'SEM CÓDIGO'}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {itemToDelete.sourceLabel}
                  </Badge>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  {itemToDelete.description}
                </p>
              </div>

              {/* Estado da checagem de vínculos */}
              {isCheckingUsage ? (
                <div className="flex items-center justify-center p-6 gap-2 text-muted-foreground">
                  <RefreshCw className="size-4 animate-spin text-blue-600" />
                  <span>Verificando vínculos (estoque, compras, OPs, catálogo)...</span>
                </div>
              ) : usageCheckResult ? (
                !usageCheckResult.canDelete ? (
                  // BLOQUEIO COM EXPLICAÇÃO COMPLETA
                  <div className="bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-md p-4 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="size-5 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-red-800 dark:text-red-300 text-sm">
                          Exclusão Bloqueada — Item possui vínculos ativos
                        </h4>
                        <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                          Para preservar a integridade dos dados, este item não pode ser excluído
                          pois está referenciado em outros módulos:
                        </p>
                      </div>
                    </div>

                    <ul className="list-disc pl-6 space-y-1 text-xs text-red-800 dark:text-red-300">
                      {usageCheckResult.reasons.map((reason, idx) => (
                        <li key={idx} className="leading-tight">
                          {reason}
                        </li>
                      ))}
                    </ul>

                    <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded border border-red-200 dark:border-red-900/50 text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Info className="size-4 text-blue-600 shrink-0" />
                      <span>
                        <strong>Recomendação:</strong> Utilize a ação{' '}
                        <strong>&ldquo;Marcar como Inativo&rdquo;</strong> para manter o histórico
                        sem poluir novas consultas.
                      </span>
                    </div>
                  </div>
                ) : (
                  // SEM VÍNCULOS: PERMITIR DUPLA CONFIRMAÇÃO
                  <div className="space-y-3">
                    <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-md p-3 text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                      <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <strong className="block font-semibold">Nenhum vínculo encontrado.</strong>
                        Este item não possui movimentações, compras, vínculos com OPs nem uso em
                        produtos do catálogo. A exclusão definitiva é segura.
                      </div>
                    </div>

                    {deleteStep === 2 && (
                      <div className="bg-red-50 dark:bg-red-950/50 border border-red-400 rounded-md p-3 text-xs text-red-700 dark:text-red-300 space-y-2">
                        <p className="font-bold">Segunda Confirmação Obrigatória:</p>
                        <p>
                          Tem absoluta certeza de que deseja apagar definitivamente o registro do
                          cadastro mestre? Esta ação não pode ser desfeita.
                        </p>
                        <p className="text-[11px] text-muted-foreground pt-1 border-t border-red-200 dark:border-red-900">
                          Ação será registrada na auditoria do sistema em nome de:{' '}
                          <strong>{user?.name || user?.email}</strong>.
                        </p>
                      </div>
                    )}
                  </div>
                )
              ) : null}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteModalOpen(false)}
              disabled={isDeleting}
            >
              Fechar
            </Button>

            {usageCheckResult &&
              !usageCheckResult.canDelete &&
              itemToDelete &&
              itemToDelete.active && (
                <Button
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => {
                    setDeleteModalOpen(false)
                    handleOpenDeactivate(itemToDelete)
                  }}
                >
                  <EyeOff className="size-4 mr-1.5" /> Marcar como Inativo
                </Button>
              )}

            {usageCheckResult && usageCheckResult.canDelete && (
              <>
                {deleteStep === 1 ? (
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteStep(2)}
                    disabled={isCheckingUsage || isDeleting}
                  >
                    Avançar para Exclusão
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    className="bg-red-700 hover:bg-red-800"
                    onClick={handleConfirmDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Excluindo...' : 'Confirmar e Excluir Definitivamente'}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          MODAIS AUXILIARES: Dossiê (Ficha) e Edição de Item
         ========================================================================= */}
      <ProductDossierModal
        open={dossierOpen}
        onOpenChange={setDossierOpen}
        initialProduct={dossierItem}
      />

      <EditInventoryItemDialog
        item={editInventoryItem}
        open={!!editInventoryItem}
        onOpenChange={(open) => {
          if (!open) setEditInventoryItem(null)
        }}
        onSaved={() => loadData(true)}
      />
    </div>
  )
}
