import React, { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FileText,
  Search,
  Link2,
  AlertTriangle,
  CheckCircle2,
  Package,
  Layers,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Info,
  ChevronRight,
  Sparkles,
  ShieldCheck,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import { useRealtime } from '@/hooks/use-realtime'
import pb from '@/lib/pocketbase/client'
import { cn } from '@/lib/utils'
import { normalizeSearchText } from '@/lib/pcp-utils'
import {
  comparePdfWithCatalog,
  parseQuantity,
  normalizeSector,
  extractCutMeasurementFromDescription,
  type ExtractedOpComponent,
  type ComponentComparisonRow,
} from '@/lib/op-pdf-parser'
import type {
  PcpOrder,
  Product,
  PcpOrderMaterial,
  PcpOrderObservation,
  CompositionItem,
  PcpOrderMaterialSector,
} from '@/types'

type FilterStatus = 'sem_vinculo' | 'vinculadas' | 'todas'

interface OrderWithMaterialsMeta {
  order: PcpOrder
  materialsCount: number
  extractedProductHint: string
  materials: PcpOrderMaterial[]
  observations: PcpOrderObservation[]
}

export default function PcpVinculosPdf() {
  const navigate = useNavigate()
  const { toast } = useToast()

  // State
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [materials, setMaterials] = useState<PcpOrderMaterial[]>([])
  const [observations, setObservations] = useState<Record<string, PcpOrderObservation[]>>({})
  const [loading, setLoading] = useState(true)

  // Filters
  const [activeMainTab, setActiveMainTab] = useState<'ops' | 'produtos_sem_comp'>('ops')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('sem_vinculo')
  const [search, setSearch] = useState('')
  const [productSearchCatalog, setProductSearchCatalog] = useState('')

  // Action: Atrelar produto modal
  const [selectedOpToLink, setSelectedOpToLink] = useState<OrderWithMaterialsMeta | null>(null)
  const [chosenProduct, setChosenProduct] = useState<Product | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [comparisonStep, setComparisonStep] = useState<'select' | 'compare'>('select')
  const [comparisonRows, setComparisonRows] = useState<ComponentComparisonRow[]>([])
  const [rowSectors, setRowSectors] = useState<Record<string, PcpOrderMaterialSector>>({})
  const [rowMeasurements, setRowMeasurements] = useState<Record<string, string>>({})
  const [fabricationApprovedIds, setFabricationApprovedIds] = useState<Set<string>>(new Set())
  const [isApplying, setIsApplying] = useState(false)
  const [confirmDialogData, setConfirmDialogData] = useState<{
    op: PcpOrder
    product: Product
    newCompositionCount: number
    newCount: number
    divergentApprovedCount: number
    keptCatalogCount: number
    autoImportedCount: number
    divergentPendingCount: number
    itemsToSave: CompositionItem[]
  } | null>(null)

  // Load all necessary data (strict read-only load)
  const loadData = async () => {
    setLoading(true)
    try {
      const [ordersRes, prodsRes, matsRes, obsRes] = await Promise.allSettled([
        pb.collection('pcp_orders').getFullList<PcpOrder>({
          sort: '-created',
          expand: 'product_id,client_id',
        }),
        pb.collection('products').getFullList<Product>({
          sort: 'name',
          expand: 'status',
        }),
        pb.collection('pcp_order_materials').getFullList<PcpOrderMaterial>({
          sort: 'code',
        }),
        pb.collection('pcp_order_observations').getFullList<PcpOrderObservation>({
          sort: 'created',
        }),
      ])

      if (ordersRes.status === 'fulfilled') {
        setOrders(ordersRes.value)
      }
      if (prodsRes.status === 'fulfilled') {
        setProducts(prodsRes.value)
      }
      if (matsRes.status === 'fulfilled') {
        setMaterials(matsRes.value)
      }
      if (obsRes.status === 'fulfilled') {
        const obsMap: Record<string, PcpOrderObservation[]> = {}
        obsRes.value.forEach((o) => {
          if (!obsMap[o.order_id]) obsMap[o.order_id] = []
          obsMap[o.order_id].push(o)
        })
        setObservations(obsMap)
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar dados',
        description: err.message || 'Não foi possível carregar as informações do PCP.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useRealtime('pcp_orders', loadData)
  useRealtime('pcp_order_materials', loadData)
  useRealtime('products', loadData)

  // Map of materials grouped by order_id
  const materialsByOrderId = useMemo(() => {
    const map = new Map<string, PcpOrderMaterial[]>()
    materials.forEach((m) => {
      const list = map.get(m.order_id) || []
      list.push(m)
      map.set(m.order_id, list)
    })
    return map
  }, [materials])

  // Process OPs:
  // Identify OPs created via PDF import or having materials/observations:
  // Usually op_type = 'Linha' (or with materials/op_number). The task says:
  // "listar todas as OPs criadas via importação de PDF, destacando as que estão SEM product_id vinculado (op_type Linha)"
  const enrichedOrders = useMemo<OrderWithMaterialsMeta[]>(() => {
    return orders.map((op) => {
      const orderMats = materialsByOrderId.get(op.id) || []
      const orderObs = observations[op.id] || []

      // Try to find extracted product name/code hint from observations or materials
      let extractedProductHint = ''
      if (op.manual_product_name) {
        extractedProductHint = op.manual_product_name
      } else if (orderObs.length > 0) {
        const prodObs = orderObs.find(
          (o) =>
            o.content.toLowerCase().includes('produto') ||
            o.content.toLowerCase().includes('item') ||
            o.content.toLowerCase().includes('cód'),
        )
        if (prodObs) {
          extractedProductHint = prodObs.content
        } else {
          extractedProductHint = orderObs[0].content
        }
      } else if (op.observations) {
        extractedProductHint = op.observations
      } else if (orderMats.length > 0) {
        // Find if any material has description hint
        extractedProductHint = `${orderMats.length} componente(s) importado(s)`
      }

      return {
        order: op,
        materialsCount: orderMats.length,
        extractedProductHint: extractedProductHint || '—',
        materials: orderMats,
        observations: orderObs,
      }
    })
  }, [orders, materialsByOrderId, observations])

  // Filtered OPs
  const filteredOrders = useMemo(() => {
    return enrichedOrders.filter((item) => {
      const op = item.order
      const hasProductId = !!op.product_id

      // Status filter
      if (filterStatus === 'sem_vinculo') {
        // Must be without product_id
        if (hasProductId) return false
      } else if (filterStatus === 'vinculadas') {
        if (!hasProductId) return false
      }

      // Search query filter (op_number or client_name or order_number or product name)
      if (search.trim()) {
        const q = normalizeSearchText(search)
        const opNum = normalizeSearchText(op.op_number || '')
        const clientName = normalizeSearchText(op.expand?.client_id?.name || op.client_name || '')
        const orderNum = normalizeSearchText(op.order_number || '')
        const prodHint = normalizeSearchText(item.extractedProductHint)
        const linkedProdName = normalizeSearchText(op.expand?.product_id?.name || '')
        const linkedProdCode = normalizeSearchText(op.expand?.product_id?.code || '')

        const match =
          opNum.includes(q) ||
          clientName.includes(q) ||
          orderNum.includes(q) ||
          prodHint.includes(q) ||
          linkedProdName.includes(q) ||
          linkedProdCode.includes(q)

        if (!match) return false
      }

      return true
    })
  }, [enrichedOrders, filterStatus, search])

  // Summary counts
  const totalOrders = enrichedOrders.length
  const unlinkedLinhaCount = enrichedOrders.filter(
    (item) => !item.order.product_id && item.order.op_type === 'Linha',
  ).length
  const unlinkedTotalCount = enrichedOrders.filter((item) => !item.order.product_id).length
  const linkedCount = enrichedOrders.filter((item) => !!item.order.product_id).length

  // Products without composition (for review tab)
  const productsWithoutComposition = useMemo(() => {
    return products.filter((prod) => {
      const comp = prod.data?.composition
      if (!comp || !Array.isArray(comp) || comp.length === 0) return true
      // Check if composition only has empty placeholder
      const hasValidItems = comp.some((c) => {
        const desc = (c.description || '').trim().toLowerCase()
        return desc && !desc.includes('não tem composição') && !desc.includes('nao tem composicao')
      })
      return !hasValidItems
    })
  }, [products])

  const filteredProductsWithoutComp = useMemo(() => {
    if (!productSearchCatalog.trim()) return productsWithoutComposition
    const q = normalizeSearchText(productSearchCatalog)
    return productsWithoutComposition.filter((p) => {
      const name = normalizeSearchText(p.name || '')
      const code = normalizeSearchText(p.code || '')
      return name.includes(q) || code.includes(q)
    })
  }, [productsWithoutComposition, productSearchCatalog])

  // Filtered products inside Link modal
  const filteredProductsModal = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 50)
    const q = normalizeSearchText(productSearch)
    return products.filter((p) => {
      const name = normalizeSearchText(p.name || '')
      const code = normalizeSearchText(p.code || '')
      return name.includes(q) || code.includes(q)
    })
  }, [products, productSearch])

  // Open Link dialog
  const handleOpenLinkModal = (item: OrderWithMaterialsMeta) => {
    setSelectedOpToLink(item)
    setChosenProduct(null)
    setProductSearch('')
    setComparisonStep('select')
    setComparisonRows([])

    // Pre-search suggestion: if OP has manual product name or code
    if (item.order.manual_product_name) {
      setProductSearch(item.order.manual_product_name.slice(0, 20))
    }
  }

  // Recalculate comparison rows based on overridden sectors and measurements
  const runComparison = (
    baseMats: PcpOrderMaterial[],
    prod: Product,
    secOverrides: Record<string, PcpOrderMaterialSector>,
    measOverrides: Record<string, string>,
  ) => {
    const pdfComponents: ExtractedOpComponent[] = baseMats.map((m, idx) => {
      const rowId = `row_${m.id || `mat_${idx}`}`
      const chosenSector = secOverrides[rowId] || m.sector || 'FABRICAÇÃO'
      const chosenMeas =
        measOverrides[rowId] !== undefined ? measOverrides[rowId] : m.measurements || ''

      return {
        id: m.id || `mat_${idx}`,
        sector: chosenSector,
        code: m.code || '',
        description: m.description || '',
        quantity: m.quantity || 1,
        unit: m.unit || 'UN',
        measurements: chosenMeas,
      }
    })

    return comparePdfWithCatalog(pdfComponents, prod)
  }

  // Choose product and calculate comparison
  const handleSelectProduct = (prod: Product) => {
    setChosenProduct(prod)
    setFabricationApprovedIds(new Set())

    if (!selectedOpToLink) return

    // Initialize sectors and measurements from materials / auto-extraction
    const initialSectors: Record<string, PcpOrderMaterialSector> = {}
    const initialMeasurements: Record<string, string> = {}

    selectedOpToLink.materials.forEach((m, idx) => {
      const rowId = `row_${m.id || `mat_${idx}`}`
      const rawSector = m.sector || 'FABRICAÇÃO'
      initialSectors[rowId] = normalizeSector(rawSector)
      const autoMedida = m.measurements || extractCutMeasurementFromDescription(m.description) || ''
      initialMeasurements[rowId] = autoMedida
    })

    setRowSectors(initialSectors)
    setRowMeasurements(initialMeasurements)

    const rows = runComparison(
      selectedOpToLink.materials,
      prod,
      initialSectors,
      initialMeasurements,
    )
    setComparisonRows(rows)
    setComparisonStep('compare')
  }

  // Change sector for a row and immediately recalculate comparison
  const handleSectorChange = (rowId: string, newSector: PcpOrderMaterialSector) => {
    const updatedSectors = { ...rowSectors, [rowId]: newSector }
    setRowSectors(updatedSectors)

    if (selectedOpToLink && chosenProduct) {
      const updatedRows = runComparison(
        selectedOpToLink.materials,
        chosenProduct,
        updatedSectors,
        rowMeasurements,
      )
      setComparisonRows(updatedRows)
    }
  }

  // Change cut measurement for a row
  const handleMeasurementChange = (rowId: string, newMeas: string) => {
    const updatedMeas = { ...rowMeasurements, [rowId]: newMeas }
    setRowMeasurements(updatedMeas)

    // Update in-memory comparisonRows so UI and tooltips reflect the new measurement
    setComparisonRows((prev) =>
      prev.map((r) => {
        if (r.id === rowId) {
          return {
            ...r,
            resolvedMeasurements: newMeas,
            pdfItem: r.pdfItem ? { ...r.pdfItem, measurements: newMeas } : undefined,
          }
        }
        return r
      }),
    )
  }

  // Toggle approval checkbox for fabrication item
  const toggleFabricationApproval = (rowId: string) => {
    setFabricationApprovedIds((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }
      return next
    })
  }

  // Build the proposed composition and counts according to Reginaldo's exact rules
  const buildProposedComposition = () => {
    if (!selectedOpToLink || !chosenProduct) return null

    const prod = chosenProduct
    const op = selectedOpToLink.order
    const opQty = Number(op.quantity) > 0 ? Number(op.quantity) : 1
    const importDate = new Date().toISOString()
    const opNumberLabel = op.op_number || op.order_number || ''
    const originLabel = `PDF OP ${opNumberLabel} (${new Date().toLocaleDateString('pt-BR')})`

    const existingComp: CompositionItem[] = Array.isArray(prod.data?.composition)
      ? [...prod.data.composition]
      : []

    // Helper to check if a stage exists in catalog
    const isStageEmptyInCatalog = (stage: string) => {
      const normStage = (stage || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      return !existingComp.some((c) => {
        const cEtapa = (c.etapa || '')
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
        const cDesc = (c.description || '').toLowerCase()
        if (cDesc.includes('não tem composição') || cDesc.includes('nao tem composicao'))
          return false
        return (
          cEtapa === normStage ||
          (normStage === 'PREPARACAO' && (cEtapa.includes('PREPAR') || cEtapa.includes('ACABAM')))
        )
      })
    }

    const emptyAcabamento = isStageEmptyInCatalog('PREPARAÇÃO')
    const emptyMontagem = isStageEmptyInCatalog('MONTAGEM')
    const emptyExpedicao = isStageEmptyInCatalog('EXPEDIÇÃO')

    // Clean existing catalog items (remove placeholder if any)
    const baseCatalogItems = existingComp.filter((c) => {
      const d = (c.description || '').toLowerCase()
      return !d.includes('não tem composição') && !d.includes('nao tem composicao')
    })

    const newComp: CompositionItem[] = []
    let newCount = 0
    let divergentApprovedCount = 0
    let divergentPendingCount = 0
    let keptCatalogCount = 0
    let autoImportedCount = 0

    // 1. Process CATALOG items:
    // "Só no Catálogo: JAMAIS removidos"
    // "Divergentes: só altera com aprovação item a item via checkbox"
    for (const catItem of baseCatalogItems) {
      const catSector = normalizeSector(catItem.etapa || 'FABRICAÇÃO')
      const matchingRow = comparisonRows.find((r) => r.catalogItem?.id === catItem.id)

      if (!matchingRow || matchingRow.status === 'removed' || matchingRow.status === 'same') {
        // Kept intact from catalog
        newComp.push({ ...catItem })
        keptCatalogCount++
      } else if (matchingRow.status === 'divergent') {
        const currentSector = rowSectors[matchingRow.id] || matchingRow.sector || catSector
        if (catSector === 'FABRICAÇÃO' || currentSector === 'FABRICAÇÃO') {
          const isApproved = fabricationApprovedIds.has(matchingRow.id)
          if (isApproved && matchingRow.pdfItem) {
            // Apply PDF item normalized by 1 piece with edited measurements and sector
            const normalizedQty =
              Math.round((Number(matchingRow.pdfItem.quantity) / opQty) * 10000) / 10000
            const activeMeasurements =
              rowMeasurements[matchingRow.id] !== undefined
                ? rowMeasurements[matchingRow.id]
                : matchingRow.pdfItem.measurements || catItem.measurements || ''

            newComp.push({
              ...catItem,
              code: matchingRow.pdfItem.code || catItem.code,
              description: matchingRow.pdfItem.description || catItem.description,
              quantity: normalizedQty,
              etapa: currentSector,
              measurements: activeMeasurements,
              origem: originLabel,
              data_importacao: importDate,
            })
            divergentApprovedCount++
          } else {
            // Not approved: keep catalog intact!
            newComp.push({ ...catItem })
            divergentPendingCount++
            keptCatalogCount++
          }
        } else {
          // If in other sectors and sector was NOT empty, keep catalog unless approved
          newComp.push({ ...catItem })
          keptCatalogCount++
        }
      } else {
        newComp.push({ ...catItem })
        keptCatalogCount++
      }
    }

    // 2. Process PDF items:
    // (1) ACABAMENTO, MONTAGEM e EXPEDIÇÃO: se o produto não tiver composição nesses setores,
    // importar automaticamente os itens correspondentes do PDF (agrupados por etapa)
    // (2) FABRICAÇÃO: novos no PDF entram SOMENTE se o gestor marcar
    for (const row of comparisonRows) {
      if (!row.pdfItem) continue
      const currentSector = rowSectors[row.id] || row.sector
      const normSec = normalizeSector(currentSector)
      const activeMeasurements =
        rowMeasurements[row.id] !== undefined
          ? rowMeasurements[row.id]
          : row.pdfItem.measurements || ''

      if (normSec === 'PREPARAÇÃO' && emptyAcabamento) {
        // Auto import
        const normalizedQty = Math.round((Number(row.pdfItem.quantity) / opQty) * 10000) / 10000
        newComp.push({
          id: `comp_pdf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          code: row.pdfItem.code || '',
          description: row.pdfItem.description,
          quantity: normalizedQty,
          measurements: activeMeasurements,
          etapa: 'PREPARAÇÃO',
          category_id: '',
          origem: originLabel,
          data_importacao: importDate,
          index: String(newComp.length + 1),
        })
        autoImportedCount++
        newCount++
      } else if (normSec === 'MONTAGEM' && emptyMontagem) {
        // Auto import
        const normalizedQty = Math.round((Number(row.pdfItem.quantity) / opQty) * 10000) / 10000
        newComp.push({
          id: `comp_pdf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          code: row.pdfItem.code || '',
          description: row.pdfItem.description,
          quantity: normalizedQty,
          measurements: activeMeasurements,
          etapa: 'MONTAGEM',
          category_id: '',
          origem: originLabel,
          data_importacao: importDate,
          index: String(newComp.length + 1),
        })
        autoImportedCount++
        newCount++
      } else if (normSec === 'EXPEDIÇÃO' && emptyExpedicao) {
        // Auto import
        const normalizedQty = Math.round((Number(row.pdfItem.quantity) / opQty) * 10000) / 10000
        newComp.push({
          id: `comp_pdf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          code: row.pdfItem.code || '',
          description: row.pdfItem.description,
          quantity: normalizedQty,
          measurements: activeMeasurements,
          etapa: 'EXPEDIÇÃO',
          category_id: '',
          origem: originLabel,
          data_importacao: importDate,
          index: String(newComp.length + 1),
        })
        autoImportedCount++
        newCount++
      } else if (normSec === 'FABRICAÇÃO' && row.status === 'new') {
        // Only if manager approved!
        if (fabricationApprovedIds.has(row.id)) {
          const normalizedQty = Math.round((Number(row.pdfItem.quantity) / opQty) * 10000) / 10000
          newComp.push({
            id: `comp_pdf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            code: row.pdfItem.code || '',
            description: row.pdfItem.description,
            quantity: normalizedQty,
            measurements: activeMeasurements,
            etapa: 'FABRICAÇÃO',
            category_id: '',
            origem: originLabel,
            data_importacao: importDate,
            index: String(newComp.length + 1),
          })
          newCount++
        }
      }
    }

    return {
      itemsToSave: newComp,
      newCount,
      divergentApprovedCount,
      keptCatalogCount,
      autoImportedCount,
      divergentPendingCount,
      opQty,
    }
  }

  // Open explicit confirmation before applying
  const handleRequestApply = () => {
    if (!selectedOpToLink || !chosenProduct) return

    const summary = buildProposedComposition()
    if (!summary) return

    setConfirmDialogData({
      op: selectedOpToLink.order,
      product: chosenProduct,
      newCompositionCount: summary.itemsToSave.length,
      newCount: summary.newCount,
      divergentApprovedCount: summary.divergentApprovedCount,
      keptCatalogCount: summary.keptCatalogCount,
      autoImportedCount: summary.autoImportedCount,
      divergentPendingCount: summary.divergentPendingCount,
      itemsToSave: summary.itemsToSave,
    })
  }

  // Execute apply composition and link product_id
  const handleConfirmApply = async () => {
    if (!confirmDialogData || !selectedOpToLink || !chosenProduct) return
    setIsApplying(true)

    try {
      const prod = chosenProduct
      const op = selectedOpToLink.order
      const finalComposition = confirmDialogData.itemsToSave

      // 1. Persist to PocketBase: update product.data.composition
      await pb.collection('products').update(prod.id, {
        data: {
          ...prod.data,
          composition: finalComposition,
        },
      })

      // 2. Persist to PocketBase: update pcp_orders.product_id
      await pb.collection('pcp_orders').update(op.id, {
        product_id: prod.id,
        op_type: 'Linha',
      })

      toast({
        title: 'Composição Aplicada com Sucesso!',
        description: `OP ${op.op_number || op.order_number} vinculada a "${prod.name}". Composição salva com ${finalComposition.length} itens (Modo Híbrido Aditivo).`,
      })

      setConfirmDialogData(null)
      setSelectedOpToLink(null)
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao aplicar composição',
        description: err.message || 'Ocorreu um erro ao gravar a composição híbrida.',
        variant: 'destructive',
      })
    } finally {
      setIsApplying(false)
    }
  }

  // Also support linking ONLY product_id without overriding composition if gestor wants
  const handleConfirmLinkOnly = async () => {
    if (!selectedOpToLink || !chosenProduct) return
    setIsApplying(true)

    try {
      const op = selectedOpToLink.order
      const prod = chosenProduct

      await pb.collection('pcp_orders').update(op.id, {
        product_id: prod.id,
        op_type: 'Linha',
      })

      toast({
        title: 'Produto Vinculado à OP',
        description: `A OP ${op.op_number || op.order_number} foi vinculada ao produto "${prod.name}". A composição do catálogo foi mantida inalterada.`,
      })

      setSelectedOpToLink(null)
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao vincular',
        description: err.message || 'Não foi possível vincular o produto.',
        variant: 'destructive',
      })
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-[1600px] mx-auto w-full">
      {/* HEADER PRINCIPAL COM ABAS DE NAVEGAÇÃO PCP */}
      <div className="flex flex-col gap-4 border-b pb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Tabs
            value="vinculos"
            className="w-auto"
            onValueChange={(val) => {
              if (val === 'ordens') navigate('/pcp/ordens')
              if (val === 'programacao') navigate('/pcp/programacao')
            }}
          >
            <TabsList className="bg-slate-100 dark:bg-slate-800 p-1">
              <TabsTrigger value="ordens" className="gap-2 text-sm font-semibold">
                <span>📋</span> Ordens de Produção
              </TabsTrigger>
              <TabsTrigger
                value="programacao"
                className="gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300"
              >
                <span>📅</span> Programação
              </TabsTrigger>
              <TabsTrigger
                value="vinculos"
                className="gap-2 text-sm font-semibold text-purple-700 dark:text-purple-300 data-[state=active]:bg-purple-600 data-[state=active]:text-white"
              >
                <Link2 className="size-4" />
                <span>Vínculos de PDF</span>
                {unlinkedLinhaCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="ml-1 text-[10px] h-4 px-1 py-0 bg-amber-500 text-slate-950 hover:bg-amber-500 font-bold"
                  >
                    {unlinkedLinhaCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="gap-1.5 text-xs h-9"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            Atualizar
          </Button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Link2 className="size-6 text-purple-600 dark:text-purple-400" />
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">
                Vínculos de PDF & Catálogo
              </h1>
              <Badge
                variant="outline"
                className="text-xs bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950 dark:text-purple-300"
              >
                Gestor PCP — Somente Leitura & Vínculo Seguro
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Painel de auditoria para OPs importadas via PDF. Identifique ordens sem vínculo ao
              catálogo técnico, compare listas de materiais e aplique a composição no produto com 1
              clique.
            </p>
          </div>

          {/* KPI CARDS */}
          <div className="flex items-center gap-3 flex-wrap">
            <div
              className={cn(
                'px-3.5 py-2 rounded-xl border text-left cursor-pointer transition-all',
                filterStatus === 'sem_vinculo'
                  ? 'border-amber-400 bg-amber-50/80 dark:bg-amber-950/40 ring-1 ring-amber-400'
                  : 'bg-card hover:bg-muted/50',
              )}
              onClick={() => {
                setActiveMainTab('ops')
                setFilterStatus('sem_vinculo')
              }}
            >
              <div className="text-[11px] font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1">
                <AlertTriangle className="size-3 text-amber-600" /> Sem Vínculo (Linha)
              </div>
              <div className="text-xl font-black text-amber-900 dark:text-amber-200">
                {unlinkedLinhaCount}
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({unlinkedTotalCount} total)
                </span>
              </div>
            </div>

            <div
              className={cn(
                'px-3.5 py-2 rounded-xl border text-left cursor-pointer transition-all',
                filterStatus === 'vinculadas'
                  ? 'border-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/40 ring-1 ring-emerald-400'
                  : 'bg-card hover:bg-muted/50',
              )}
              onClick={() => {
                setActiveMainTab('ops')
                setFilterStatus('vinculadas')
              }}
            >
              <div className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="size-3 text-emerald-600" /> Vinculadas
              </div>
              <div className="text-xl font-black text-emerald-900 dark:text-emerald-200">
                {linkedCount}
              </div>
            </div>

            <div
              className={cn(
                'px-3.5 py-2 rounded-xl border text-left cursor-pointer transition-all',
                activeMainTab === 'produtos_sem_comp'
                  ? 'border-blue-400 bg-blue-50/80 dark:bg-blue-950/40 ring-1 ring-blue-400'
                  : 'bg-card hover:bg-muted/50',
              )}
              onClick={() => setActiveMainTab('produtos_sem_comp')}
            >
              <div className="text-[11px] font-medium text-blue-800 dark:text-blue-300 flex items-center gap-1">
                <Package className="size-3 text-blue-600" /> Catálogo s/ Composição
              </div>
              <div className="text-xl font-black text-blue-900 dark:text-blue-200">
                {productsWithoutComposition.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* NAVEGAÇÃO ENTRE AS DUAS SEÇÕES: (1) OPs DE PDF e (2) PRODUTOS DO CATÁLOGO SEM COMPOSIÇÃO */}
      <Tabs
        value={activeMainTab}
        onValueChange={(val) => setActiveMainTab(val as 'ops' | 'produtos_sem_comp')}
        className="w-full space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <TabsList className="bg-muted/70 p-1">
            <TabsTrigger value="ops" className="gap-2 text-xs font-semibold">
              <FileText className="size-3.5" />
              Ordens de Produção (PDF)
              <Badge variant="secondary" className="text-[10px] ml-1">
                {enrichedOrders.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="produtos_sem_comp" className="gap-2 text-xs font-semibold">
              <Layers className="size-3.5 text-blue-600" />
              Produtos do Catálogo sem Composição
              <Badge variant="secondary" className="text-[10px] ml-1">
                {productsWithoutComposition.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {activeMainTab === 'ops' && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={filterStatus === 'sem_vinculo' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus('sem_vinculo')}
                className={cn(
                  'text-xs h-8 gap-1.5',
                  filterStatus === 'sem_vinculo' &&
                    'bg-amber-600 hover:bg-amber-700 text-white border-amber-600',
                )}
              >
                <AlertTriangle className="size-3" />
                Sem vínculo (Padrão)
              </Button>

              <Button
                variant={filterStatus === 'vinculadas' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus('vinculadas')}
                className={cn(
                  'text-xs h-8 gap-1.5',
                  filterStatus === 'vinculadas' &&
                    'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600',
                )}
              >
                <CheckCircle2 className="size-3" />
                Vinculadas
              </Button>

              <Button
                variant={filterStatus === 'todas' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus('todas')}
                className="text-xs h-8"
              >
                Todas as OPs ({totalOrders})
              </Button>
            </div>
          )}
        </div>

        {/* TAB 1: LISTA DAS OPS COM VÍNCULO/SEM VÍNCULO */}
        <TabsContent value="ops" className="m-0 space-y-4">
          {/* BARRA DE BUSCA */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-muted/40 p-3 rounded-lg border">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nº da OP, cliente, pedido ou produto do PDF..."
                className="pl-8 text-xs h-9 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap self-center">
              Mostrando <strong>{filteredOrders.length}</strong> de {enrichedOrders.length} ordens
            </div>
          </div>

          {/* TABELA DE OPS */}
          <div className="rounded-md border bg-card overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-100/70 dark:bg-slate-800/60 text-xs">
                <TableRow>
                  <TableHead className="w-[130px]">Nº da OP</TableHead>
                  <TableHead className="w-[100px]">Pedido</TableHead>
                  <TableHead className="w-[200px]">Cliente</TableHead>
                  <TableHead>Produto extraído do PDF / Header</TableHead>
                  <TableHead className="w-[140px] text-center">Itens de Material (OP)</TableHead>
                  <TableHead className="w-[220px]">Situação do Vínculo</TableHead>
                  <TableHead className="w-[150px] text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-12 text-muted-foreground text-xs"
                    >
                      <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                        <CheckCircle2 className="size-8 text-emerald-500" />
                        <p className="font-semibold text-sm text-foreground">
                          {filterStatus === 'sem_vinculo'
                            ? 'Nenhuma OP sem vínculo encontrada!'
                            : 'Nenhuma OP atende aos filtros atuais.'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {filterStatus === 'sem_vinculo'
                            ? 'Todas as OPs listadas possuem produto correspondente atrelado.'
                            : 'Tente alterar a busca ou os botões de filtro acima.'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((item) => {
                    const op = item.order
                    const isLinked = !!op.product_id
                    const linkedProduct = op.expand?.product_id
                    const isLinha = op.op_type === 'Linha'

                    return (
                      <TableRow
                        key={op.id}
                        className={cn(
                          'text-xs transition-colors',
                          !isLinked && isLinha && 'bg-amber-50/40 dark:bg-amber-950/20 font-medium',
                          !isLinked && !isLinha && 'hover:bg-muted/40',
                          isLinked && 'hover:bg-muted/30',
                        )}
                      >
                        {/* OP Number */}
                        <TableCell className="font-mono font-bold text-xs py-2">
                          <div className="flex items-center gap-1.5">
                            {!isLinked && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="size-2 rounded-full bg-amber-500 shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent>OP sem vínculo no catálogo</TooltipContent>
                              </Tooltip>
                            )}
                            <span>{op.op_number ? `OP ${op.op_number}` : 'S/ Nº OP'}</span>
                          </div>
                        </TableCell>

                        {/* Pedido */}
                        <TableCell className="font-mono text-muted-foreground py-2">
                          {op.order_number || '—'}
                        </TableCell>

                        {/* Cliente */}
                        <TableCell className="py-2 font-medium">
                          <span
                            className="truncate block max-w-[190px]"
                            title={op.expand?.client_id?.name || op.client_name}
                          >
                            {op.expand?.client_id?.name || op.client_name || '—'}
                          </span>
                        </TableCell>

                        {/* Produto extraído do PDF (nome/header ou observação) */}
                        <TableCell className="py-2">
                          <div className="flex flex-col gap-0.5">
                            <span
                              className="font-semibold text-slate-900 dark:text-slate-100 line-clamp-1"
                              title={item.extractedProductHint}
                            >
                              {item.extractedProductHint}
                            </span>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span>
                                Tipo: <strong>{op.op_type || 'Linha'}</strong>
                              </span>
                              <span>•</span>
                              <span>
                                Qtd: <strong>{op.quantity} peças</strong>
                              </span>
                            </div>
                          </div>
                        </TableCell>

                        {/* Quantidade de itens de material da OP (pcp_order_materials) */}
                        <TableCell className="text-center py-2">
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 border">
                            <Layers className="size-3 text-muted-foreground" />
                            <span>{item.materialsCount} item(ns)</span>
                          </div>
                        </TableCell>

                        {/* Situação do Vínculo */}
                        <TableCell className="py-2">
                          {isLinked ? (
                            <div className="flex flex-col gap-0.5">
                              <Badge
                                variant="outline"
                                className="bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 w-fit text-[11px] font-semibold gap-1"
                              >
                                <CheckCircle2 className="size-3 text-emerald-600" />
                                Vinculado
                              </Badge>
                              <span
                                className="text-[11px] text-slate-700 dark:text-slate-300 font-medium truncate max-w-[210px] block"
                                title={`${linkedProduct?.code || ''} - ${linkedProduct?.name || ''}`}
                              >
                                {linkedProduct?.code ? `[${linkedProduct.code}] ` : ''}
                                {linkedProduct?.name || 'Produto ID: ' + op.product_id}
                              </span>
                            </div>
                          ) : (
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[11px] font-bold gap-1 w-fit',
                                isLinha
                                  ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300',
                              )}
                            >
                              <AlertTriangle className="size-3 text-amber-600" />
                              Sem vínculo
                            </Badge>
                          )}
                        </TableCell>

                        {/* Ação */}
                        <TableCell className="text-right py-2">
                          {isLinked ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-8 gap-1 text-muted-foreground hover:text-foreground"
                              onClick={() => handleOpenLinkModal(item)}
                              title="Rever ou alterar vínculo"
                            >
                              <Link2 className="size-3.5" />
                              Rever vínculo
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              className="text-xs h-8 gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-sm"
                              onClick={() => handleOpenLinkModal(item)}
                            >
                              <Link2 className="size-3.5" />
                              Atrelar ao catálogo
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 2: PRODUTOS DO CATÁLOGO SEM COMPOSIÇÃO */}
        <TabsContent value="produtos_sem_comp" className="m-0 space-y-4">
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/60 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 text-xs">
            <div className="flex items-start gap-3">
              <Info className="size-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sm">
                  Produtos do Catálogo Técnico pendentes de Lista de Materiais / Composição
                </div>
                <p className="text-blue-800/90 dark:text-blue-300/90 leading-relaxed">
                  Estes produtos do catálogo não possuem itens cadastrados em{' '}
                  <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">
                    data.composition
                  </code>
                  . Quando uma OP em PDF entrar com este produto, você pode vincular a ordem
                  diretamente ou abrir a ficha no Catálogo para preencher a composição.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-muted/40 p-3 rounded-lg border">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produto sem composição por nome ou código..."
                className="pl-8 text-xs h-9 bg-background"
                value={productSearchCatalog}
                onChange={(e) => setProductSearchCatalog(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap self-center">
              Total: <strong>{filteredProductsWithoutComp.length}</strong> produtos
            </div>
          </div>

          <div className="rounded-md border bg-card overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-100/70 dark:bg-slate-800/60 text-xs">
                <TableRow>
                  <TableHead className="w-[140px]">Código</TableHead>
                  <TableHead>Nome do Produto</TableHead>
                  <TableHead className="w-[180px]">Status do Cadastro</TableHead>
                  <TableHead className="w-[180px] text-center">Itens na Composição</TableHead>
                  <TableHead className="w-[180px] text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProductsWithoutComp.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-10 text-muted-foreground text-xs"
                    >
                      Nenhum produto sem composição encontrado com os filtros atuais.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProductsWithoutComp.map((p) => (
                    <TableRow key={p.id} className="text-xs hover:bg-muted/30">
                      <TableCell className="font-mono font-bold text-xs">
                        {p.code || 'S/ Código'}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                        {p.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">
                          {p.expand?.status?.name || 'Ativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono text-muted-foreground">
                        0 itens válidos
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="text-xs h-8 gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                        >
                          <Link to={`/catalogo/${p.id}`} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-3" />
                            Abrir no Catálogo
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* DIÁLOGO MULTI-STEP: ATRELAR AO PRODUTO DO CATÁLOGO & COMPARAR COMPOSIÇÃO */}
      <Dialog
        open={!!selectedOpToLink}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOpToLink(null)
            setChosenProduct(null)
            setComparisonStep('select')
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-5 pb-3 border-b bg-slate-50/60 dark:bg-slate-900/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <Link2 className="size-5 text-purple-600" />
                  {comparisonStep === 'select'
                    ? 'Passo 1: Selecionar Produto do Catálogo'
                    : 'Passo 2: Comparação de Composição e Confirmação'}
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  OP:{' '}
                  <strong>
                    {selectedOpToLink?.order.op_number || selectedOpToLink?.order.order_number}
                  </strong>
                  {' — '}
                  Cliente:{' '}
                  <strong>
                    {selectedOpToLink?.order.expand?.client_id?.name ||
                      selectedOpToLink?.order.client_name ||
                      '—'}
                  </strong>
                  {' — '}
                  {selectedOpToLink?.materialsCount} item(ns) de material nesta OP
                </DialogDescription>
              </div>

              {chosenProduct && (
                <Badge
                  variant="outline"
                  className="px-2.5 py-1 text-xs border-purple-400 bg-purple-50 text-purple-900 dark:bg-purple-950 dark:text-purple-200 font-semibold"
                >
                  Selecionado: {chosenProduct.code ? `[${chosenProduct.code}] ` : ''}
                  {chosenProduct.name}
                </Badge>
              )}
            </div>
          </DialogHeader>

          {/* PASSO 1: SELETOR DE PRODUTO DO CATÁLOGO COM BUSCA */}
          {comparisonStep === 'select' && (
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Buscar produto por código ou nome:
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Digite o código (ex: 03220002) ou nome do produto..."
                    className="pl-9 text-xs h-9"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              {selectedOpToLink?.extractedProductHint && (
                <div className="p-3 rounded-lg bg-purple-50/70 border border-purple-200 dark:bg-purple-950/30 dark:border-purple-900 text-xs text-purple-900 dark:text-purple-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-purple-600 shrink-0" />
                    <span>
                      Dica extraída da OP: <strong>{selectedOpToLink.extractedProductHint}</strong>
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 text-purple-700 hover:text-purple-900"
                    onClick={() =>
                      setProductSearch(selectedOpToLink.extractedProductHint.slice(0, 30))
                    }
                  >
                    Usar na busca
                  </Button>
                </div>
              )}

              <div className="border rounded-lg overflow-hidden max-h-[360px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-muted/50 text-xs sticky top-0">
                    <TableRow>
                      <TableHead className="w-[140px]">Código</TableHead>
                      <TableHead>Nome do Produto</TableHead>
                      <TableHead className="w-[120px] text-center">Itens Catálogo</TableHead>
                      <TableHead className="w-[120px] text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProductsModal.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center py-8 text-muted-foreground text-xs"
                        >
                          Nenhum produto encontrado com o termo "{productSearch}".
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProductsModal.map((p) => {
                        const compCount = Array.isArray(p.data?.composition)
                          ? p.data.composition.length
                          : 0
                        return (
                          <TableRow
                            key={p.id}
                            className="text-xs hover:bg-muted/40 cursor-pointer"
                            onClick={() => handleSelectProduct(p)}
                          >
                            <TableCell className="font-mono font-bold text-xs py-2">
                              {p.code || 'S/ Cód'}
                            </TableCell>
                            <TableCell className="font-semibold text-slate-900 dark:text-slate-100 py-2">
                              {p.name}
                            </TableCell>
                            <TableCell className="text-center font-mono py-2">
                              {compCount} item(ns)
                            </TableCell>
                            <TableCell className="text-right py-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 gap-1 border-purple-400 text-purple-700 hover:bg-purple-50"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSelectProduct(p)
                                }}
                              >
                                Selecionar <ChevronRight className="size-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* PASSO 2: COMPARAÇÃO MATERIAIS DA OP VS COMPOSIÇÃO DO CATÁLOGO (MODO HÍBRIDO E ADITIVO) */}
          {comparisonStep === 'compare' &&
            chosenProduct &&
            (() => {
              const opQty =
                Number(selectedOpToLink?.order.quantity) > 0
                  ? Number(selectedOpToLink?.order.quantity)
                  : 1
              const existingComp = chosenProduct.data?.composition || []
              const isStageEmptyInCatalog = (stage: string) => {
                const normStage = (stage || '')
                  .toUpperCase()
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                return !existingComp.some((c) => {
                  const cEtapa = (c.etapa || '')
                    .toUpperCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                  const cDesc = (c.description || '').toLowerCase()
                  if (cDesc.includes('não tem composição') || cDesc.includes('nao tem composicao'))
                    return false
                  return (
                    cEtapa === normStage ||
                    (normStage === 'PREPARACAO' &&
                      (cEtapa.includes('PREPAR') || cEtapa.includes('ACABAM')))
                  )
                })
              }
              const emptyAcabamento = isStageEmptyInCatalog('PREPARAÇÃO')
              const emptyMontagem = isStageEmptyInCatalog('MONTAGEM')
              const emptyExpedicao = isStageEmptyInCatalog('EXPEDIÇÃO')

              const countSame = comparisonRows.filter((r) => r.status === 'same').length
              const countDivergent = comparisonRows.filter((r) => r.status === 'divergent').length
              const countNew = comparisonRows.filter((r) => r.status === 'new').length
              const countRemoved = comparisonRows.filter((r) => r.status === 'removed').length

              return (
                <div className="p-5 space-y-4 overflow-y-auto flex-1">
                  {/* REGRAS EXPLICATIVAS DO MODO HÍBRIDO E ADITIVO */}
                  <div className="p-3.5 rounded-lg border border-purple-200 bg-purple-50/70 dark:bg-purple-950/30 text-xs text-purple-950 dark:text-purple-200 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-purple-900 dark:text-purple-100">
                      <ShieldCheck className="size-4 text-purple-600" />
                      <span>Modo Híbrido & Aditivo — Regras de Segurança PCP</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] leading-relaxed">
                      <div className="p-2 rounded bg-white/60 dark:bg-slate-900/60 border border-purple-100 dark:border-purple-900">
                        <strong>1. Acabamento, Montagem e Expedição:</strong>
                        <p className="text-muted-foreground mt-0.5">
                          Setores vazios no catálogo recebem automaticamente os itens
                          correspondentes do PDF, normalizados por 1 peça (
                          {opQty > 1 ? `divididos por ${opQty}` : 'já em 1 peça'}).
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              emptyAcabamento
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : 'bg-slate-100 text-slate-600',
                            )}
                          >
                            Acabamento:{' '}
                            {emptyAcabamento ? 'Vazio (Importa Auto)' : 'Já possui itens'}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              emptyMontagem
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : 'bg-slate-100 text-slate-600',
                            )}
                          >
                            Montagem: {emptyMontagem ? 'Vazio (Importa Auto)' : 'Já possui itens'}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              emptyExpedicao
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : 'bg-slate-100 text-slate-600',
                            )}
                          >
                            Expedição: {emptyExpedicao ? 'Vazio (Importa Auto)' : 'Já possui itens'}
                          </Badge>
                        </div>
                      </div>
                      <div className="p-2 rounded bg-white/60 dark:bg-slate-900/60 border border-purple-100 dark:border-purple-900">
                        <strong>2. Fabricação (Nunca Sobrescreve):</strong>
                        <p className="text-muted-foreground mt-0.5">
                          Itens existentes no Catálogo <strong>JAMAIS são removidos</strong>. Itens
                          'Divergentes' só alteram com aprovação via checkbox. Itens 'Novos' só
                          entram se você marcar.
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-purple-800 dark:text-purple-300 font-medium">
                          <span>
                            • Normalização ativa: <strong>{opQty} un. da OP → 1 peça</strong>
                          </span>
                          <span>• Rastreabilidade com data de importação</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setComparisonStep('select')}
                      className="text-xs h-8"
                    >
                      ← Escolher outro produto
                    </Button>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className="bg-emerald-50 text-emerald-700 border-emerald-300 text-xs"
                      >
                        {countSame} Iguais (Nada a fazer)
                      </Badge>
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-800 border-amber-300 text-xs font-semibold"
                      >
                        {countDivergent} Divergentes (Exige aprovação)
                      </Badge>
                      <Badge
                        variant="outline"
                        className="bg-blue-50 text-blue-700 border-blue-300 text-xs"
                      >
                        {countNew} Novos no PDF
                      </Badge>
                      <Badge
                        variant="outline"
                        className="bg-slate-100 text-slate-700 border-slate-300 text-xs"
                      >
                        {countRemoved} Só no Catálogo (Preservados)
                      </Badge>
                    </div>
                  </div>

                  {/* TABELA DE COMPARAÇÃO LADO A LADO POR ITEM */}
                  <div className="border rounded-lg overflow-hidden max-h-[440px] overflow-y-auto">
                    <Table>
                      <TableHeader className="bg-muted/60 text-xs sticky top-0 z-10 shadow-sm">
                        <TableRow>
                          <TableHead className="w-[45px] text-center">Aprovar</TableHead>
                          <TableHead className="w-[140px]">Etapa / Setor</TableHead>
                          <TableHead className="w-[100px]">Cód. Item</TableHead>
                          <TableHead className="w-[28%]">
                            PDF da OP (Total OP: {opQty} un)
                          </TableHead>
                          <TableHead className="w-[140px]">Medida de Corte</TableHead>
                          <TableHead className="w-[28%]">Catálogo Técnico (1 Peça)</TableHead>
                          <TableHead className="w-[130px] text-center">Classificação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparisonRows.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className="text-center py-8 text-muted-foreground text-xs"
                            >
                              Nenhum componente encontrado na OP nem no catálogo.
                            </TableCell>
                          </TableRow>
                        ) : (
                          comparisonRows.map((row) => {
                            const currentSector: PcpOrderMaterialSector =
                              rowSectors[row.id] || normalizeSector(row.sector)
                            const isFabricacao = currentSector === 'FABRICAÇÃO'
                            const isAutoImportSector =
                              (currentSector === 'PREPARAÇÃO' && emptyAcabamento) ||
                              (currentSector === 'MONTAGEM' && emptyMontagem) ||
                              (currentSector === 'EXPEDIÇÃO' && emptyExpedicao)

                            const isChecked = fabricationApprovedIds.has(row.id)
                            const showCheckbox =
                              isFabricacao && (row.status === 'divergent' || row.status === 'new')

                            const pdfQtyNormalized = row.pdfItem
                              ? Math.round((Number(row.pdfItem.quantity) / opQty) * 10000) / 10000
                              : 0

                            const currentMeasurement =
                              rowMeasurements[row.id] !== undefined
                                ? rowMeasurements[row.id]
                                : row.pdfItem?.measurements || ''

                            return (
                              <TableRow
                                key={row.id}
                                className={cn(
                                  'text-xs transition-colors',
                                  isChecked && 'bg-purple-50/50 dark:bg-purple-950/20',
                                  row.status === 'divergent' &&
                                    !isChecked &&
                                    'bg-amber-50/30 dark:bg-amber-950/10',
                                  row.status === 'removed' && 'bg-slate-50/40 dark:bg-slate-900/20',
                                )}
                              >
                                {/* CHECKBOX DE APROVAÇÃO EXPLÍCITA */}
                                <TableCell className="text-center py-2.5">
                                  {showCheckbox ? (
                                    <div className="flex items-center justify-center">
                                      <Checkbox
                                        id={`check-${row.id}`}
                                        checked={isChecked}
                                        onCheckedChange={() => toggleFabricationApproval(row.id)}
                                        className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                        title={
                                          row.status === 'divergent'
                                            ? 'Marque para aprovar substituição dos dados do catálogo pelos do PDF'
                                            : 'Marque para adicionar este componente novo na Fabricação'
                                        }
                                      />
                                    </div>
                                  ) : isAutoImportSector && row.pdfItem ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center justify-center">
                                          <CheckCircle2 className="size-4 text-emerald-600" />
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent className="text-xs">
                                        Importação automática: setor vazio no catálogo
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : row.status === 'removed' ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center justify-center">
                                          <ShieldCheck className="size-4 text-slate-500" />
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent className="text-xs">
                                        Item preservado do catálogo (JAMAIS removido)
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <span className="text-muted-foreground text-[10px]">—</span>
                                  )}
                                </TableCell>

                                {/* SETOR / ETAPA (EDITÁVEL) */}
                                <TableCell className="py-2.5">
                                  {row.pdfItem ? (
                                    <div className="flex flex-col gap-1">
                                      <Select
                                        value={currentSector}
                                        onValueChange={(val) =>
                                          handleSectorChange(row.id, val as PcpOrderMaterialSector)
                                        }
                                      >
                                        <SelectTrigger className="h-7 text-[11px] font-semibold w-[125px] bg-white dark:bg-slate-900">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="FABRICAÇÃO" className="text-xs">
                                            FABRICAÇÃO
                                          </SelectItem>
                                          <SelectItem value="PREPARAÇÃO" className="text-xs">
                                            PREPARAÇÃO
                                          </SelectItem>
                                          <SelectItem value="MONTAGEM" className="text-xs">
                                            MONTAGEM
                                          </SelectItem>
                                          <SelectItem value="EXPEDIÇÃO" className="text-xs">
                                            EXPEDIÇÃO
                                          </SelectItem>
                                        </SelectContent>
                                      </Select>
                                      {isAutoImportSector && (
                                        <span className="text-[9px] text-emerald-700 dark:text-emerald-400 font-normal">
                                          Auto-importar
                                        </span>
                                      )}
                                      {isFabricacao && (
                                        <span className="text-[9px] text-purple-700 dark:text-purple-400 font-normal">
                                          Aprovação manual
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="font-semibold text-[11px] text-slate-700 dark:text-slate-300">
                                      {row.sector}
                                    </span>
                                  )}
                                </TableCell>

                                {/* CÓDIGO */}
                                <TableCell className="font-mono text-xs py-2.5">
                                  {row.code || '—'}
                                </TableCell>

                                {/* PDF ITEM */}
                                <TableCell className="py-2.5">
                                  {row.pdfItem ? (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="font-medium text-slate-900 dark:text-slate-100">
                                        {row.pdfItem.description}
                                      </span>
                                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono flex-wrap">
                                        <span>
                                          Total OP:{' '}
                                          <strong>
                                            {row.pdfItem.quantity} {row.pdfItem.unit || 'UN'}
                                          </strong>
                                        </span>
                                        {opQty > 1 && (
                                          <>
                                            <span>•</span>
                                            <span className="text-purple-700 dark:text-purple-300 font-semibold bg-purple-50 dark:bg-purple-950 px-1 rounded">
                                              ÷ {opQty} = <strong>{pdfQtyNormalized} / peça</strong>
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground italic text-[11px]">
                                      — Não consta no PDF da OP —
                                    </span>
                                  )}
                                </TableCell>

                                {/* MEDIDA DE CORTE (EDITÁVEL) */}
                                <TableCell className="py-2.5">
                                  {row.pdfItem ? (
                                    <div className="flex flex-col gap-1">
                                      <Input
                                        value={currentMeasurement}
                                        onChange={(e) =>
                                          handleMeasurementChange(row.id, e.target.value)
                                        }
                                        placeholder="Ex: 0,100M"
                                        className="h-7 text-xs font-mono w-[120px] bg-white dark:bg-slate-900"
                                      />
                                      {currentMeasurement && (
                                        <span className="text-[9px] text-muted-foreground font-mono">
                                          Grava measurements
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-[10px]">
                                      {row.catalogItem?.measurements || '—'}
                                    </span>
                                  )}
                                </TableCell>

                                {/* CATÁLOGO ITEM */}
                                <TableCell className="py-2.5">
                                  {row.catalogItem ? (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="font-medium text-slate-900 dark:text-slate-100">
                                        {row.catalogItem.description}
                                      </span>
                                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono flex-wrap">
                                        <span>
                                          Qtd: <strong>{row.catalogItem.quantity}</strong> (1 peça)
                                        </span>
                                        {row.catalogItem.measurements && (
                                          <>
                                            <span>•</span>
                                            <span>Medida: {row.catalogItem.measurements}</span>
                                          </>
                                        )}
                                        {row.catalogItem.origem && (
                                          <Badge
                                            variant="outline"
                                            className="text-[9px] py-0 px-1 text-muted-foreground"
                                          >
                                            {row.catalogItem.origem}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-blue-700 dark:text-blue-300 italic text-[11px] font-medium">
                                      {isAutoImportSector
                                        ? '+ Novo (será importado automaticamente p/ o setor)'
                                        : isFabricacao
                                          ? isChecked
                                            ? '+ Novo (Aprovado pelo gestor)'
                                            : '+ Novo no PDF (sugestão — marque para incluir)'
                                          : '+ Novo no PDF'}
                                    </span>
                                  )}
                                </TableCell>

                                {/* CLASSIFICAÇÃO / STATUS */}
                                <TableCell className="text-center py-2.5">
                                  {row.status === 'same' && (
                                    <Badge
                                      variant="outline"
                                      className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]"
                                    >
                                      Iguais
                                    </Badge>
                                  )}
                                  {row.status === 'divergent' && (
                                    <div className="flex flex-col items-center gap-1">
                                      <Badge
                                        variant="outline"
                                        className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-bold"
                                      >
                                        Divergente
                                      </Badge>
                                      {isFabricacao && (
                                        <span
                                          className={cn(
                                            'text-[9px] font-medium',
                                            isChecked
                                              ? 'text-purple-700 font-bold'
                                              : 'text-amber-800',
                                          )}
                                        >
                                          {isChecked ? 'Alterar aprovado' : 'Mantém catálogo'}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {row.status === 'new' && (
                                    <div className="flex flex-col items-center gap-1">
                                      <Badge
                                        variant="outline"
                                        className="bg-blue-100 text-blue-800 border-blue-300 text-[10px] font-bold"
                                      >
                                        Novos no PDF
                                      </Badge>
                                      {isFabricacao && (
                                        <span
                                          className={cn(
                                            'text-[9px] font-medium',
                                            isChecked
                                              ? 'text-purple-700 font-bold'
                                              : 'text-slate-500',
                                          )}
                                        >
                                          {isChecked ? 'Incluir aprovado' : 'Sugestão (desmarcado)'}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {row.status === 'removed' && (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <Badge
                                        variant="outline"
                                        className="bg-slate-100 text-slate-800 border-slate-300 text-[10px] font-semibold"
                                      >
                                        Só no Catálogo
                                      </Badge>
                                      <span className="text-[9px] text-emerald-700 dark:text-emerald-400 font-bold">
                                        JAMAIS removido
                                      </span>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )
            })()}

          <DialogFooter className="p-4 border-t bg-slate-50/60 dark:bg-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedOpToLink(null)}
              className="text-xs"
            >
              Cancelar
            </Button>

            {comparisonStep === 'compare' && chosenProduct && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleConfirmLinkOnly}
                  disabled={isApplying}
                  className="text-xs"
                  title="Apenas preenche product_id na OP sem alterar o catálogo"
                >
                  Apenas vincular (sem alterar catálogo)
                </Button>

                <Button
                  size="sm"
                  onClick={handleRequestApply}
                  disabled={isApplying}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs gap-1.5 shadow-sm"
                >
                  <Sparkles className="size-3.5" />
                  Aplicar composição da OP no produto
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CONFIRMAÇÃO EXPLÍCITA ANTES DE GRAVAR A COMPOSIÇÃO NO PRODUTO E ATRELAR A OP */}
      <AlertDialog
        open={!!confirmDialogData}
        onOpenChange={(open) => {
          if (!open) setConfirmDialogData(null)
        }}
      >
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100 text-base md:text-lg">
              <AlertTriangle className="size-5 text-amber-500" />
              Confirmar gravação da composição no Catálogo?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-xs space-y-3 pt-2 text-slate-700 dark:text-slate-300">
                <p>
                  Você está prestes a atualizar o produto{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {confirmDialogData?.product.name}
                  </strong>{' '}
                  (código <strong>{confirmDialogData?.product.code || 'S/ Cód'}</strong>) com base
                  na{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    OP {confirmDialogData?.op.op_number || confirmDialogData?.op.order_number}
                  </strong>{' '}
                  ({confirmDialogData?.op.quantity} un.).
                </p>

                {/* RESUMO VERBATIM SOLICITADO PELO GESTOR REGINALDO */}
                <div className="p-3 bg-purple-50 dark:bg-purple-950/40 rounded-lg border border-purple-200 dark:border-purple-900 text-xs text-purple-950 dark:text-purple-200 space-y-2">
                  <div className="font-bold flex items-center gap-1.5 text-purple-900 dark:text-purple-100 text-sm">
                    <ShieldCheck className="size-4 text-purple-600" />
                    <span>Resumo da Operação Híbrida & Aditiva:</span>
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100 text-xs bg-white/70 dark:bg-slate-900/70 p-2.5 rounded border border-purple-100 dark:border-purple-900 space-y-1">
                    <div className="text-purple-700 dark:text-purple-300 font-bold text-sm">
                      "{confirmDialogData?.newCount} itens novos,{' '}
                      {confirmDialogData?.divergentApprovedCount} divergentes a aprovar,{' '}
                      {confirmDialogData?.keptCatalogCount} mantidos do catálogo"
                    </div>
                    {confirmDialogData && confirmDialogData.divergentPendingCount > 0 && (
                      <div className="text-[11px] text-amber-700 dark:text-amber-300 font-normal">
                        ({confirmDialogData.divergentPendingCount} item(ns) divergente(s) não
                        marcado(s) permanecerão com os dados originais do catálogo)
                      </div>
                    )}
                  </div>

                  <div className="text-[11px] font-mono space-y-1 text-slate-700 dark:text-slate-300 pt-1">
                    <div>
                      • Total final na composição:{' '}
                      <strong>
                        {confirmDialogData?.newCompositionCount} componente(s) por 1 peça
                      </strong>
                    </div>
                    <div>
                      • Normalização: quantidades da OP divididas por{' '}
                      <strong>{confirmDialogData?.op.quantity || 1}</strong>
                    </div>
                    <div>
                      • Rastreabilidade: itens importados marcados com data de importação (
                      {new Date().toLocaleDateString('pt-BR')})
                    </div>
                    <div>
                      • Vínculo na OP: <strong>pcp_orders.product_id</strong> = "
                      {confirmDialogData?.product.id}"
                    </div>
                    <div>
                      • Modo de operação: <strong>Estritamente aditivo</strong> (nenhum dado de
                      catálogo é apagado)
                    </div>
                  </div>
                </div>

                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  Deseja prosseguir e aplicar esta composição de 1 peça no catálogo agora?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApplying}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmApply}
              disabled={isApplying}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold"
            >
              {isApplying ? 'Gravando...' : 'Sim, confirmar e gravar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
