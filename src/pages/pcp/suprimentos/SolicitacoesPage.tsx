import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MaterialShortage, PcpOrder, ComponentCategory, MasterComponent } from '@/types'
import {
  ClipboardList,
  Plus,
  Copy,
  Tag,
  Layers,
  ShoppingBag,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { TriageTable } from './components/TriageTable'
import { ProductDossierModal } from './components/ProductDossierModal'
import { ProductSearchBar } from './components/ProductSearchBar'
import { TriageDetailDialog } from './components/TriageDetailDialog'
import { TriageGroupDetailDialog } from './components/TriageGroupDetailDialog'
import { CategoryFilterChips } from './components/CategoryFilterChips'
import { ShortageGroup } from '@/lib/shortage-grouping'
import { NewShortageModal } from '@/pages/pcp/components/NewShortageModal'
import { useShortageStore } from '@/stores/useShortageStore'
import { useToast } from '@/hooks/use-toast'
import { useNewRequests } from '@/hooks/use-new-requests'
import { extractFieldErrors } from '@/lib/pocketbase/errors'
import { getMasterComponents } from '@/services/components'
import { getComponentCategories } from '@/services/component-categories'
import { useCategoryGroups } from '@/hooks/use-category-groups'
import { advanceGroupToCompra, sendDirectToCompra } from '@/services/quotations'
import { formatQuantity } from '@/lib/utils'
import { NoTranslate } from '@/components/NoTranslate'

export default function SolicitacoesPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [components, setComponents] = useState<MasterComponent[]>([])
  const [categories, setCategories] = useState<ComponentCategory[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [groupedByCategory, setGroupedByCategory] = useState(true)
  const [selectedItem, setSelectedItem] = useState<MaterialShortage | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<ShortageGroup | null>(null)
  const [dossierOpen, setDossierOpen] = useState(false)
  const [dossierItem, setDossierItem] = useState<MaterialShortage | null>(null)
  const [batchSupplierOpen, setBatchSupplierOpen] = useState(false)
  const [batchSupplierValue, setBatchSupplierValue] = useState('')
  const [supplierSuggestions, setSupplierSuggestions] = useState<string[]>([])
  const [opFilter, setOpFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [confirmComprasOpen, setConfirmComprasOpen] = useState(false)
  const [sendingCompras, setSendingCompras] = useState(false)
  const { toast } = useToast()
  const setAvailableIds = useShortageStore((s) => s.setAvailableIds)
  const selectedIds = useShortageStore((s) => s.selectedIds)
  const toggleMultiple = useShortageStore((s) => s.toggleMultiple)
  const clear = useShortageStore((s) => s.clear)
  const { markAsViewed } = useNewRequests()

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
    return () => clear()
  }, [clear])

  useRealtime('material_shortages', fetchData)
  useRealtime('components', fetchData)
  useRealtime('component_categories', fetchData)

  const handleRowClick = (item: MaterialShortage) => {
    markAsViewed(item.id)
    setSelectedItem(item)
  }

  const handleGroupClick = (group: ShortageGroup) => {
    group.items.forEach((it) => markAsViewed(it.id))
    setSelectedGroup(group)
  }

  const handleCopyQuotation = () => {
    const items = shortages.filter((s) => selectedIds.includes(s.id))
    if (items.length === 0) return

    // Consolidar cópia por código/descrição para cotação simplificada
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
      description: `Lista consolidada de cotação copiada (${consolidatedMap.size} item(ns), somando ${items.length} registro(s)).`,
    })
    clear()
  }

  // Itens atualmente selecionados no store
  const selectedShortages = useMemo(() => {
    if (selectedIds.length === 0) return []
    const set = new Set(selectedIds)
    return shortages.filter((s) => set.has(s.id))
  }, [shortages, selectedIds])

  // Agrupamento dos itens selecionados por código/descrição para envio a Compras
  const selectedGroupsSummary = useMemo(() => {
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

    for (const item of selectedShortages) {
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
  }, [selectedShortages])

  const totalSelectedUnits = useMemo(() => {
    return selectedShortages.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0)
  }, [selectedShortages])

  const handleSendComprasConfirm = async () => {
    if (selectedShortages.length === 0) return
    setSendingCompras(true)
    const today = new Date().toISOString().split('T')[0]

    try {
      for (const group of selectedGroupsSummary) {
        if (group.items.length >= 2) {
          // Grupo com 2 ou mais registros do mesmo código: recebe batch_id compartilhado
          const ids = group.items.map((it) => it.id)
          const batchId = `lote_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
          await advanceGroupToCompra(ids, undefined, batchId)
        } else {
          // Item avulso: update individual preservando fornecedor se já houver
          const single = group.items[0]
          await sendDirectToCompra(single.id, {
            purchase_date: today,
            ...(single.supplier ? { supplier: single.supplier } : {}),
          })
        }
      }

      toast({
        title: 'Enviado para compras',
        description: `${selectedShortages.length} solicitação(ões) (${formatQuantity(totalSelectedUnits)} un) enviada(s) direto para Compras.`,
      })

      setConfirmComprasOpen(false)
      clear()
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
      for (const id of selectedIds)
        await pb
          .collection('material_shortages')
          .update(id, { supplier: batchSupplierValue.trim() })
      toast({
        title: 'Fornecedor atribuído',
        description: `${selectedIds.length} item(s) atualizado(s).`,
      })
      setBatchSupplierOpen(false)
      setBatchSupplierValue('')
      clear()
    } catch (err: any) {
      const errors = extractFieldErrors(err)
      toast({
        title: 'Erro',
        description: Object.values(errors).join(' ') || err.message || 'Falha ao atribuir.',
        variant: 'destructive',
      })
    }
  }

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

  // Agrupamento por categoria usando a mesma lógica de Cotações e Compras
  const categoryGroups = useCategoryGroups(allPendingItems, components, categories)

  const triagemItems = useMemo(() => {
    if (selectedCategoryId === null) return allPendingItems
    const activeGroup = categoryGroups.find((g) => g.categoryId === selectedCategoryId)
    return activeGroup ? activeGroup.items : []
  }, [allPendingItems, selectedCategoryId, categoryGroups])

  // Conjunto de IDs selecionados para o CategoryFilterChips
  const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const handleSelectCategoryItems = (ids: string[]) => {
    const allSelected = ids.every((id) => selectedIds.includes(id))
    if (allSelected) {
      // Remove todos os ids da seleção
      toggleMultiple(ids)
    } else {
      // Adiciona os que faltam
      const missing = ids.filter((id) => !selectedIds.includes(id))
      toggleMultiple(missing)
    }
  }

  // Sincroniza availableIds do useShortageStore para seleção em lote completa
  useEffect(() => {
    setAvailableIds(triagemItems.map((i) => i.id))
  }, [triagemItems, setAvailableIds])

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <SuprimentosHeader
        title="Solicitações"
        description="Triagem de solicitações da fábrica: usar estoque ou iniciar cotação."
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
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="size-4 mr-2" /> Nova Solicitação
            </Button>
          </div>
        }
      />
      <NewShortageModal open={modalOpen} onOpenChange={setModalOpen} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Filtrar por OP:</span>
          <Select value={opFilter} onValueChange={setOpFilter}>
            <SelectTrigger className="w-[220px]">
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

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGroupedByCategory((g) => !g)}
            className="h-9 text-xs gap-1.5"
          >
            <Layers className="w-4 h-4" />
            {groupedByCategory ? 'Ver em Lista Única' : 'Agrupar por Categoria'}
          </Button>

          <div className="relative w-full sm:w-72">
            <Input
              placeholder="Buscar por código, descrição, OP, pedido..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        </div>
      </div>

      {/* TOTALIZAÇÃO E CHIPS POR CATEGORIA DO COMPONENTE */}
      <CategoryFilterChips
        categoryGroups={categoryGroups}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={setSelectedCategoryId}
        onSelectCategoryItems={handleSelectCategoryItems}
        selectedIds={selectedIdsSet}
        actionLabel="Selecionar todos da categoria"
      />

      {triagemItems.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          {searchQuery.trim()
            ? 'Nenhuma solicitação encontrada para a busca.'
            : 'Nenhuma solicitação pendente.'}
        </div>
      ) : groupedByCategory && selectedCategoryId === null ? (
        <div className="space-y-6">
          {categoryGroups.map((group) => {
            const groupItemIds = group.items.map((i) => i.id)
            const allGroupSelected =
              groupItemIds.length > 0 && groupItemIds.every((id) => selectedIds.includes(id))

            return (
              <div
                key={group.categoryId}
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden"
              >
                {/* Cabeçalho do Grupo por Categoria */}
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
                      onClick={() => handleSelectCategoryItems(groupItemIds)}
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {allGroupSelected ? 'Desmarcar categoria' : 'Selecionar categoria'}
                    </Button>
                  </div>
                </div>

                <TriageTable
                  items={group.items}
                  allShortages={shortages}
                  onRowClick={handleRowClick}
                  onGroupClick={handleGroupClick}
                  searchQuery={searchQuery}
                  onToggleBlockSelect={handleSelectCategoryItems}
                />
              </div>
            )
          })}
        </div>
      ) : (
        <TriageTable
          items={triagemItems}
          allShortages={shortages}
          onRowClick={handleRowClick}
          onGroupClick={handleGroupClick}
          searchQuery={searchQuery}
          onToggleBlockSelect={handleSelectCategoryItems}
        />
      )}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
          <div className="bg-primary text-primary-foreground shadow-lg rounded-full px-6 py-3 flex items-center gap-4">
            <span className="font-medium">{selectedIds.length} item(s) selecionado(s)</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setConfirmComprasOpen(true)}
              className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium border-0"
            >
              <ShoppingBag className="w-4 h-4 mr-2" /> Enviar Compras
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                fetchSupplierSuggestions()
                setBatchSupplierOpen(true)
              }}
              className="rounded-full"
            >
              <Tag className="w-4 h-4 mr-2" /> Atribuir Fornecedor
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleCopyQuotation}
              className="rounded-full"
            >
              <Copy className="w-4 h-4 mr-2" /> Copiar Cotação
            </Button>
          </div>
        </div>
      )}
      {/* DIÁLOGO DE CONFIRMAÇÃO: ENVIAR COMPRAS */}
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
                  {selectedShortages.length} registro(s)
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Quantidade Total:</span>
                <span
                  className="font-bold text-emerald-700 dark:text-emerald-300 notranslate"
                  translate="no"
                >
                  {formatQuantity(totalSelectedUnits)} un
                </span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Resumo dos Componentes ({selectedGroupsSummary.length} tipo(s))
              </h4>
              <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900 max-h-60 overflow-y-auto">
                <div className="divide-y text-xs">
                  {selectedGroupsSummary.map((group) => (
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
              onClick={handleSendComprasConfirm}
              disabled={sendingCompras}
            >
              {sendingCompras ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <ShoppingBag className="size-4 mr-2" />
              )}
              Confirmar Envio ({selectedShortages.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                list="batch-sup-sug"
              />
              <datalist id="batch-sup-sug">
                {supplierSuggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Será aplicado a {selectedIds.length} item(s).
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
      <TriageDetailDialog
        item={selectedItem}
        allShortages={shortages}
        open={!!selectedItem}
        onOpenChange={(o) => !o && setSelectedItem(null)}
        onAction={fetchData}
      />
      <TriageGroupDetailDialog
        group={selectedGroup}
        open={!!selectedGroup}
        onOpenChange={(o) => !o && setSelectedGroup(null)}
        onAction={() => {
          fetchData()
          clear()
        }}
      />
      <ProductDossierModal
        open={dossierOpen}
        onOpenChange={setDossierOpen}
        initialProduct={dossierItem}
      />
    </div>
  )
}
