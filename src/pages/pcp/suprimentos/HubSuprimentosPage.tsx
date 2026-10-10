import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ClipboardList,
  Plus,
  Copy,
  Check,
  Tag,
  Layers,
  ShoppingBag,
  ShoppingCart,
  Loader2,
  AlertCircle,
  Search,
  ArrowRight,
  Inbox,
  Tags,
  History,
  TrendingUp,
} from 'lucide-react'
import { MaterialShortage, PcpOrder, ComponentCategory, MasterComponent } from '@/types'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { TriageTable } from './components/TriageTable'
import { CloseResidualDialog } from './components/CloseResidualDialog'
import { CotacoesTable } from './components/CotacoesTable'
import {
  getStockAvailabilityForCodes,
  ComponentStockAvailability,
  normalizeCode,
} from '@/services/material-reservations'
import { releaseShortageFromStock, releaseGroupFromStock } from '@/services/stock-release'
import { ProductDossierModal } from './components/ProductDossierModal'
import { ProductSearchBar } from './components/ProductSearchBar'
import { TriageDetailDialog } from './components/TriageDetailDialog'
import { TriageGroupDetailDialog } from './components/TriageGroupDetailDialog'
import { TriageDialog } from './components/TriageDialog'
import { CategoryFilterChips } from './components/CategoryFilterChips'
import { ShortageGroup } from '@/lib/shortage-grouping'
import { NewShortageModal } from '@/pages/pcp/components/NewShortageModal'
import { useShortageStore } from '@/stores/useShortageStore'
import { useToast } from '@/hooks/use-toast'
import { useNewRequests } from '@/hooks/use-new-requests'
import { useViewedItems } from '@/hooks/use-viewed-items'
import { extractFieldErrors } from '@/lib/pocketbase/errors'
import { getMasterComponents } from '@/services/components'
import { getComponentCategories } from '@/services/component-categories'
import { useCategoryGroups } from '@/hooks/use-category-groups'
import {
  advanceGroupToCompra,
  advanceGroupToCompraWithSurplus,
  sendDirectToCompra,
} from '@/services/quotations'
import { formatQuantity, cn } from '@/lib/utils'
import { NoTranslate } from '@/components/NoTranslate'
import { format, parseISO } from 'date-fns'
import { toast as sonnerToast } from 'sonner'

export default function HubSuprimentosPage() {
  const [activeTab, setActiveTab] = useState<'fila' | 'cotacoes' | 'historico'>('fila')
  const [modalOpen, setModalOpen] = useState(false)
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [components, setComponents] = useState<MasterComponent[]>([])
  const [categories, setCategories] = useState<ComponentCategory[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [groupedByCategory, setGroupedByCategory] = useState(true)
  const [availabilityMap, setAvailabilityMap] = useState<Map<string, ComponentStockAvailability>>(
    new Map(),
  )

  // Diálogos de Fila / Triagem
  const [selectedItem, setSelectedItem] = useState<MaterialShortage | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<ShortageGroup | null>(null)

  // Diálogo de Cotação direta (TriageDialog / EnhancedQuotationForm)
  const [quotationDialogOpen, setQuotationDialogOpen] = useState(false)
  const [quotationItem, setQuotationItem] = useState<MaterialShortage | null>(null)
  const [quotationGroupItems, setQuotationGroupItems] = useState<MaterialShortage[]>([])

  // Dossiê do produto
  const [dossierOpen, setDossierOpen] = useState(false)
  const [dossierItem, setDossierItem] = useState<MaterialShortage | null>(null)

  // Atribuição de fornecedor em lote na Fila
  const [batchSupplierOpen, setBatchSupplierOpen] = useState(false)
  const [batchSupplierValue, setBatchSupplierValue] = useState('')
  const [supplierSuggestions, setSupplierSuggestions] = useState<string[]>([])

  // Filtros
  const [opFilter, setOpFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [orders, setOrders] = useState<PcpOrder[]>([])

  // Confirmação de envio direto para Compras da Fila
  const [confirmComprasOpen, setConfirmComprasOpen] = useState(false)
  const [sendingCompras, setSendingCompras] = useState(false)

  // Confirmação rápida de Liberação do Estoque (1 clique)
  const [releasingItem, setReleasingItem] = useState<MaterialShortage | null>(null)
  const [releasingGroup, setReleasingGroup] = useState<ShortageGroup | null>(null)
  const [releasingBatchSelection, setReleasingBatchSelection] = useState(false)
  const [confirmReleaseOpen, setConfirmReleaseOpen] = useState(false)
  const [releasingLoading, setReleasingLoading] = useState(false)

  // Diálogo de encerramento de saldo residual
  const [closeResidualOpen, setCloseResidualOpen] = useState(false)

  // Estado da aba Cotações
  const [cotacoesSelectedIds, setCotacoesSelectedIds] = useState<Set<string>>(new Set())
  const [cotacoesCopied, setCotacoesCopied] = useState(false)
  const [cotacoesGrouped, setCotacoesGrouped] = useState(false)
  const [advancingBatch, setAdvancingBatch] = useState(false)

  // Hooks & Stores
  const { toast } = useToast()
  const setAvailableIds = useShortageStore((s) => s.setAvailableIds)
  const filaSelectedIds = useShortageStore((s) => s.selectedIds)
  const toggleMultiple = useShortageStore((s) => s.toggleMultiple)
  const clearFilaSelection = useShortageStore((s) => s.clear)
  const { markAsViewed } = useNewRequests()
  const { isNew: isCotacaoNew, markAsViewed: markCotacaoAsViewed } = useViewedItems('hub_cotacoes')

  const fetchData = async () => {
    try {
      const [shortRes, compRes, catRes] = await Promise.all([
        pb.collection('material_shortages').getFullList<MaterialShortage>({
          sort: '-created',
          expand: 'order_id,order_id.product_id,requested_by',
        }),
        getMasterComponents('', { includeInactive: true, expand: 'category' }),
        getComponentCategories(),
      ])
      setShortages(shortRes)
      setComponents(compRes)
      setCategories(catRes)

      // Atualizar disponibilidades de estoque para os códigos em aberto
      const codes = Array.from(
        new Set(
          shortRes
            .filter((s) => s.status === 'Pendente' || s.status === 'Cotação')
            .map((s) => normalizeCode(s.code))
            .filter(Boolean),
        ),
      )
      if (codes.length > 0) {
        getStockAvailabilityForCodes(codes)
          .then(setAvailabilityMap)
          .catch(() => {})
      }
    } catch {
      /* intentionally ignored */
    }
  }

  useEffect(() => {
    fetchData()
    pb.collection('pcp_orders')
      .getFullList<PcpOrder>({ sort: '-created' })
      .then(setOrders)
      .catch(() => {})
    return () => clearFilaSelection()
  }, [clearFilaSelection])

  useRealtime('material_shortages', fetchData)
  useRealtime('components', fetchData)
  useRealtime('component_categories', fetchData)

  // ----------------------------------------------------
  // CONTAGENS DE TOPO (KPIs / Abas)
  // ----------------------------------------------------
  const counts = useMemo(() => {
    const pendentes = shortages.filter((s) => s.status === 'Pendente').length
    const cotacoes = shortages.filter((s) => s.status === 'Cotação').length
    const historico = shortages.filter((s) =>
      ['Compra', 'Liberado_Estoque', 'Recebido_Parcial', 'Recebido', 'Cancelado'].includes(
        s.status,
      ),
    ).length
    return { pendentes, cotacoes, historico }
  }, [shortages])

  // ----------------------------------------------------
  // ABA 1: FILA DE ENTRADA & TRIAGEM (Pendentes)
  // ----------------------------------------------------
  const allPendingItems = useMemo(() => {
    return shortages.filter((s) => {
      if (s.status !== 'Pendente') return false
      if (opFilter !== 'all' && s.order_id !== opFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const code = s.code?.toLowerCase() || ''
        const desc = s.description?.toLowerCase() || ''
        const order = s.expand?.order_id?.order_number?.toLowerCase() || ''
        const op = s.expand?.order_id?.op_number?.toLowerCase() || ''
        const req = s.expand?.requested_by?.name?.toLowerCase() || ''
        if (
          !code.includes(q) &&
          !desc.includes(q) &&
          !order.includes(q) &&
          !op.includes(q) &&
          !req.includes(q)
        ) {
          return false
        }
      }
      return true
    })
  }, [shortages, opFilter, searchQuery])

  const pendingCategoryGroups = useCategoryGroups(allPendingItems, components, categories)

  const triagemItems = useMemo(() => {
    if (selectedCategoryId === null) return allPendingItems
    const activeGroup = pendingCategoryGroups.find((g) => g.categoryId === selectedCategoryId)
    return activeGroup ? activeGroup.items : []
  }, [allPendingItems, selectedCategoryId, pendingCategoryGroups])

  const filaSelectedIdsSet = useMemo(() => new Set(filaSelectedIds), [filaSelectedIds])

  useEffect(() => {
    if (activeTab === 'fila') {
      setAvailableIds(triagemItems.map((i) => i.id))
    }
  }, [triagemItems, setAvailableIds, activeTab])

  const handleSelectFilaCategoryItems = (ids: string[]) => {
    const allSelected = ids.every((id) => filaSelectedIds.includes(id))
    if (allSelected) {
      toggleMultiple(ids)
    } else {
      const missing = ids.filter((id) => !filaSelectedIds.includes(id))
      toggleMultiple(missing)
    }
  }

  const handleFilaRowClick = (item: MaterialShortage) => {
    markAsViewed(item.id)
    setSelectedItem(item)
  }

  const handleFilaGroupClick = (group: ShortageGroup) => {
    group.items.forEach((it) => markAsViewed(it.id))
    setSelectedGroup(group)
  }

  // ----------------------------------------------------
  // ETAPA 3: AÇÕES DE 1 CLIQUE: LIBERAR DO ESTOQUE
  // ----------------------------------------------------
  const handlePromptReleaseItem = (item: MaterialShortage) => {
    setReleasingItem(item)
    setReleasingGroup(null)
    setReleasingBatchSelection(false)
    setConfirmReleaseOpen(true)
  }

  const handlePromptReleaseGroup = (group: ShortageGroup) => {
    setReleasingItem(null)
    setReleasingGroup(group)
    setReleasingBatchSelection(false)
    setConfirmReleaseOpen(true)
  }

  const handlePromptReleaseSelected = () => {
    if (filaSelectedShortages.length === 0) return
    setReleasingItem(null)
    setReleasingGroup(null)
    setReleasingBatchSelection(true)
    setConfirmReleaseOpen(true)
  }

  const handleExecuteReleaseConfirm = async () => {
    setReleasingLoading(true)
    try {
      if (releasingItem) {
        await releaseShortageFromStock(releasingItem)
        toast({
          title: 'Material liberado do estoque',
          description: `Solicitação baixada do almoxarifado (${formatQuantity(releasingItem.quantity)} un) e movida para o Histórico.`,
        })
      } else if (releasingGroup) {
        const res = await releaseGroupFromStock(releasingGroup.items)
        if (res.successCount > 0) {
          toast({
            title: 'Lote liberado do estoque',
            description: `${res.successCount} de ${releasingGroup.items.length} solicitações liberadas (${res.totalReleased} un baixadas do almoxarifado).${res.failCount > 0 ? ` ${res.failCount} itens sem saldo permaneceram na fila.` : ''}`,
          })
        } else {
          toast({
            title: 'Não foi possível liberar',
            description: res.results[0]?.error || 'Saldo insuficiente.',
            variant: 'destructive',
          })
        }
      } else if (releasingBatchSelection) {
        const res = await releaseGroupFromStock(filaSelectedShortages)
        if (res.successCount > 0) {
          toast({
            title: 'Itens selecionados liberados do estoque',
            description: `${res.successCount} solicitações liberadas com saída no almoxarifado (${res.totalReleased} un baixadas).${res.failCount > 0 ? ` ${res.failCount} itens sem saldo suficiente mantidos na fila.` : ''}`,
          })
          clearFilaSelection()
        } else {
          toast({
            title: 'Nenhum item liberado',
            description: res.results[0]?.error || 'Saldo insuficiente no almoxarifado.',
            variant: 'destructive',
          })
        }
      }

      setConfirmReleaseOpen(false)
      setReleasingItem(null)
      setReleasingGroup(null)
      setReleasingBatchSelection(false)
      fetchData()
    } catch (err: any) {
      toast({
        title: 'Erro ao liberar do estoque',
        description: err.message || 'Falha ao processar movimentação de saída.',
        variant: 'destructive',
      })
    } finally {
      setReleasingLoading(false)
    }
  }

  const handleOpenDirectQuotation = (item: MaterialShortage, groupItems?: MaterialShortage[]) => {
    setQuotationItem(item)
    setQuotationGroupItems(groupItems && groupItems.length > 0 ? groupItems : [item])
    setQuotationDialogOpen(true)
  }

  const handleCopyFilaQuotation = () => {
    const items = shortages.filter((s) => filaSelectedIds.includes(s.id))
    if (items.length === 0) return

    const consolidatedMap = new Map<
      string,
      { code: string; description: string; totalQty: number }
    >()
    for (const item of items) {
      const key = (item.code || item.description).trim().toLowerCase()
      const existing = consolidatedMap.get(key)
      if (existing) {
        existing.totalQty += Number(item.quantity) || 0
      } else {
        consolidatedMap.set(key, {
          code: item.code || '',
          description: item.description,
          totalQty: Number(item.quantity) || 0,
        })
      }
    }

    const textLines = Array.from(consolidatedMap.values()).map((c) =>
      c.code ? `${c.totalQty}x ${c.code} - ${c.description}` : `${c.totalQty}x ${c.description}`,
    )

    navigator.clipboard.writeText(textLines.join('\n'))
    toast({
      title: 'Copiado!',
      description: `Lista consolidada copiada (${consolidatedMap.size} item(ns), ${items.length} registro(s)).`,
    })
    clearFilaSelection()
  }

  const filaSelectedShortages = useMemo(() => {
    if (filaSelectedIds.length === 0) return []
    const set = new Set(filaSelectedIds)
    return shortages.filter((s) => set.has(s.id))
  }, [shortages, filaSelectedIds])

  const filaSelectedGroupsSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string
        code: string
        description: string
        items: MaterialShortage[]
        totalQty: number
      }
    >()

    for (const item of filaSelectedShortages) {
      const codeKey = (item.code || '').trim().toLowerCase()
      const descKey = (item.description || '').trim().toLowerCase()
      const key = codeKey ? `code:${codeKey}` : `desc:${descKey}`

      const existing = map.get(key)
      if (existing) {
        existing.items.push(item)
        existing.totalQty += Number(item.quantity) || 0
      } else {
        map.set(key, {
          key,
          code: item.code || '',
          description: item.description,
          items: [item],
          totalQty: Number(item.quantity) || 0,
        })
      }
    }

    return Array.from(map.values())
  }, [filaSelectedShortages])

  const totalFilaSelectedUnits = useMemo(() => {
    return filaSelectedShortages.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0)
  }, [filaSelectedShortages])

  const handleSendFilaComprasConfirm = async () => {
    if (filaSelectedShortages.length === 0) return
    setSendingCompras(true)
    const today = new Date().toISOString().split('T')[0]

    try {
      for (const group of filaSelectedGroupsSummary) {
        if (group.items.length >= 2) {
          const ids = group.items.map((it) => it.id)
          const batchId = `lote_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
          await advanceGroupToCompra(ids, undefined, batchId)
        } else {
          const single = group.items[0]
          await sendDirectToCompra(single.id, {
            purchase_date: today,
            ...(single.supplier ? { supplier: single.supplier } : {}),
          })
        }
      }

      toast({
        title: 'Enviado para compras',
        description: `${filaSelectedShortages.length} solicitação(ões) (${formatQuantity(totalFilaSelectedUnits)} un) enviada(s) direto para Compras.`,
      })

      setConfirmComprasOpen(false)
      clearFilaSelection()
      fetchData()
    } catch (err: any) {
      const errors = extractFieldErrors(err)
      toast({
        title: 'Erro ao enviar para compras',
        description:
          Object.values(errors).join(' ') ||
          err.message ||
          'Falha ao processar envio para compras.',
        variant: 'destructive',
      })
    } finally {
      setSendingCompras(false)
    }
  }

  const fetchSupplierSuggestions = async () => {
    try {
      const res = await pb.collection('material_shortages').getFullList({ fields: 'supplier' })
      setSupplierSuggestions(
        Array.from(new Set(res.map((r: any) => r.supplier).filter(Boolean))) as string[],
      )
    } catch {
      /* intentionally ignored */
    }
  }

  const handleBatchSupplier = async () => {
    if (!batchSupplierValue.trim()) {
      toast({ title: 'Erro', description: 'Informe um fornecedor', variant: 'destructive' })
      return
    }
    try {
      for (const id of filaSelectedIds)
        await pb
          .collection('material_shortages')
          .update(id, { supplier: batchSupplierValue.trim() })
      toast({
        title: 'Fornecedor atribuído',
        description: `${filaSelectedIds.length} item(s) atualizado(s).`,
      })
      setBatchSupplierOpen(false)
      setBatchSupplierValue('')
      clearFilaSelection()
    } catch (err: any) {
      const errors = extractFieldErrors(err)
      toast({
        title: 'Erro',
        description: Object.values(errors).join(' ') || err.message || 'Falha ao atribuir.',
        variant: 'destructive',
      })
    }
  }

  // ----------------------------------------------------
  // ABA 2: EM COTAÇÃO (Status = 'Cotação')
  // ----------------------------------------------------
  const normalizeText = (text: string | undefined | null): string =>
    (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

  const allCotacaoItems = useMemo(() => {
    return shortages.filter((s) => s.status === 'Cotação')
  }, [shortages])

  const cotacaoCategoryGroups = useCategoryGroups(allCotacaoItems, components, categories)

  const filteredCotacaoItems = useMemo(() => {
    let items = allCotacaoItems

    if (selectedCategoryId !== null && activeTab === 'cotacoes') {
      const activeGroup = cotacaoCategoryGroups.find((g) => g.categoryId === selectedCategoryId)
      items = activeGroup ? activeGroup.items : []
    }

    if (opFilter !== 'all') {
      items = items.filter((s) => s.order_id === opFilter)
    }

    const query = normalizeText(searchQuery.trim())
    if (!query) return items
    return items.filter((item) => {
      const productName =
        normalizeText(item.expand?.order_id?.expand?.product_id?.name) ||
        normalizeText(item.expand?.order_id?.manual_product_name)
      const requesterName = normalizeText(item.expand?.requested_by?.name)
      const orderNumber = normalizeText(item.expand?.order_id?.order_number)
      const opNumber = normalizeText(item.expand?.order_id?.op_number)
      const code = normalizeText(item.code)
      const desc = normalizeText(item.description)
      return (
        productName.includes(query) ||
        requesterName.includes(query) ||
        orderNumber.includes(query) ||
        opNumber.includes(query) ||
        code.includes(query) ||
        desc.includes(query)
      )
    })
  }, [allCotacaoItems, selectedCategoryId, activeTab, cotacaoCategoryGroups, opFilter, searchQuery])

  const handleCotacaoRowClick = (item: MaterialShortage, groupItems?: MaterialShortage[]) => {
    markCotacaoAsViewed(item.id)
    handleOpenDirectQuotation(item, groupItems)
  }

  const toggleCotacaoSelect = (id: string) => {
    setCotacoesSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCotacaoSelectAll = () => {
    if (cotacoesSelectedIds.size === filteredCotacaoItems.length) {
      setCotacoesSelectedIds(new Set())
    } else {
      setCotacoesSelectedIds(new Set(filteredCotacaoItems.map((i) => i.id)))
    }
  }

  const toggleCotacaoSelectGroup = (ids: string[]) => {
    setCotacoesSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = ids.every((id) => next.has(id))
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const handleSelectCotacaoCategoryItems = (ids: string[]) => {
    setCotacoesSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = ids.every((id) => next.has(id))
      if (allSelected) {
        ids.forEach((id) => next.delete(id))
      } else {
        ids.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const handleBatchAdvanceToCompra = async () => {
    if (cotacoesSelectedIds.size === 0) return
    setAdvancingBatch(true)
    try {
      const selectedItems = shortages.filter((s) => cotacoesSelectedIds.has(s.id))
      const codeMap = new Map<string, MaterialShortage[]>()

      for (const item of selectedItems) {
        const codeKey = (item.code || '').trim().toLowerCase()
        const descKey = (item.description || '').trim().toLowerCase()
        const key = codeKey ? `code:${codeKey}` : `desc:${descKey}`

        const existing = codeMap.get(key)
        if (existing) {
          existing.push(item)
        } else {
          codeMap.set(key, [item])
        }
      }

      let batchesCreated = 0
      let singleItemsCount = 0

      for (const group of codeMap.values()) {
        const groupIds = group.map((it) => it.id)
        if (group.length >= 2) {
          const batchId = `lote_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
          await advanceGroupToCompra(groupIds, undefined, batchId)
          batchesCreated++
        } else {
          await advanceGroupToCompra(groupIds, undefined, undefined)
          singleItemsCount++
        }
      }

      const summaryParts: string[] = []
      if (batchesCreated > 0) summaryParts.push(`${batchesCreated} lote(s)`)
      if (singleItemsCount > 0) summaryParts.push(`${singleItemsCount} individual(is)`)

      sonnerToast.success(
        `${selectedItems.length} item(ns) avançado(s) para Compras (${summaryParts.join(', ') || 'concluído'})`,
      )
      setCotacoesSelectedIds(new Set())
      fetchData()
    } catch {
      sonnerToast.error('Erro ao avançar itens')
    } finally {
      setAdvancingBatch(false)
    }
  }

  const handleQuickCompra = async (
    item: MaterialShortage,
    groupItems?: MaterialShortage[],
    selectedGroupIds?: string[],
    extraCompraInfo?: {
      actualPurchaseQty: number
      requestedBatchQty: number
      componentCode?: string
      componentDescription: string
      selectedQuotation?: any
      sector?: string
    },
  ) => {
    let itemsToAdvance: MaterialShortage[] = []
    if (selectedGroupIds && selectedGroupIds.length > 0) {
      const allGroup = groupItems && groupItems.length > 0 ? groupItems : [item]
      const selectedSet = new Set(selectedGroupIds)
      itemsToAdvance = allGroup.filter((i) => selectedSet.has(i.id))
      if (itemsToAdvance.length === 0) {
        itemsToAdvance = allGroup
      }
    } else if (groupItems && groupItems.length > 0) {
      itemsToAdvance = groupItems
    } else {
      itemsToAdvance = [item]
    }

    try {
      const idsToAdvance = itemsToAdvance.map((i) => i.id)
      const totalUnits = itemsToAdvance.reduce((sum, curr) => sum + (Number(curr.quantity) || 0), 0)
      const isBatch =
        itemsToAdvance.length > 1 || (extraCompraInfo && extraCompraInfo.actualPurchaseQty > 0)
      const actualQty = extraCompraInfo?.actualPurchaseQty ?? totalUnits

      if (extraCompraInfo && actualQty < totalUnits && actualQty > 0) {
        // REGRA (1): Saldo residual em cotação
        await advanceGroupToCompraWithSurplus({
          itemIds: idsToAdvance,
          actualPurchaseQty: actualQty,
          requestedBatchQty: totalUnits,
          componentCode: extraCompraInfo.componentCode ?? item.code,
          componentDescription: extraCompraInfo.componentDescription || item.description,
          selectedQuotation: extraCompraInfo.selectedQuotation,
          sector: extraCompraInfo.sector || item.sector,
        })
        const residual = totalUnits - actualQty
        sonnerToast.success(
          `Compra parcial de ${actualQty} un enviada para Compras. Saldo residual de ${residual} un permanece em Cotações.`,
        )
      } else if (extraCompraInfo && actualQty > totalUnits) {
        const res = await advanceGroupToCompraWithSurplus({
          itemIds: idsToAdvance,
          actualPurchaseQty: actualQty,
          requestedBatchQty: totalUnits,
          componentCode: extraCompraInfo.componentCode ?? item.code,
          componentDescription: extraCompraInfo.componentDescription || item.description,
          selectedQuotation: extraCompraInfo.selectedQuotation,
          sector: extraCompraInfo.sector || item.sector,
        })
        sonnerToast.success(
          `Lote com ${itemsToAdvance.length} OPs (${totalUnits} un) + ${res.surplusQty} un Estoque enviados para Compras! (Total: ${actualQty} un)`,
        )
      } else if (isBatch) {
        const batchId = `lote_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
        await advanceGroupToCompra(idsToAdvance, extraCompraInfo?.selectedQuotation, batchId)
        sonnerToast.success(
          `Lote com ${itemsToAdvance.length} OPs (${totalUnits} un) enviado para Compras em linha consolidada!`,
        )
      } else {
        await advanceGroupToCompra(idsToAdvance, extraCompraInfo?.selectedQuotation)
        sonnerToast.success('Item enviado direto para Compras')
      }

      setCotacoesSelectedIds((prev) => {
        const next = new Set(prev)
        let changed = false
        for (const id of idsToAdvance) {
          if (next.has(id)) {
            next.delete(id)
            changed = true
          }
        }
        return changed ? next : prev
      })

      fetchData()
    } catch {
      sonnerToast.error('Erro ao enviar para Compras')
    }
  }

  const handleCopyCotacoesSelected = () => {
    const items = filteredCotacaoItems.filter((i) => cotacoesSelectedIds.has(i.id))
    if (items.length === 0) return

    const consolidatedMap = new Map<
      string,
      { code: string; description: string; totalQty: number }
    >()
    for (const item of items) {
      const key = (item.code || item.description).trim().toLowerCase()
      const existing = consolidatedMap.get(key)
      if (existing) {
        existing.totalQty += Number(item.quantity) || 0
      } else {
        consolidatedMap.set(key, {
          code: item.code || '',
          description: item.description,
          totalQty: Number(item.quantity) || 0,
        })
      }
    }

    const lines = Array.from(consolidatedMap.values()).map(
      (c, idx) =>
        `${idx + 1}. ${c.code ? `[${c.code}] ` : ''}${c.description} - Qtde Total: ${c.totalQty}`,
    )

    const text = `Solicitação de Cotação\n\n${lines.join('\n')}\n\nFavor informar preço e prazo de entrega.`
    navigator.clipboard.writeText(text).then(() => {
      setCotacoesCopied(true)
      setTimeout(() => setCotacoesCopied(false), 2000)
      sonnerToast.success('Texto consolidado copiado para a área de transferência')
    })
  }

  // ----------------------------------------------------
  // ABA 3: HISTÓRICO DE SOLICITAÇÕES
  // ----------------------------------------------------
  const historicoItems = useMemo(() => {
    return shortages.filter((s) => {
      if (s.status === 'Pendente' || s.status === 'Cotação') return false
      if (opFilter !== 'all' && s.order_id !== opFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const code = s.code?.toLowerCase() || ''
        const desc = s.description?.toLowerCase() || ''
        const order = s.expand?.order_id?.order_number?.toLowerCase() || ''
        const op = s.expand?.order_id?.op_number?.toLowerCase() || ''
        if (!code.includes(q) && !desc.includes(q) && !order.includes(q) && !op.includes(q)) {
          return false
        }
      }
      return true
    })
  }, [shortages, opFilter, searchQuery])

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <SuprimentosHeader
        title="Hub de Suprimentos"
        description="Fila única de entrada, cotações consolidadas e decisão ágil de compras."
        icon={ClipboardList}
        action={
          <div className="flex items-center gap-2">
            <ProductSearchBar
              className="w-64 sm:w-80"
              placeholder="Pesquisar produto (dossiê)..."
              onSelectProduct={(p) => {
                setDossierItem({
                  id: p.id || '',
                  code: p.code,
                  description: p.description,
                  quantity: p.quantity || 0,
                  sector: 'Suprimentos',
                  status: 'Pendente',
                  created: '',
                  updated: '',
                } as MaterialShortage)
                setDossierOpen(true)
              }}
            />
            <Button
              onClick={() => setModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
            >
              <Plus className="size-4 mr-2" /> Nova Solicitação
            </Button>
          </div>
        }
      />

      <NewShortageModal open={modalOpen} onOpenChange={setModalOpen} />

      {/* TABS CONTEXTUAIS DA ETAPA 1 */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as 'fila' | 'cotacoes' | 'historico')
          setSelectedCategoryId(null)
        }}
        className="w-full space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
          <TabsList className="bg-slate-200/70 dark:bg-slate-900 p-1 rounded-xl h-auto flex flex-wrap">
            <TabsTrigger
              value="fila"
              className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm rounded-lg py-2 px-3.5 text-xs sm:text-sm font-semibold flex items-center gap-2"
            >
              <Inbox className="size-4 text-blue-600" />
              <span>1. Fila de Entrada & Triagem</span>
              {counts.pendentes > 0 && (
                <Badge className="bg-blue-600 text-white hover:bg-blue-600 text-[11px] px-1.5 py-0 h-5 min-w-5 justify-center">
                  {counts.pendentes}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger
              value="cotacoes"
              className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm rounded-lg py-2 px-3.5 text-xs sm:text-sm font-semibold flex items-center gap-2"
            >
              <Tags className="size-4 text-amber-600" />
              <span>2. Em Cotação</span>
              {counts.cotacoes > 0 && (
                <Badge className="bg-amber-600 text-white hover:bg-amber-600 text-[11px] px-1.5 py-0 h-5 min-w-5 justify-center">
                  {counts.cotacoes}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger
              value="historico"
              className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm rounded-lg py-2 px-3.5 text-xs sm:text-sm font-semibold flex items-center gap-2"
            >
              <History className="size-4 text-slate-500" />
              <span>3. Histórico de Solicitações</span>
              <span className="text-xs text-muted-foreground font-normal">
                ({counts.historico})
              </span>
            </TabsTrigger>
          </TabsList>

          {/* Filtros universais do Hub */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                OP:
              </span>
              <Select value={opFilter} onValueChange={setOpFilter}>
                <SelectTrigger className="w-[180px] h-9 text-xs">
                  <SelectValue placeholder="Todas as OPs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as OPs</SelectItem>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.op_number || o.order_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar código, descrição, OP..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-8 text-xs"
              />
            </div>
          </div>
        </div>

        {/* ==================================================== */}
        {/* ABA 1: FILA DE ENTRADA & TRIAGEM */}
        {/* ==================================================== */}
        <TabsContent value="fila" className="space-y-4 mt-0">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                {allPendingItems.length} solicitações aguardando triagem
              </Badge>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Decida o encaminhamento: liberar estoque, abrir cotação ou comprar direto.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCloseResidualOpen(true)}
                className="h-8 text-xs gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/40 font-semibold"
                title="Encerrar saldos parciais e solicitações inativas"
              >
                <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                Encerrar Saldo Residual
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setGroupedByCategory((g) => !g)}
                className="h-8 text-xs gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                {groupedByCategory ? 'Ver em Lista Única' : 'Agrupar por Categoria'}
              </Button>
            </div>
          </div>

          <CategoryFilterChips
            categoryGroups={pendingCategoryGroups}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
            onSelectCategoryItems={handleSelectFilaCategoryItems}
            selectedIds={filaSelectedIdsSet}
            actionLabel="Selecionar todos da categoria"
          />

          {triagemItems.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
              {searchQuery.trim()
                ? 'Nenhuma solicitação encontrada para o filtro informado.'
                : 'Fila de entrada vazia — nenhuma solicitação pendente no momento.'}
            </div>
          ) : groupedByCategory && selectedCategoryId === null ? (
            <div className="space-y-6">
              {pendingCategoryGroups.map((group) => {
                const groupItemIds = group.items.map((i) => i.id)
                const allGroupSelected =
                  groupItemIds.length > 0 &&
                  groupItemIds.every((id) => filaSelectedIds.includes(id))

                return (
                  <div
                    key={group.categoryId}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-2">
                      <div className="flex items-center gap-2.5">
                        <Tag className="w-4 h-4 text-primary" />
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <span className="notranslate" translate="no">
                            {group.categoryName}
                          </span>
                          <span className="text-xs font-normal text-muted-foreground">
                            ({group.totalItems} {group.totalItems === 1 ? 'item' : 'itens'})
                          </span>
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSelectFilaCategoryItems(groupItemIds)}
                          className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {allGroupSelected ? 'Desmarcar categoria' : 'Selecionar categoria'}
                        </Button>
                      </div>
                    </div>

                    <TriageTable
                      items={group.items}
                      allShortages={shortages}
                      availabilityMap={availabilityMap}
                      onRowClick={handleFilaRowClick}
                      onGroupClick={handleFilaGroupClick}
                      onReleaseItem={handlePromptReleaseItem}
                      onReleaseGroup={handlePromptReleaseGroup}
                      searchQuery={searchQuery}
                      onToggleBlockSelect={handleSelectFilaCategoryItems}
                    />
                  </div>
                )
              })}
            </div>
          ) : (
            <TriageTable
              items={triagemItems}
              allShortages={shortages}
              availabilityMap={availabilityMap}
              onRowClick={handleFilaRowClick}
              onGroupClick={handleFilaGroupClick}
              onReleaseItem={handlePromptReleaseItem}
              onReleaseGroup={handlePromptReleaseGroup}
              searchQuery={searchQuery}
              onToggleBlockSelect={handleSelectFilaCategoryItems}
            />
          )}

          {/* Barra flutuante de ações em lote para a Fila */}
          {filaSelectedIds.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
              <div className="bg-primary text-primary-foreground shadow-xl rounded-full px-6 py-3 flex items-center gap-3">
                <span className="font-semibold text-xs sm:text-sm">
                  {filaSelectedIds.length} item(s) selecionado(s)
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handlePromptReleaseSelected}
                  className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium border-0 text-xs"
                >
                  <TrendingUp className="w-3.5 h-3.5 mr-1.5" /> Liberar do Estoque
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfirmComprasOpen(true)}
                  className="rounded-full bg-slate-800 hover:bg-slate-900 text-white font-medium border-0 text-xs"
                >
                  <ShoppingBag className="w-3.5 h-3.5 mr-1.5" /> Enviar Compras
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    fetchSupplierSuggestions()
                    setBatchSupplierOpen(true)
                  }}
                  className="rounded-full text-xs"
                >
                  <Tag className="w-3.5 h-3.5 mr-1.5" /> Fornecedor
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleCopyFilaQuotation}
                  className="rounded-full text-xs"
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar Cotação
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearFilaSelection}
                  className="rounded-full text-primary-foreground/80 hover:text-primary-foreground text-xs"
                >
                  Limpar
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ==================================================== */}
        {/* ABA 2: EM COTAÇÃO */}
        {/* ==================================================== */}
        <TabsContent value="cotacoes" className="space-y-4 mt-0">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="bg-amber-50 text-amber-700 border-amber-200 text-xs"
              >
                {allCotacaoItems.length} registros aguardando decisão
              </Badge>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Selecione fornecedor, informe quantidade real e envie em lote único para Compras.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCloseResidualOpen(true)}
                className="h-8 text-xs gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/40 font-semibold"
                title="Encerrar saldos parciais e solicitações inativas"
              >
                <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                Encerrar Saldo Residual
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCotacoesGrouped((g) => !g)}
                className="h-8 text-xs gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                {cotacoesGrouped ? 'Lista por Código' : 'Agrupar por Fornecedor'}
              </Button>

              {cotacoesSelectedIds.size > 0 && (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleBatchAdvanceToCompra}
                    disabled={advancingBatch}
                    className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 shadow-xs"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    Comprar em lote ({cotacoesSelectedIds.size})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCotacoesSelected}
                    className="h-8 text-xs"
                  >
                    {cotacoesCopied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    Copiar ({cotacoesSelectedIds.size})
                  </Button>
                </>
              )}
            </div>
          </div>

          <CategoryFilterChips
            categoryGroups={cotacaoCategoryGroups}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
            onSelectCategoryItems={handleSelectCotacaoCategoryItems}
            selectedIds={cotacoesSelectedIds}
            actionLabel="Selecionar todos para cotação em lote"
          />

          {filteredCotacaoItems.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
              {searchQuery.trim()
                ? 'Nenhum item em cotação encontrado para a busca.'
                : 'Nenhum item em cotação no momento.'}
            </div>
          ) : (
            <CotacoesTable
              items={filteredCotacaoItems}
              allShortages={shortages}
              selectedIds={cotacoesSelectedIds}
              onToggleSelect={toggleCotacaoSelect}
              onToggleSelectAll={toggleCotacaoSelectAll}
              onToggleSelectGroup={toggleCotacaoSelectGroup}
              onRowClick={handleCotacaoRowClick}
              onQuickCompra={handleQuickCompra}
              isNew={isCotacaoNew}
              grouped={cotacoesGrouped}
            />
          )}
        </TabsContent>

        {/* ==================================================== */}
        {/* ABA 3: HISTÓRICO DE SOLICITAÇÕES */}
        {/* ==================================================== */}
        <TabsContent value="historico" className="space-y-4 mt-0">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="size-4 text-slate-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Histórico de Solicitações Encaminhadas
                </h3>
              </div>
              <Badge variant="outline" className="text-xs">
                {historicoItems.length} registros
              </Badge>
            </div>

            {historicoItems.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                Nenhum histórico encontrado para os filtros atuais.
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50/50 dark:bg-slate-800/50">
                  <TableRow>
                    <TableHead className="w-[85px]">Data</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[90px]">Código</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right w-[80px]">Qtde</TableHead>
                    <TableHead className="w-[110px]">Setor</TableHead>
                    <TableHead className="w-[90px]">Nº OP</TableHead>
                    <TableHead className="w-[120px]">Fornecedor</TableHead>
                    <TableHead>Observação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historicoItems.slice(0, 100).map((item) => (
                    <TableRow key={item.id} className="text-xs">
                      <TableCell className="text-muted-foreground">
                        {item.created ? format(parseISO(item.created), 'dd/MM/yy') : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] font-semibold',
                            item.status === 'Compra' &&
                              'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40',
                            item.status === 'Liberado_Estoque' &&
                              'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40',
                            item.status === 'Recebido' &&
                              'bg-green-50 text-green-700 border-green-300 dark:bg-green-950/40',
                            item.status === 'Recebido_Parcial' &&
                              'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40',
                            item.status === 'Cancelado' &&
                              'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/40',
                          )}
                        >
                          {item.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        <NoTranslate as="span">{item.code || '-'}</NoTranslate>
                      </TableCell>
                      <TableCell className="font-medium">
                        <NoTranslate as="span">{item.description}</NoTranslate>
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        <NoTranslate as="span">{formatQuantity(item.quantity)}</NoTranslate>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.sector || '-'}</TableCell>
                      <TableCell className="font-medium text-slate-800 dark:text-slate-200">
                        {item.expand?.order_id?.op_number
                          ? `OP ${item.expand.order_id.op_number}`
                          : item.expand?.order_id?.order_number
                            ? `Ped ${item.expand.order_id.order_number}`
                            : 'Geral'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <NoTranslate as="span">{item.supplier || '-'}</NoTranslate>
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground truncate max-w-[220px]"
                        title={item.observation || ''}
                      >
                        {item.observation || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* DIÁLOGO DE TRIAGEM INDIVIDUAL (Fila) */}
      <TriageDetailDialog
        item={selectedItem}
        allShortages={shortages}
        open={!!selectedItem}
        onOpenChange={(o) => !o && setSelectedItem(null)}
        onAction={fetchData}
        onOpenQuotation={(item) => handleOpenDirectQuotation(item)}
      />

      {/* DIÁLOGO DE DECISÃO EM LOTE (Fila) */}
      <TriageGroupDetailDialog
        group={selectedGroup}
        open={!!selectedGroup}
        onOpenChange={(o) => !o && setSelectedGroup(null)}
        onAction={() => {
          fetchData()
          clearFilaSelection()
        }}
        onOpenQuotation={(item, groupItems) => handleOpenDirectQuotation(item, groupItems)}
      />

      {/* DIÁLOGO DE COTAÇÃO MULTI-FORNECEDOR DIRETO (Comprador não precisa trocar de tela) */}
      <TriageDialog
        item={quotationItem}
        allShortages={shortages}
        groupedItems={quotationGroupItems}
        initialPhase="quotation"
        open={quotationDialogOpen}
        onOpenChange={(o) => {
          setQuotationDialogOpen(o)
          if (!o) {
            setQuotationItem(null)
            setQuotationGroupItems([])
          }
        }}
        onUpdate={fetchData}
        onDirectCompra={(item, groupItems, selectedIds, extraCompraInfo) =>
          handleQuickCompra(item, groupItems, selectedIds, extraCompraInfo)
        }
      />

      {/* DIÁLOGO DE CONFIRMAÇÃO: ENVIAR COMPRAS DIRETO DA FILA */}
      <Dialog open={confirmComprasOpen} onOpenChange={setConfirmComprasOpen}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="size-5 text-emerald-600" />
              <span>Enviar para Compras Direto</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-semibold">Aviso de Compra Direta</p>
                <p className="mt-0.5">
                  Os itens selecionados irão diretamente para a tela de Compras com status{' '}
                  <strong>'Compra'</strong>, pulando a etapa de cotação. Registros do mesmo
                  componente serão consolidados em lote único na tela de Compras.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border text-sm">
              <div>
                <span className="text-xs text-muted-foreground block">Total de Solicitações:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {filaSelectedShortages.length} registro(s)
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Quantidade Total:</span>
                <span
                  className="font-bold text-emerald-700 dark:text-emerald-300 notranslate"
                  translate="no"
                >
                  {formatQuantity(totalFilaSelectedUnits)} un
                </span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Resumo dos Componentes ({filaSelectedGroupsSummary.length} tipo(s))
              </h4>
              <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900 max-h-60 overflow-y-auto">
                <div className="divide-y text-xs">
                  {filaSelectedGroupsSummary.map((group) => (
                    <div
                      key={group.key}
                      className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {group.code && (
                            <span className="font-semibold text-primary notranslate" translate="no">
                              [{group.code}]
                            </span>
                          )}
                          <NoTranslate
                            as="span"
                            className="font-medium text-slate-800 dark:text-slate-200"
                          >
                            {group.description}
                          </NoTranslate>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {group.items.length === 1 ? (
                            <span>1 solicitação avulsa</span>
                          ) : (
                            <span className="text-blue-600 dark:text-blue-400 font-medium">
                              {group.items.length} solicitações &bull; consolidará em lote único
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className="font-bold text-slate-900 dark:text-slate-100 notranslate"
                          translate="no"
                        >
                          {formatQuantity(group.totalQty)} un
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmComprasOpen(false)}
              disabled={sendingCompras}
            >
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              onClick={handleSendFilaComprasConfirm}
              disabled={sendingCompras}
            >
              {sendingCompras ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <ShoppingBag className="size-4 mr-2" />
              )}
              Confirmar Envio ({filaSelectedShortages.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO PARA ATRIBUIR FORNECEDOR EM LOTE */}
      <Dialog open={batchSupplierOpen} onOpenChange={setBatchSupplierOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Atribuir Fornecedor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <Input
                value={batchSupplierValue}
                onChange={(e) => setBatchSupplierValue(e.target.value)}
                placeholder="Nome do Fornecedor..."
                list="batch-sup-sug-hub"
              />
              <datalist id="batch-sup-sug-hub">
                {supplierSuggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Será aplicado a {filaSelectedIds.length} item(s).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchSupplierOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleBatchSupplier}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO DE CONFIRMAÇÃO: LIBERAÇÃO DIRETA DO ESTOQUE */}
      <Dialog open={confirmReleaseOpen} onOpenChange={setConfirmReleaseOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="size-5 text-emerald-600" />
              <span>Confirmar Liberação do Estoque</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <p className="text-muted-foreground text-xs">
              Esta ação criará imediatamente uma movimentação de <strong>Saída</strong> no estoque e
              marcará a solicitação com o status <strong>'Liberado_Estoque'</strong>, retirando-a da
              Fila de Entrada e movendo para o Histórico.
            </p>

            {releasingItem && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border text-xs space-y-1">
                <div>
                  <strong>Item:</strong> [{releasingItem.code}] {releasingItem.description}
                </div>
                <div>
                  <strong>Quantidade a baixar:</strong> {formatQuantity(releasingItem.quantity)} un
                </div>
                <div>
                  <strong>Destino:</strong>{' '}
                  {releasingItem.expand?.order_id?.op_number
                    ? `OP ${releasingItem.expand.order_id.op_number}`
                    : 'Geral'}
                </div>
              </div>
            )}

            {releasingGroup && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border text-xs space-y-1">
                <div>
                  <strong>Lote:</strong> [{releasingGroup.code}] {releasingGroup.description}
                </div>
                <div>
                  <strong>Total a baixar:</strong> {formatQuantity(releasingGroup.totalQuantity)} un
                </div>
                <div>
                  <strong>Solicitações abrangidas:</strong> {releasingGroup.items.length}{' '}
                  registro(s) ({releasingGroup.opCount} OP(s))
                </div>
              </div>
            )}

            {releasingBatchSelection && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border text-xs space-y-1">
                <div>
                  <strong>Solicitações selecionadas:</strong> {filaSelectedShortages.length}{' '}
                  registro(s)
                </div>
                <div>
                  <strong>Quantidade total demandada:</strong>{' '}
                  {formatQuantity(totalFilaSelectedUnits)} un
                </div>
                <div className="text-[11px] text-muted-foreground italic">
                  * Registros com saldo livre suficiente serão liberados; se houver algum sem saldo,
                  permanecerá na fila.
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmReleaseOpen(false)}
              disabled={releasingLoading}
            >
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              onClick={handleExecuteReleaseConfirm}
              disabled={releasingLoading}
            >
              {releasingLoading ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Check className="size-4 mr-2" />
              )}
              Confirmar Liberação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO: ENCERRAR SALDO RESIDUAL (ETAPA 5 PARTE 2) */}
      <CloseResidualDialog
        open={closeResidualOpen}
        onOpenChange={setCloseResidualOpen}
        onSuccess={fetchData}
      />

      {/* DOSSIÊ MODAL */}
      <ProductDossierModal
        open={dossierOpen}
        onOpenChange={setDossierOpen}
        initialProduct={dossierItem}
      />
    </div>
  )
}
