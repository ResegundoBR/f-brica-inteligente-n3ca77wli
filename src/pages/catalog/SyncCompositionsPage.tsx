import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Sparkles,
  Info,
  Check,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import { toast } from 'sonner'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import type {
  Product,
  PcpOrder,
  PcpOrderMaterial,
  CompositionItem,
  ComponentCategory,
} from '@/types'
import { fetchUnifiedCatalogMap } from '@/services/components'
import { getComponentCategories } from '@/services/component-categories'

const STAGES = ['FABRICAÇÃO', 'PREPARAÇÃO', 'MONTAGEM', 'EXPEDIÇÃO']

export interface SyncCandidateItem {
  id?: string
  code: string
  description: string
  rawQty: number
  qtyPerPiece: string
  unit: string
  sector: string
  measurements: string
  category_id?: string
  category?: string
  origem: string
  status: 'new' | 'already_exists'
}

export interface SyncCandidateGroup {
  productId: string
  product: Product
  sourceOrder: PcpOrder
  sourceMaterialsCount: number
  newItems: SyncCandidateItem[]
  existingItemsCount: number
  allCandidateItems: SyncCandidateItem[]
  isSuspicious: boolean
  suspiciousReasons: string[]
  status: 'pending' | 'applied'
}

export default function SyncCompositionsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [candidates, setCandidates] = useState<SyncCandidateGroup[]>([])
  const [search, setSearch] = useState('')
  const [showOnlyPending, setShowOnlyPending] = useState(true)
  const [showOnlySuspicious, setShowOnlySuspicious] = useState(false)
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set())
  const [availableCategories, setAvailableCategories] = useState<ComponentCategory[]>([])

  // Diálogo de confirmação de suspeito para aplicação individual
  const [suspiciousConfirmGroup, setSuspiciousConfirmGroup] = useState<SyncCandidateGroup | null>(
    null,
  )

  // Diálogo de confirmação de lote
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [batchActionRunning, setBatchActionRunning] = useState(false)

  // Aplicação individual em andamento
  const [applyingProductId, setApplyingProductId] = useState<string | null>(null)

  // Controle de permissão de gestor: admin / revisador / gestor de catálogo
  const role = user?.expand?.role
  const roleName = (role?.name || '').toLowerCase()
  const isManager =
    user?.role === 'admin' ||
    roleName === 'admin' ||
    roleName === 'administrador' ||
    roleName.includes('gestor') ||
    roleName.includes('revis') ||
    user?.email === 'reginaldo.segundo@planagroup.com.br' ||
    !!role?.access_catalog

  // Helpers de normalização
  const normCode = (c?: string) => (c || '').toString().trim()
  const normDesc = (d?: string) =>
    (d || '')
      .toString()
      .trim()
      .toUpperCase()
      .replace(/[\t\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')

  // Varredura READ-ONLY e agrupamento
  const loadScanData = async () => {
    setLoading(true)
    try {
      // 1. Carregar produtos
      const products = await pb.collection('products').getFullList<Product>({
        sort: 'name',
      })
      const productMap = new Map<string, Product>(products.map((p) => [p.id, p]))

      // 2. Carregar OPs de Linha com product_id definido, ordenadas pela mais recente primeiro
      const orders = await pb.collection('pcp_orders').getFullList<PcpOrder>({
        filter: 'op_type = "Linha" && product_id != ""',
        sort: '-created',
      })

      // 3. Escolher a OP mais recente por product_id (apenas se quantity > 0)
      const mostRecentOrderByProduct = new Map<string, PcpOrder>()
      const allOrdersByProduct = new Map<string, PcpOrder[]>()

      for (const ord of orders) {
        if (!ord.product_id) continue
        const list = allOrdersByProduct.get(ord.product_id) || []
        list.push(ord)
        allOrdersByProduct.set(ord.product_id, list)

        if (!mostRecentOrderByProduct.has(ord.product_id)) {
          const q = Number(ord.quantity) || 0
          if (q > 0) {
            mostRecentOrderByProduct.set(ord.product_id, ord)
          }
        }
      }

      // 4. Carregar materiais de OP (pcp_order_materials) das OPs fonte
      const targetOrderIds = Array.from(mostRecentOrderByProduct.values()).map((o) => o.id)
      if (targetOrderIds.length === 0) {
        setCandidates([])
        setLoading(false)
        return
      }

      // Carregar em blocos de até 100 ids para não estourar URL filter
      const allMaterials: PcpOrderMaterial[] = []
      const chunkSize = 50
      for (let i = 0; i < targetOrderIds.length; i += chunkSize) {
        const chunk = targetOrderIds.slice(i, i + chunkSize)
        const filterStr = chunk.map((id) => `order_id = "${id}"`).join(' || ')
        const mats = await pb.collection('pcp_order_materials').getFullList<PcpOrderMaterial>({
          filter: filterStr,
          sort: 'created',
        })
        allMaterials.push(...mats)
      }

      // Agrupar materiais por order_id
      const materialsByOrderId = new Map<string, PcpOrderMaterial[]>()
      for (const m of allMaterials) {
        const l = materialsByOrderId.get(m.order_id) || []
        l.push(m)
        materialsByOrderId.set(m.order_id, l)
      }

      // 5. Carregar catálogo mestre de components e lista de categorias para enriquecer categoria/unidade
      let compCatalogMap = new Map<string, any>()
      let catList: ComponentCategory[] = []
      try {
        const [uMap, cats] = await Promise.all([
          fetchUnifiedCatalogMap(),
          getComponentCategories({ includeInactive: false }).catch(() => []),
        ])
        compCatalogMap = uMap
        catList = cats
        setAvailableCategories(cats)
      } catch (errCat) {
        console.warn('Aviso ao carregar catálogo unificado / categorias:', errCat)
      }

      // Mapa de categoria por ID para nome e vice-versa
      const catIdToName = new Map<string, string>()
      const catNameToId = new Map<string, string>()
      catList.forEach((c) => {
        catIdToName.set(c.id, c.name)
        catNameToId.set(c.name.toLowerCase().trim(), c.id)
      })

      // 6. Detecção prévia de contaminação cruzada (padrão OP 483):
      // Construir conjunto de códigos por OP para verificar se o MESMO conjunto exato
      // de códigos está sendo compartilhado como fonte de 2 ou mais produtos distintos.
      const codeSetByProduct = new Map<string, string>() // signature -> productId[]
      const signatureToProducts = new Map<string, string[]>()

      for (const [prodId, order] of mostRecentOrderByProduct.entries()) {
        const mats = materialsByOrderId.get(order.id) || []
        const codesList = mats
          .map((m) => normCode(m.code))
          .filter(Boolean)
          .sort()
        if (codesList.length >= 3) {
          const sig = codesList.join('|')
          codeSetByProduct.set(prodId, sig)
          const pList = signatureToProducts.get(sig) || []
          pList.push(prodId)
          signatureToProducts.set(sig, pList)
        }
      }

      // 7. Construir grupos de candidatos
      const groups: SyncCandidateGroup[] = []

      for (const [prodId, sourceOrder] of mostRecentOrderByProduct.entries()) {
        const product = productMap.get(prodId)
        if (!product) continue

        const mats = materialsByOrderId.get(sourceOrder.id) || []
        if (mats.length === 0) continue

        const opQty = Number(sourceOrder.quantity) || 1
        if (opQty <= 0) continue

        // Extrair composição atual do produto
        const existingComp: CompositionItem[] = Array.isArray(product.data?.composition)
          ? product.data.composition
          : []

        // Mapear existentes por código com trim e por descrição
        const existingCodes = new Set<string>()
        const existingDescs = new Set<string>()

        for (const itm of existingComp) {
          const cCode = normCode(itm.code)
          const cDesc = normDesc(itm.description)
          if (cCode) existingCodes.add(cCode)
          if (cDesc) existingDescs.add(cDesc)
        }

        const newItems: SyncCandidateItem[] = []
        const allCandidateItems: SyncCandidateItem[] = []

        for (const m of mats) {
          const mCode = normCode(m.code)
          const mDesc = (m.description || '').trim()
          const nDesc = normDesc(mDesc)

          let alreadyExists = false
          if (mCode && existingCodes.has(mCode)) {
            alreadyExists = true
          } else if (!mCode && nDesc) {
            for (const exD of existingDescs) {
              if (exD === nDesc || exD.includes(nDesc) || nDesc.includes(exD)) {
                alreadyExists = true
                break
              }
            }
          }

          const matQty = Number(m.quantity) || 0
          const perPiece = opQty > 0 ? matQty / opQty : matQty
          const formattedPerPiece =
            perPiece % 1 === 0 ? String(Math.round(perPiece)) : String(Number(perPiece.toFixed(4)))

          const catalogEntry = mCode ? compCatalogMap.get(mCode.toUpperCase()) : undefined
          const catalogCatId =
            (catalogEntry?.component as any)?.category ||
            (catalogEntry?.component as any)?.category_id ||
            ''
          const catalogCatName =
            (catalogEntry?.component as any)?.expand?.category?.name ||
            (catalogCatId ? catIdToName.get(catalogCatId) || '' : '')
          const resolvedUnit = catalogEntry?.unit || m.unit || 'UN'

          // Prioridade de categoria:
          // 1. Categoria da linha do material da OP (se preenchida na importação)
          // 2. Categoria do cadastro no catálogo unificado (fallback para OPs antigas)
          // 3. Em branco
          const opMatCategory = (m.category || '').trim()
          let finalCategoryName = ''
          let finalCategoryId = ''

          if (opMatCategory) {
            finalCategoryName = opMatCategory
            finalCategoryId =
              catNameToId.get(opMatCategory.toLowerCase()) ||
              (catNameToIdMap ? catNameToIdMap.get(opMatCategory.toLowerCase()) || '' : '')
          } else if (catalogCatName) {
            finalCategoryName = catalogCatName
            finalCategoryId = catalogCatId
          }

          const candidateItem: SyncCandidateItem = {
            id: `item_${prodId}_${m.id || allCandidateItems.length}_${mCode}`,
            code: mCode,
            description: mDesc,
            rawQty: matQty,
            qtyPerPiece: formattedPerPiece,
            unit: resolvedUnit,
            sector: m.sector || 'FABRICAÇÃO',
            measurements: m.measurements || '',
            category_id: finalCategoryId,
            category: finalCategoryName,
            origem: `OP ${sourceOrder.op_number || sourceOrder.order_number || sourceOrder.id}`,
            status: alreadyExists ? 'already_exists' : 'new',
          }

          allCandidateItems.push(candidateItem)
          if (!alreadyExists) {
            newItems.push(candidateItem)
          }
        }

        // =========================================================================
        // Detecção de Suspeito:
        // 1. Mesmo conjunto de códigos aparecendo como fonte de 2+ produtos diferentes (OP 483 style)
        // 2. Produto tem composição vazia, mas materiais foram criados quase simultaneamente (<= 60s)
        //    após outra OP de outro produto com lista idêntica
        // =========================================================================
        const suspiciousReasons: string[] = []
        let isSuspicious = false

        const mySig = codeSetByProduct.get(prodId)
        if (mySig) {
          const sharedWith = signatureToProducts.get(mySig) || []
          if (sharedWith.length >= 2) {
            isSuspicious = true
            const otherNames = sharedWith
              .filter((id) => id !== prodId)
              .map((id) => productMap.get(id)?.name || id)
              .slice(0, 3)
            suspiciousReasons.push(
              `Contaminação de lista cruzada: mesmo conjunto de códigos presente em outros produtos (${otherNames.join(', ')})`,
            )
          }
        }

        // Caso de criação rápida após outra OP de outro produto com materiais idênticos
        const orderCreatedTime = new Date(sourceOrder.created).getTime()
        for (const [otherProdId, otherOrder] of mostRecentOrderByProduct.entries()) {
          if (otherProdId === prodId) continue
          const otherTime = new Date(otherOrder.created).getTime()
          const diffSec = Math.abs(orderCreatedTime - otherTime) / 1000
          if (diffSec <= 120) {
            const otherSig = codeSetByProduct.get(otherProdId)
            if (mySig && otherSig && mySig === otherSig) {
              isSuspicious = true
              suspiciousReasons.push(
                `Materiais criados simultaneamente (${Math.round(diffSec)}s) a outra OP com lista idêntica (${productMap.get(otherProdId)?.name})`,
              )
              break
            }
          }
        }

        groups.push({
          productId: prodId,
          product,
          sourceOrder,
          sourceMaterialsCount: mats.length,
          newItems,
          existingItemsCount: existingComp.length,
          allCandidateItems,
          isSuspicious,
          suspiciousReasons,
          status: newItems.length === 0 ? 'applied' : 'pending',
        })
      }

      // Ordenar: produtos com novos itens primeiro, depois por nome
      groups.sort((a, b) => {
        if (a.newItems.length > 0 && b.newItems.length === 0) return -1
        if (a.newItems.length === 0 && b.newItems.length > 0) return 1
        return a.product.name.localeCompare(b.product.name)
      })

      setCandidates(groups)
    } catch (err: any) {
      console.error('Erro na varredura:', err)
      toast.error('Erro ao varrer composições de OPs: ' + (err?.message || 'Falha de conexão'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadScanData()
  }, [])

  // Filtragem de exibição
  const filteredGroups = useMemo(() => {
    return candidates.filter((g) => {
      if (showOnlyPending && g.newItems.length === 0) return false
      if (showOnlySuspicious && !g.isSuspicious) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const pName = g.product.name.toLowerCase()
        const pCode = (g.product.code || '').toLowerCase()
        const opNum = (g.sourceOrder.op_number || g.sourceOrder.order_number || '').toLowerCase()
        return pName.includes(q) || pCode.includes(q) || opNum.includes(q)
      }
      return true
    })
  }, [candidates, showOnlyPending, showOnlySuspicious, search])

  // Aprovados para lote (itens com newItems > 0 e NÃO suspeitos)
  const approvedForBatch = useMemo(() => {
    return candidates.filter((g) => g.newItems.length > 0 && !g.isSuspicious)
  }, [candidates])

  // Alternar expansão de accordion de itens
  const toggleExpand = (productId: string) => {
    setExpandedProductIds((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  // Mapa rápido de nome de categoria -> id (para gravação em category_id)
  const catNameToIdMap = useMemo(() => {
    const map = new Map<string, string>()
    availableCategories.forEach((c) => {
      map.set(c.name.toLowerCase().trim(), c.id)
    })
    return map
  }, [availableCategories])

  // Atualização em tempo real de categoria editada pelo usuário no preview
  const handleUpdateItemCategory = (productId: string, itemIdx: number, newCategory: string) => {
    setCandidates((prev) =>
      prev.map((group) => {
        if (group.productId !== productId) return group

        const updatedAll = [...group.allCandidateItems]
        const target = updatedAll[itemIdx]
        if (!target) return group

        const trimmedCat = newCategory.trim()
        const resolvedId = catNameToIdMap.get(trimmedCat.toLowerCase()) || target.category_id || ''

        const updatedItem: SyncCandidateItem = {
          ...target,
          category: trimmedCat,
          category_id: resolvedId,
        }
        updatedAll[itemIdx] = updatedItem

        // Atualizar também na lista newItems correspondente
        const updatedNew = group.newItems.map((ni) => {
          if (
            ni.id === target.id ||
            (normCode(ni.code) && normCode(ni.code) === normCode(target.code)) ||
            normDesc(ni.description) === normDesc(target.description)
          ) {
            return {
              ...ni,
              category: trimmedCat,
              category_id: resolvedId,
            }
          }
          return ni
        })

        return {
          ...group,
          allCandidateItems: updatedAll,
          newItems: updatedNew,
        }
      }),
    )
  }

  // Atualização em tempo real de etapa/setor editada pelo usuário no preview
  const handleUpdateItemSector = (productId: string, itemIdx: number, newSector: string) => {
    setCandidates((prev) =>
      prev.map((group) => {
        if (group.productId !== productId) return group

        const updatedAll = [...group.allCandidateItems]
        const target = updatedAll[itemIdx]
        if (!target) return group

        const updatedItem: SyncCandidateItem = {
          ...target,
          sector: newSector,
        }
        updatedAll[itemIdx] = updatedItem

        // Atualizar também na lista newItems correspondente
        const updatedNew = group.newItems.map((ni) => {
          if (
            ni.id === target.id ||
            (normCode(ni.code) && normCode(ni.code) === normCode(target.code)) ||
            normDesc(ni.description) === normDesc(target.description)
          ) {
            return {
              ...ni,
              sector: newSector,
            }
          }
          return ni
        })

        return {
          ...group,
          allCandidateItems: updatedAll,
          newItems: updatedNew,
        }
      }),
    )
  }

  // Executar merge aditivo idempotente no produto
  const applySyncToProduct = async (group: SyncCandidateGroup): Promise<boolean> => {
    try {
      // 1. Relê o produto fresco do banco
      const freshProduct = await pb.collection('products').getOne<Product>(group.productId)
      const currentComp: CompositionItem[] = Array.isArray(freshProduct.data?.composition)
        ? [...freshProduct.data.composition]
        : []

      // Mapa de existentes por código com trim e por descrição
      const existingCodes = new Set<string>()
      const existingDescs = new Set<string>()
      for (const itm of currentComp) {
        const cCode = normCode(itm.code)
        const cDesc = normDesc(itm.description)
        if (cCode) existingCodes.add(cCode)
        if (cDesc) existingDescs.add(cDesc)
      }

      let added = 0
      const nextIndexStart = currentComp.length + 1

      for (const newItem of group.newItems) {
        const itemCode = normCode(newItem.code)
        const itemDesc = (newItem.description || '').trim()
        const normItemDesc = normDesc(itemDesc)

        let alreadyThere = false
        if (itemCode && existingCodes.has(itemCode)) {
          alreadyThere = true
        } else if (!itemCode && normItemDesc) {
          for (const exD of existingDescs) {
            if (exD === normItemDesc || exD.includes(normItemDesc) || normItemDesc.includes(exD)) {
              alreadyThere = true
              break
            }
          }
        }

        if (alreadyThere) {
          continue
        }

        const categoryName = (newItem.category || '').trim()
        const categoryId =
          newItem.category_id ||
          (categoryName ? catNameToIdMap.get(categoryName.toLowerCase()) || '' : '')

        const compEntry: CompositionItem = {
          id: `sync_${group.sourceOrder.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          index: String(nextIndexStart + added),
          code: itemCode,
          description: itemDesc,
          quantity: newItem.qtyPerPiece,
          unit: newItem.unit || 'UN',
          etapa: newItem.sector || 'FABRICAÇÃO',
          measurements: newItem.measurements || '',
          category_id: categoryId,
          category: categoryName,
          origem: newItem.origem,
          data_importacao: new Date().toISOString(),
        }

        currentComp.push(compEntry)
        if (itemCode) existingCodes.add(itemCode)
        if (normItemDesc) existingDescs.add(normItemDesc)
        added++
      }

      if (added > 0) {
        await pb.collection('products').update(group.productId, {
          data: {
            ...freshProduct.data,
            composition: currentComp,
          },
        })
      }

      return true
    } catch (err: any) {
      console.error(`Falha ao sincronizar produto ${group.product.name}:`, err)
      return false
    }
  }

  // Handler para aplicação individual
  const handleApplySingle = async (group: SyncCandidateGroup) => {
    if (group.isSuspicious) {
      setSuspiciousConfirmGroup(group)
      return
    }

    setApplyingProductId(group.productId)
    const ok = await applySyncToProduct(group)
    setApplyingProductId(null)

    if (ok) {
      toast.success(
        `Composição de "${group.product.name}" sincronizada com sucesso (${group.newItems.length} novos itens)!`,
      )
      // Atualizar estado local
      setCandidates((prev) =>
        prev.map((c) =>
          c.productId === group.productId
            ? {
                ...c,
                newItems: [],
                status: 'applied',
                existingItemsCount: c.existingItemsCount + c.newItems.length,
              }
            : c,
        ),
      )
    } else {
      toast.error(`Erro ao sincronizar produto "${group.product.name}".`)
    }
  }

  // Confirmar aplicação de suspeito
  const handleConfirmSuspiciousApply = async () => {
    if (!suspiciousConfirmGroup) return
    const target = suspiciousConfirmGroup
    setSuspiciousConfirmGroup(null)
    setApplyingProductId(target.productId)

    const ok = await applySyncToProduct(target)
    setApplyingProductId(null)

    if (ok) {
      toast.success(
        `Composição de "${target.product.name}" sincronizada mediante confirmação expressa do gestor!`,
      )
      setCandidates((prev) =>
        prev.map((c) =>
          c.productId === target.productId
            ? {
                ...c,
                newItems: [],
                status: 'applied',
                existingItemsCount: c.existingItemsCount + c.newItems.length,
              }
            : c,
        ),
      )
    } else {
      toast.error(`Erro ao sincronizar "${target.product.name}".`)
    }
  }

  // Aplicar aprovados em lote
  const handleApplyApprovedBatch = async () => {
    setBatchActionRunning(true)
    let successCount = 0
    let failCount = 0

    for (const group of approvedForBatch) {
      const ok = await applySyncToProduct(group)
      if (ok) successCount++
      else failCount++
    }

    setBatchActionRunning(false)
    setBatchDialogOpen(false)

    if (successCount > 0) {
      toast.success(`Lote concluído: ${successCount} produto(s) sincronizado(s) com sucesso!`)
      loadScanData()
    }
    if (failCount > 0) {
      toast.error(`Houve falha em ${failCount} produto(s).`)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up pb-10">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate('/catalogo')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Sincronizar Composições de OPs
              </h1>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                Acesso Gestor
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Varredura de materiais importados em OPs para backfill aditivo no Catálogo Técnico.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={loadScanData}
            disabled={loading}
            className="text-xs"
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Varrer Novamente
          </Button>

          {isManager && (
            <Button
              size="sm"
              onClick={() => setBatchDialogOpen(true)}
              disabled={loading || approvedForBatch.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm"
            >
              <Check className="size-3.5 mr-1.5" />
              Aplicar Aprovados em Lote ({approvedForBatch.length})
            </Button>
          )}
        </div>
      </div>

      {/* Regras e aviso de integridade */}
      <Card className="bg-muted/40 border-muted">
        <CardContent className="p-4 flex items-start gap-3 text-xs text-muted-foreground leading-relaxed">
          <Info className="size-4 text-primary shrink-0 mt-0.5" />
          <div>
            <strong>Regras do Backfill:</strong> O sistema utiliza a{' '}
            <strong>OP mais recente</strong> de cada produto de linha como fonte. A gravação é{' '}
            <strong>estritamente aditiva</strong> (preserva etapas manuais existentes e nunca remove
            itens). Listas com suspeita de contaminação cruzada (padrão OP 483) ficam sinalizadas
            com <ShieldAlert className="inline size-3.5 text-amber-600" /> <strong>SUSPEITO</strong>{' '}
            e são <strong>bloqueadas de lote</strong>, exigindo confirmação individual do gestor.
          </div>
        </CardContent>
      </Card>

      {/* Filtros e Busca */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="relative flex-1 w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por produto, código ou OP..."
                className="pl-9 h-9 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              <Button
                variant={showOnlyPending ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 text-xs font-medium"
                onClick={() => setShowOnlyPending(!showOnlyPending)}
              >
                {showOnlyPending ? '✓ Apenas com Pendências' : 'Todos os Produtos'}
              </Button>

              <Button
                variant={showOnlySuspicious ? 'destructive' : 'ghost'}
                size="sm"
                className="h-8 text-xs font-medium"
                onClick={() => setShowOnlySuspicious(!showOnlySuspicious)}
              >
                <AlertTriangle className="size-3 mr-1" />
                {showOnlySuspicious ? 'Apenas Suspeitos' : 'Filtrar Suspeitos'}
              </Button>

              <span className="text-muted-foreground ml-2">
                Mostrando {filteredGroups.length} de {candidates.length} produtos
              </span>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Lista de Grupos */}
      {loading ? (
        <Card className="p-12 text-center text-muted-foreground">
          <RefreshCw className="size-8 mx-auto animate-spin text-primary mb-3" />
          <p className="font-semibold text-sm">Varrendo banco de dados e OPs recentes...</p>
          <p className="text-xs text-muted-foreground mt-1">
            Analisando vínculos entre produtos, OPs e pcp_order_materials.
          </p>
        </Card>
      ) : filteredGroups.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <CheckCircle2 className="size-10 mx-auto text-emerald-500 mb-2" />
          <p className="font-semibold text-base text-foreground">Tudo em dia!</p>
          <p className="text-xs text-muted-foreground mt-1">
            Nenhum produto pendente de sincronização com os filtros atuais.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => {
            const isExpanded = expandedProductIds.has(group.productId)
            const hasNew = group.newItems.length > 0
            const opLabel =
              group.sourceOrder.op_number || group.sourceOrder.order_number || group.sourceOrder.id

            return (
              <Card
                key={group.productId}
                className={`transition-all border ${
                  group.isSuspicious
                    ? 'border-amber-300 dark:border-amber-800 bg-amber-50/20 dark:bg-amber-950/10'
                    : hasNew
                      ? 'border-blue-200 dark:border-blue-900 bg-card'
                      : 'border-slate-200 dark:border-slate-800 opacity-80'
                }`}
              >
                <CardHeader className="py-3 px-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => toggleExpand(group.productId)}
                          className="flex items-center gap-1.5 font-bold text-base hover:text-primary transition-colors text-left"
                        >
                          {isExpanded ? (
                            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <span>{group.product.name}</span>
                        </button>
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {group.product.code || group.product.id}
                        </span>

                        {group.isSuspicious && (
                          <Badge
                            variant="outline"
                            className="bg-amber-100 text-amber-900 border-amber-400 font-bold text-[10px] flex items-center gap-1"
                          >
                            <ShieldAlert className="size-3 text-amber-700" />
                            SUSPEITO
                          </Badge>
                        )}

                        {hasNew ? (
                          <Badge
                            variant="outline"
                            className="bg-blue-50 text-blue-700 border-blue-300 font-semibold text-[10px]"
                          >
                            +{group.newItems.length} novo(s) a acrescentar
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold text-[10px] flex items-center gap-1"
                          >
                            <Check className="size-3 text-emerald-600" />
                            Composição completa
                          </Badge>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                        <span>
                          OP Fonte: <strong className="text-foreground">OP {opLabel}</strong> (Qtd:{' '}
                          {group.sourceOrder.quantity})
                        </span>
                        <span>•</span>
                        <span>
                          Composição atual: <strong>{group.existingItemsCount} item(ns)</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Itens na OP: <strong>{group.sourceMaterialsCount} item(ns)</strong>
                        </span>
                      </div>

                      {group.isSuspicious && group.suspiciousReasons.length > 0 && (
                        <div className="mt-1 text-xs text-amber-800 dark:text-amber-300 font-medium flex items-center gap-1.5">
                          <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
                          <span>{group.suspiciousReasons.join(' | ')}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpand(group.productId)}
                        className="text-xs h-8"
                      >
                        {isExpanded ? 'Ocultar Itens' : 'Ver Detalhes'}
                      </Button>

                      {hasNew && isManager && (
                        <Button
                          size="sm"
                          onClick={() => handleApplySingle(group)}
                          disabled={applyingProductId === group.productId}
                          className={`text-xs h-8 font-semibold ${
                            group.isSuspicious
                              ? 'bg-amber-600 hover:bg-amber-700 text-white'
                              : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                          }`}
                        >
                          {applyingProductId === group.productId ? (
                            <RefreshCw className="size-3 animate-spin mr-1" />
                          ) : (
                            <Sparkles className="size-3 mr-1" />
                          )}
                          {group.isSuspicious ? 'Revisar & Aplicar' : 'Aplicar no Catálogo'}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {/* Conteúdo Expandido com Pré-visualização de Itens Novos vs Existentes */}
                {isExpanded && (
                  <CardContent className="pt-0 px-4 pb-4 border-t bg-slate-50/50 dark:bg-slate-900/30">
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                        <span>
                          Preview da Composição: Novos ({group.newItems.length}) vs. Existentes (
                          {group.existingItemsCount})
                        </span>
                        <span className="text-[11px] font-normal">
                          Merge aditivo: preserva etapa, categoria e medidas
                        </span>
                      </div>

                      <div className="border rounded-md overflow-hidden bg-background">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50 text-[11px]">
                              <TableHead className="w-[100px]">Status</TableHead>
                              <TableHead className="w-[110px]">Código</TableHead>
                              <TableHead className="min-w-[200px]">Descrição</TableHead>
                              <TableHead className="w-[160px]">Categoria</TableHead>
                              <TableHead className="w-[150px]">Etapa/Setor</TableHead>
                              <TableHead className="w-[90px] text-right">Qtd / Peça</TableHead>
                              <TableHead className="w-[70px]">Unidade</TableHead>
                              <TableHead className="w-[110px]">Medida</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="text-xs">
                            {group.allCandidateItems.map((item, idx) => (
                              <TableRow
                                key={`${group.productId}_${item.code || item.description}_${idx}`}
                                className={
                                  item.status === 'new'
                                    ? 'bg-blue-50/40 dark:bg-blue-950/20 font-medium'
                                    : 'text-muted-foreground'
                                }
                              >
                                <TableCell>
                                  {item.status === 'new' ? (
                                    <Badge
                                      variant="outline"
                                      className="bg-blue-100 text-blue-800 border-blue-300 text-[10px] font-bold"
                                    >
                                      NOVO
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="bg-slate-100 text-slate-700 border-slate-300 text-[10px]"
                                    >
                                      Já Existe
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="font-mono text-[11px]">
                                  {item.code || (
                                    <span className="text-muted-foreground italic">S/ Código</span>
                                  )}
                                </TableCell>
                                <TableCell>{item.description}</TableCell>

                                {/* Coluna Categoria (Editável com datalist de categorias cadastradas) */}
                                <TableCell>
                                  <div className="relative">
                                    <input
                                      list={`categories-list-${group.productId}`}
                                      value={item.category || ''}
                                      onChange={(e) =>
                                        handleUpdateItemCategory(
                                          group.productId,
                                          idx,
                                          e.target.value,
                                        )
                                      }
                                      placeholder="Selecione ou digite..."
                                      className="h-7 w-full text-xs px-2 rounded-md border border-input bg-background shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                    />
                                    <datalist id={`categories-list-${group.productId}`}>
                                      {availableCategories.map((c) => (
                                        <option key={c.id} value={c.name} />
                                      ))}
                                    </datalist>
                                  </div>
                                </TableCell>

                                {/* Coluna Etapa/Setor (Dropdown Select editável) */}
                                <TableCell>
                                  <Select
                                    value={item.sector || 'FABRICAÇÃO'}
                                    onValueChange={(val) =>
                                      handleUpdateItemSector(group.productId, idx, val)
                                    }
                                  >
                                    <SelectTrigger className="h-7 text-xs w-full bg-background">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {STAGES.map((stage) => (
                                        <SelectItem key={stage} value={stage} className="text-xs">
                                          {stage}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>

                                <TableCell className="text-right font-semibold">
                                  {item.qtyPerPiece}
                                </TableCell>
                                <TableCell>{item.unit}</TableCell>
                                <TableCell>{item.measurements || '-'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Diálogo de confirmação para item SUSPEITO */}
      <AlertDialog
        open={!!suspiciousConfirmGroup}
        onOpenChange={(open) => !open && setSuspiciousConfirmGroup(null)}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <ShieldAlert className="size-5 text-amber-600" />
              Confirmação Extra de Lista Suspeita
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs space-y-2 text-foreground/80 pt-2">
              <p>
                O produto <strong>{suspiciousConfirmGroup?.product.name}</strong> possui indícios de
                contaminação cruzada de materiais (padrão OP 483):
              </p>
              <div className="p-2.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-amber-900 dark:text-amber-200 text-xs font-medium">
                {suspiciousConfirmGroup?.suspiciousReasons.join('\n')}
              </div>
              <p>
                Como gestor, você confirma que esta lista de materiais pertence legitimamente a este
                produto e aprova o acréscimo de{' '}
                <strong>{suspiciousConfirmGroup?.newItems.length} novos itens</strong> à composição?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
              onClick={handleConfirmSuspiciousApply}
            >
              Sim, Confirmar e Aplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de confirmação de LOTE */}
      <AlertDialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-5 text-emerald-600" />
              Aplicar Aprovados em Lote
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs space-y-2 text-foreground/80 pt-2">
              <p>
                Esta ação realizará o merge aditivo nos{' '}
                <strong>{approvedForBatch.length} produtos aprovados</strong> (sem sinais de
                contaminação).
              </p>
              <p>
                Nenhum item existente será apagado ou alterado. Itens marcados como SUSPEITOS{' '}
                <strong>não</strong> serão aplicados neste lote.
              </p>
              <p className="font-semibold text-foreground">Deseja prosseguir?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchActionRunning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={batchActionRunning}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              onClick={handleApplyApprovedBatch}
            >
              {batchActionRunning ? 'Aplicando...' : 'Confirmar Aplicação em Lote'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
