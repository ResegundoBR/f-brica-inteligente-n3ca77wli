import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MaterialShortage, OrdemCompra, OrdemCompraItem, PcpOrder, Quotation } from '@/types'
import { ShoppingCart, FileText, Layers, Clock, CheckCircle2 } from 'lucide-react'
import { parseISO, isBefore, startOfDay, isValid } from 'date-fns'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ComprasTable, type OcLinkInfo } from './components/ComprasTable'
import { ComprasItemDialog } from './components/ComprasItemDialog'
import { DeleteShortageDialog } from './components/DeleteShortageDialog'
import { OrdemCompraModal, type OCItemInput } from './components/OrdemCompraModal'
import { ProductDossierModal } from './components/ProductDossierModal'
import { ProductSearchBar } from './components/ProductSearchBar'
import { OrdemCompraDocument } from './components/OrdemCompraDocument'
import { CategoryFilterChips } from './components/CategoryFilterChips'
import {
  createOrdemCompra,
  getOrdemCompraItens,
  getActiveOrdemCompraItens,
} from '@/services/ordens-compra'
import { getMasterComponents } from '@/services/components'
import { getComponentCategories } from '@/services/component-categories'
import { useCategoryGroups } from '@/hooks/use-category-groups'
import { ComponentCategory, MasterComponent } from '@/types'
import { useShortageStore } from '@/stores/useShortageStore'
import { formatDetailedErrorMessage } from '@/lib/pocketbase/errors'
import { toast } from 'sonner'

export default function ComprasPage() {
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [components, setComponents] = useState<MasterComponent[]>([])
  const [categories, setCategories] = useState<ComponentCategory[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [editItem, setEditItem] = useState<MaterialShortage | null>(null)
  const [deleteItem, setDeleteItem] = useState<MaterialShortage | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dossierOpen, setDossierOpen] = useState(false)
  const [dossierItem, setDossierItem] = useState<MaterialShortage | null>(null)
  const [ocModalOpen, setOcModalOpen] = useState(false)
  const [ocItems, setOcItems] = useState<OCItemInput[]>([])
  const [ocSupplier, setOcSupplier] = useState('')
  const [ocDocument, setOcDocument] = useState<OrdemCompra | null>(null)
  const [ocDocumentItems, setOcDocumentItems] = useState<OrdemCompraItem[]>([])
  const [ocDocOpen, setOcDocOpen] = useState(false)
  const clear = useShortageStore((s) => s.clear)
  const { user } = useAuth()
  const [grouped, setGrouped] = useState(false)
  const [opFilter, setOpFilter] = useState('all')
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [activeTab, setActiveTab] = useState<'aguardando_oc' | 'em_oc'>('aguardando_oc')
  const [activeOcItems, setActiveOcItems] = useState<OrdemCompraItem[]>([])

  const fetchShortages = async () => {
    try {
      const [res, compRes, catRes, ocItensRes] = await Promise.all([
        pb.collection('material_shortages').getFullList<MaterialShortage>({
          sort: '-created',
          expand: 'order_id,order_id.product_id,requested_by',
        }),
        getMasterComponents('', { includeInactive: true, expand: 'category' }),
        getComponentCategories(),
        getActiveOrdemCompraItens(),
      ])
      setShortages(res)
      setComponents(compRes)
      setCategories(catRes)
      setActiveOcItems(ocItensRes)
    } catch {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchShortages()
    pb.collection('pcp_orders')
      .getFullList<PcpOrder>({ sort: '-created' })
      .then(setOrders)
      .catch(() => {})
    return () => clear()
  }, [clear])

  useRealtime('material_shortages', fetchShortages)
  useRealtime('components', fetchShortages)
  useRealtime('component_categories', fetchShortages)
  useRealtime('ordens_de_compra', fetchShortages)
  useRealtime('ordem_compra_itens', fetchShortages)

  // Mapa de shortageId -> OcLinkInfo (com OC ativa não-cancelada)
  // Leva em conta também lotes (batch_id): se algum membro do lote tem OC, propaga para o batch
  const shortageOcMap = useMemo(() => {
    const map = new Map<string, OcLinkInfo>()
    for (const it of activeOcItems) {
      if (!it.material_shortage_id) continue
      const oc = it.expand?.oc_id
      if (!oc || oc.status === 'Cancelada') continue
      const linkInfo: OcLinkInfo = {
        ocId: oc.id,
        ocNumber: oc.oc_number,
        status: oc.status,
        expectedDate: oc.expected_date,
        fullOc: oc,
      }
      map.set(it.material_shortage_id, linkInfo)
    }

    // Se um membro de lote (batch_id) tem OC, mapeia para os outros membros do mesmo lote
    // para manter consistência no lote consolidado
    const batchToOc = new Map<string, OcLinkInfo>()
    for (const s of shortages) {
      if (s.batch_id && map.has(s.id)) {
        batchToOc.set(s.batch_id, map.get(s.id)!)
      }
    }
    for (const s of shortages) {
      if (s.batch_id && !map.has(s.id) && batchToOc.has(s.batch_id)) {
        map.set(s.id, batchToOc.get(s.batch_id)!)
      }
    }

    return map
  }, [activeOcItems, shortages])

  const rawComprasItems = useMemo(
    () =>
      shortages.filter((s) => {
        if (s.status !== 'Compra' && s.status !== 'Recebido_Parcial') return false
        if (opFilter !== 'all' && s.order_id !== opFilter) return false
        const total = Number(s.quantity) || 0
        const received = Number(s.received_quantity) || 0
        return total === 0 || received < total
      }),
    [shortages, opFilter],
  )

  // Separação em dois grupos: Aguardando OC (sem OC ativa) vs Em Ordem de Compra (com OC ativa)
  const rawAguardandoOcItems = useMemo(
    () => rawComprasItems.filter((s) => !shortageOcMap.has(s.id)),
    [rawComprasItems, shortageOcMap],
  )

  const rawEmOcItems = useMemo(
    () => rawComprasItems.filter((s) => shortageOcMap.has(s.id)),
    [rawComprasItems, shortageOcMap],
  )

  // Totalização e agrupamento por categoria para a lista de Aguardando OC
  const categoryGroups = useCategoryGroups(rawAguardandoOcItems, components, categories)

  const aguardandoOcItems = useMemo(() => {
    if (selectedCategoryId === null) return rawAguardandoOcItems
    const activeGroup = categoryGroups.find((g) => g.categoryId === selectedCategoryId)
    return activeGroup ? activeGroup.items : []
  }, [rawAguardandoOcItems, selectedCategoryId, categoryGroups])

  const emOcItems = useMemo(() => {
    if (selectedCategoryId === null) return rawEmOcItems
    // Filtra por categoria também se selecionada
    const compMap = new Map(components.map((c) => [c.code?.trim().toLowerCase(), c.category]))
    return rawEmOcItems.filter((it) => {
      const codeKey = (it.code || '').trim().toLowerCase()
      const catId = compMap.get(codeKey)
      return catId === selectedCategoryId
    })
  }, [rawEmOcItems, selectedCategoryId, components])

  // Resumo (cards) reflete estritamente os itens Aguardando OC (tarefa 2)
  const summary = useMemo(() => {
    const today = startOfDay(new Date())
    let totalValue = 0
    let overdue = 0
    aguardandoOcItems.forEach((s) => {
      const total = Number(s.quantity) || 0
      const received = Number(s.received_quantity) || 0
      const pendingQty = Math.max(0, total - received)
      const price = Number(s.unit_price) || 0
      totalValue += pendingQty * price
      if (s.expected_date) {
        const d = parseISO(s.expected_date)
        if (isValid(d) && isBefore(startOfDay(d), today)) overdue++
      }
    })
    return { count: aguardandoOcItems.length, totalValue, overdue }
  }, [aguardandoOcItems])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === aguardandoOcItems.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(aguardandoOcItems.map((i) => i.id)))
  }

  const toggleSelectGroup = (ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = ids.every((id) => next.has(id))
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const handleSelectCategoryItems = (ids: string[]) => {
    setSelectedIds((prev) => {
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

  const handleOpenOcDocFromItem = async (ocRecord: any) => {
    try {
      if (!ocRecord) return
      const itens = await getOrdemCompraItens(ocRecord.id)
      setOcDocument(ocRecord)
      setOcDocumentItems(itens)
      setOcDocOpen(true)
    } catch (err) {
      console.warn('Erro ao abrir documento da OC:', err)
      toast.error('Erro ao abrir documento da Ordem de Compra')
    }
  }

  const handleGerarOC = async () => {
    // Apenas itens que estão em aguardandoOcItems (sem OC)
    const selected = aguardandoOcItems.filter((i) => selectedIds.has(i.id))
    if (selected.length === 0) return

    // Agrupa itens selecionados por lote (batch_id) para emitir apenas UMA linha representativa por lote
    const batchGroups = new Map<string, MaterialShortage[]>()
    const individualItems: MaterialShortage[] = []

    for (const item of selected) {
      const bId = item.batch_id || item.batch_info?.batch_id
      if (bId) {
        const group = batchGroups.get(bId) || []
        group.push(item)
        batchGroups.set(bId, group)
      } else {
        individualItems.push(item)
      }
    }

    // Identificar representante para cada lote
    interface ConsolidatedOCLine {
      representative: MaterialShortage
      allMemberIds: string[]
      isBatch: boolean
      quantity: number
      unitPrice: number
      expectedDate?: string
    }

    const consolidatedLines: ConsolidatedOCLine[] = []

    for (const [batchId, bItems] of batchGroups.entries()) {
      // Tentar encontrar o registro-pai do lote na lista geral de shortages ou entre os selecionados
      const allBatchMembersInSystem = shortages.filter(
        (s) => s.batch_id === batchId || s.batch_info?.batch_id === batchId,
      )
      const parent =
        allBatchMembersInSystem.find((it) => it.batch_info?.is_batch_parent) ||
        bItems.find((it) => it.batch_info?.is_batch_parent) ||
        bItems[0]

      const actualQty =
        parent.batch_info?.actual_quantity != null
          ? Number(parent.batch_info.actual_quantity)
          : Number(parent.quantity) || 0

      const unitPrice =
        Number(parent.unit_price) ||
        Number(parent.batch_info?.unit_price) ||
        Number(bItems.find((it) => Number(it.unit_price) > 0)?.unit_price) ||
        0

      const expectedDate =
        parent.expected_date ||
        parent.batch_info?.expected_date ||
        bItems.find((it) => it.expected_date)?.expected_date

      consolidatedLines.push({
        representative: parent,
        allMemberIds: bItems.map((it) => it.id),
        isBatch: true,
        quantity: actualQty,
        unitPrice,
        expectedDate,
      })
    }

    for (const item of individualItems) {
      consolidatedLines.push({
        representative: item,
        allMemberIds: [item.id],
        isBatch: false,
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unit_price) || 0,
        expectedDate: item.expected_date,
      })
    }

    const suppliers = new Set(
      consolidatedLines
        .map(
          (line) => line.representative.supplier || line.representative.batch_info?.supplier || '',
        )
        .filter(Boolean),
    )
    if (suppliers.size === 0) {
      toast.error('Selecione itens com fornecedor definido')
      return
    }
    if (suppliers.size > 1) {
      toast.error('Selecione itens do mesmo fornecedor para gerar uma OC')
      return
    }
    const supplierName = Array.from(suppliers)[0]

    // Busca cotações selecionadas para pré-carregar ST e IPI se existirem
    const repShortageIds = consolidatedLines.map((line) => line.representative.id)
    let quotationsMap: Record<string, { st_value?: number; ipi_value?: number }> = {}
    try {
      const filterStr = repShortageIds.map((id) => `material_shortage_id = "${id}"`).join(' || ')
      if (filterStr) {
        const quots = await pb.collection('quotations').getFullList<Quotation>({
          filter: `(${filterStr}) && selected = true`,
        })
        for (const q of quots) {
          quotationsMap[q.material_shortage_id] = {
            st_value: q.st_value,
            ipi_value: q.ipi_value,
          }
        }
      }
    } catch {
      /* ignore */
    }

    const items: OCItemInput[] = consolidatedLines.map((line) => {
      const rep = line.representative
      return {
        description: rep.description,
        code: rep.code,
        quantity: line.quantity,
        original_quantity: line.quantity,
        unit_price: line.unitPrice,
        st_value: quotationsMap[rep.id]?.st_value || 0,
        ipi_value: quotationsMap[rep.id]?.ipi_value || 0,
        material_shortage_id: rep.id,
      }
    })

    setOcSupplier(supplierName)
    setOcItems(items)
    setOcModalOpen(true)
  }

  const handleConfirmOC = async (
    items: OCItemInput[],
    deliveryTerms: string,
    expectedDate: string,
    paymentTerms: string,
    deliveryType: string,
  ) => {
    const total = items.reduce(
      (sum, it) =>
        sum +
        it.quantity * it.unit_price +
        (Number(it.st_value) || 0) +
        (Number(it.ipi_value) || 0),
      0,
    )
    try {
      // Se a quantidade de algum item foi editada para MENOR que a do registro original de material_shortages,
      // aplicar split: o item da OC mantém o material_shortage_id comprado, e o registro original
      // permanece em aberto (status 'Cotação') com o saldo residual, OPs de origem e observação.
      const processedItems: OCItemInput[] = []
      for (const it of items) {
        if (
          it.material_shortage_id &&
          it.original_quantity &&
          it.quantity < it.original_quantity &&
          it.quantity > 0
        ) {
          try {
            const originalShortage = await pb
              .collection('material_shortages')
              .getOne<MaterialShortage>(it.material_shortage_id)
            const origQty = Number(originalShortage.quantity) || it.original_quantity
            const boughtQty = it.quantity
            const residualQty = Math.max(0, origQty - boughtQty)
            const todayPt = new Date().toLocaleDateString('pt-BR')

            // 1. Criar novo registro para a compra desmembrada com a quantidade comprada na OC
            const purchasedRecord = await pb
              .collection('material_shortages')
              .create<MaterialShortage>({
                order_id: originalShortage.order_id || null,
                code: originalShortage.code,
                description: originalShortage.description,
                quantity: boughtQty,
                sector: originalShortage.sector,
                status: 'Compra',
                request_type: originalShortage.request_type,
                priority: originalShortage.priority,
                requested_by: originalShortage.requested_by || null,
                supplier: originalShortage.supplier || ocSupplier,
                unit_price: it.unit_price || originalShortage.unit_price,
                purchase_date: new Date().toISOString().split('T')[0],
                expected_date: expectedDate?.trim() || originalShortage.expected_date,
                observation: [
                  originalShortage.observation,
                  `Desmembrado por edição na OC: ${boughtQty} un de ${origQty} un em ${todayPt}`,
                ]
                  .filter(Boolean)
                  .join(' | '),
              })

            // 2. Registro ORIGINAL permanece em aberto com status 'Cotação' e saldo residual
            const residualNote = `Saldo residual de compra: ${boughtQty} compradas de ${origQty} solicitadas em ${todayPt}`
            const newObs = originalShortage.observation
              ? `${originalShortage.observation} | ${residualNote}`
              : residualNote

            await pb.collection('material_shortages').update(originalShortage.id, {
              status: 'Cotação',
              quantity: residualQty,
              observation: newObs,
            })

            // Associar o item da OC ao novo registro comprado
            processedItems.push({
              ...it,
              material_shortage_id: purchasedRecord.id,
            })
          } catch (splitErr) {
            console.error('Erro ao realizar split na edição da OC:', splitErr)
            processedItems.push(it)
          }
        } else {
          processedItems.push(it)
        }
      }

      const oc = await createOrdemCompra({
        supplier: ocSupplier,
        expected_date: expectedDate?.trim() ? expectedDate.trim() : undefined,
        delivery_terms: deliveryTerms?.trim() ? deliveryTerms.trim() : undefined,
        payment_terms: paymentTerms?.trim() ? paymentTerms.trim() : undefined,
        delivery_type: deliveryType || undefined,
        total,
        ...(user?.id && { user_id: user.id }),
        itens: processedItems.map((it) => ({
          description: it.description,
          code: it.code?.trim() ? it.code.trim() : undefined,
          quantity: it.quantity,
          unit_price: it.unit_price,
          st_value: Number(it.st_value) || 0,
          ipi_value: Number(it.ipi_value) || 0,
          total:
            it.quantity * it.unit_price + (Number(it.st_value) || 0) + (Number(it.ipi_value) || 0),
          material_shortage_id: it.material_shortage_id?.trim()
            ? it.material_shortage_id.trim()
            : undefined,
        })),
      })
      const ocItens = await getOrdemCompraItens(oc.id)
      setOcDocument(oc)
      setOcDocumentItems(ocItens)
      setOcDocOpen(true)
      setSelectedIds(new Set())
      fetchShortages()
      toast.success('Ordem de Compra gerada com sucesso!')
    } catch (err) {
      console.error('Erro ao gerar Ordem de Compra:', err)
      const detail = formatDetailedErrorMessage(err, 'Erro ao gerar Ordem de Compra')
      toast.error(`Erro ao gerar Ordem de Compra: ${detail}`)
      throw err
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <div className="flex items-center justify-between">
        <SuprimentosHeader
          title="Compras"
          description="Monitoramento de pedidos de compra ativos e previsão de entrega."
          icon={ShoppingCart}
          action={
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
                  status: 'Compra',
                  created: '',
                  updated: '',
                } as MaterialShortage)
                setDossierOpen(true)
              }}
            />
          }
        />
        <div className="flex items-center gap-2">
          <Select value={opFilter} onValueChange={setOpFilter}>
            <SelectTrigger className="w-[200px]">
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
          <Button variant="outline" size="sm" onClick={() => setGrouped((g) => !g)}>
            <Layers className="w-4 h-4" />
            {grouped ? 'Lista' : 'Agrupar por fornecedor'}
          </Button>
          {selectedIds.size > 0 && (
            <Button onClick={handleGerarOC}>
              <FileText className="w-4 h-4" />
              Gerar OC ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Compras Ativas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Valor Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              R${' '}
              {summary.totalValue.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Entregas Atrasadas</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${summary.overdue > 0 ? 'text-red-600' : 'text-slate-700 dark:text-slate-300'}`}
            >
              {summary.overdue}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ABAS: Aguardando OC vs Em Ordem de Compra */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as 'aguardando_oc' | 'em_oc')
          setSelectedIds(new Set())
        }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between border-b pb-2">
          <TabsList className="bg-slate-100 dark:bg-slate-800 p-1">
            <TabsTrigger value="aguardando_oc" className="gap-2">
              <Clock className="w-4 h-4" />
              <span>Aguardando OC</span>
              <Badge
                variant="secondary"
                className="ml-1 px-1.5 py-0 text-xs font-semibold bg-white dark:bg-slate-900"
              >
                {rawAguardandoOcItems.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="em_oc" className="gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              <span>Em Ordem de Compra</span>
              <Badge
                variant="secondary"
                className="ml-1 px-1.5 py-0 text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
              >
                {rawEmOcItems.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <span className="text-xs text-muted-foreground hidden sm:inline">
            {activeTab === 'aguardando_oc'
              ? 'Selecione itens para gerar novas Ordens de Compra'
              : 'Itens com OC ativa emitida — clique no nº da OC para visualizar o documento'}
          </span>
        </div>

        {/* ABA: AGUARDANDO OC */}
        <TabsContent value="aguardando_oc" className="space-y-4 focus-visible:outline-none">
          {/* TOTALIZAÇÃO E CHIPS POR CATEGORIA DO COMPONENTE */}
          <CategoryFilterChips
            categoryGroups={categoryGroups}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
            onSelectCategoryItems={handleSelectCategoryItems}
            selectedIds={selectedIds}
            actionLabel="Selecionar todos para Ordem de Compra"
          />

          {aguardandoOcItems.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
              Nenhum item aguardando Ordem de Compra.
            </div>
          ) : (
            <ComprasTable
              items={aguardandoOcItems}
              allShortages={shortages}
              onEdit={setEditItem}
              onDelete={setDeleteItem}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onToggleSelectGroup={toggleSelectGroup}
              grouped={grouped}
              isEmOc={false}
              shortageOcMap={shortageOcMap}
            />
          )}
        </TabsContent>

        {/* ABA: EM ORDEM DE COMPRA */}
        <TabsContent value="em_oc" className="space-y-4 focus-visible:outline-none">
          {emOcItems.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
              Nenhum item em Ordem de Compra ativa no momento.
            </div>
          ) : (
            <ComprasTable
              items={emOcItems}
              allShortages={shortages}
              onEdit={setEditItem}
              onDelete={setDeleteItem}
              grouped={grouped}
              isEmOc={true}
              shortageOcMap={shortageOcMap}
              onOpenOcDoc={handleOpenOcDocFromItem}
            />
          )}
        </TabsContent>
      </Tabs>

      <ComprasItemDialog
        item={editItem}
        allShortages={shortages}
        open={!!editItem}
        onOpenChange={(o) => !o && setEditItem(null)}
        onUpdate={fetchShortages}
        onDeleteRequest={(item) => {
          setEditItem(null)
          setDeleteItem(item)
        }}
      />
      <DeleteShortageDialog
        item={deleteItem}
        open={!!deleteItem}
        onOpenChange={(o) => !o && setDeleteItem(null)}
        onSuccess={() => {
          if (deleteItem) {
            setSelectedIds((prev) => {
              const next = new Set(prev)
              next.delete(deleteItem.id)
              return next
            })
          }
          fetchShortages()
        }}
      />
      <OrdemCompraModal
        open={ocModalOpen}
        onOpenChange={setOcModalOpen}
        supplierName={ocSupplier}
        initialItems={ocItems}
        allShortages={shortages}
        onConfirm={handleConfirmOC}
      />
      <OrdemCompraDocument
        oc={ocDocument}
        items={ocDocumentItems}
        open={ocDocOpen}
        onOpenChange={setOcDocOpen}
      />
      <ProductDossierModal
        open={dossierOpen}
        onOpenChange={setDossierOpen}
        initialProduct={dossierItem}
      />
    </div>
  )
}
