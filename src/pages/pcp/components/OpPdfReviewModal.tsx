import { useState, useMemo, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { NoTranslate } from '@/components/NoTranslate'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertTriangle,
  CheckCircle2,
  PlusCircle,
  MinusCircle,
  FileText,
  BookOpen,
  ArrowRight,
  RefreshCw,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Product, PcpOrderMaterialSector, ComponentCategory } from '@/types'
import { getComponentCategories } from '@/services/component-categories'
import { createMasterComponent, getMasterComponents } from '@/services/components'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  type ExtractedOpHeader,
  type ExtractedOpComponent,
  type ComponentComparisonRow,
  type ComparisonStatus,
  normalizeSector,
  comparePdfWithCatalog,
  extractCutMeasurementFromDescription,
  isLinearUnit,
} from '@/lib/op-pdf-parser'

const SECTOR_COLORS: Record<PcpOrderMaterialSector, { bg: string; text: string; badge: string }> = {
  FABRICAÇÃO: {
    bg: 'bg-blue-50/70 dark:bg-blue-950/20',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  },
  PREPARAÇÃO: {
    bg: 'bg-yellow-50/70 dark:bg-yellow-950/20',
    text: 'text-yellow-700 dark:text-yellow-300',
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  },
  MONTAGEM: {
    bg: 'bg-green-50/70 dark:bg-green-950/20',
    text: 'text-green-700 dark:text-green-300',
    badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  },
  EXPEDIÇÃO: {
    bg: 'bg-purple-50/70 dark:bg-purple-950/20',
    text: 'text-purple-700 dark:text-purple-300',
    badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  },
}

const SECTORS: PcpOrderMaterialSector[] = ['FABRICAÇÃO', 'PREPARAÇÃO', 'MONTAGEM', 'EXPEDIÇÃO']

interface OpPdfReviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  header: ExtractedOpHeader
  rawComponents: ExtractedOpComponent[]
  comparisonRows: ComponentComparisonRow[]
  selectedProduct?: Product | null
  onConfirm: (decisions: {
    header: Partial<ExtractedOpHeader>
    materialsForOp: Array<{
      sector: PcpOrderMaterialSector
      code?: string
      description: string
      quantity: number
      unit: string
      measurements?: string
      category?: string
    }>
    catalogUpdates?: {
      productId: string
      newComposition: any[]
    }
  }) => void
}
export function OpPdfReviewModal({
  open,
  onOpenChange,
  header: initialHeader,
  comparisonRows: initialRows,
  selectedProduct,
  onConfirm,
}: OpPdfReviewModalProps) {
  const [rows, setRows] = useState<ComponentComparisonRow[]>(initialRows)
  const [editableHeader, setEditableHeader] = useState<ExtractedOpHeader>(initialHeader)
  const [rowSectors, setRowSectors] = useState<Record<string, PcpOrderMaterialSector>>({})
  const [rowMeasurements, setRowMeasurements] = useState<Record<string, string>>({})
  const [rowQuantities, setRowQuantities] = useState<Record<string, number>>({})
  const [rowCategories, setRowCategories] = useState<Record<string, string>>({})
  const [availableCategories, setAvailableCategories] = useState<ComponentCategory[]>([])
  const [activeSectorTab, setActiveSectorTab] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  // Carrega categorias cadastradas do sistema
  useEffect(() => {
    getComponentCategories({ includeInactive: false })
      .then((cats) => setAvailableCategories(cats))
      .catch(() => {})
  }, [])

  // Initialize sector & cut measurement overrides from initial rows and deterministic extraction
  useEffect(() => {
    const initSec: Record<string, PcpOrderMaterialSector> = {}
    const initMeas: Record<string, string> = {}
    const initQty: Record<string, number> = {}
    const initCats: Record<string, string> = {}

    const opQtyVal = Number(initialHeader.quantity) > 0 ? Number(initialHeader.quantity) : 1

    initialRows.forEach((r) => {
      initSec[r.id] = normalizeSector(r.sector)
      const isLinear = isLinearUnit(r.pdfItem?.unit || r.resolvedUnit)
      const autoMedida = isLinear
        ? r.pdfItem?.measurements ||
          (r.pdfItem?.description
            ? extractCutMeasurementFromDescription(r.pdfItem.description, r.pdfItem.unit)
            : '') ||
          r.resolvedMeasurements ||
          ''
        : ''
      initMeas[r.id] = autoMedida

      const rawPdfQty = Number(r.pdfItem?.quantity ?? r.resolvedQuantity) || 1
      const normalized = Math.round((rawPdfQty / opQtyVal) * 10000) / 10000
      initQty[r.id] = normalized
      initCats[r.id] = r.resolvedCategory || r.suggestedCategory || 'Outros'
    })
    setRowSectors(initSec)
    setRowMeasurements(initMeas)
    setRowQuantities(initQty)
    setRowCategories(initCats)
    setRows(initialRows)
  }, [initialRows, initialHeader.quantity])

  const handleCategoryChange = (rowId: string, newCategory: string) => {
    setRowCategories((prev) => ({ ...prev, [rowId]: newCategory }))
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, resolvedCategory: newCategory } : r)),
    )
  }

  useEffect(() => {
    setEditableHeader(initialHeader)
  }, [initialHeader])

  const stats = useMemo(() => {
    const total = rows.length
    const same = rows.filter((r) => r.status === 'same').length
    const divergent = rows.filter((r) => r.status === 'divergent').length
    const newItems = rows.filter((r) => r.status === 'new').length
    const removed = rows.filter((r) => r.status === 'removed').length
    return { total, same, divergent, newItems, removed }
  }, [rows])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (activeSectorTab !== 'ALL' && row.sector !== activeSectorTab) return false
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false
      return true
    })
  }, [rows, activeSectorTab, statusFilter])

  // Recalculate comparison when sector or measurement changes
  const runComparison = (
    currentRows: ComponentComparisonRow[],
    prod: Product | undefined | null,
    sectorsMap: Record<string, PcpOrderMaterialSector>,
    measMap: Record<string, string>,
  ) => {
    if (!prod) return currentRows

    // Reconstruct ExtractedOpComponent list with current sector and measurement overrides
    const pdfComponents: ExtractedOpComponent[] = currentRows
      .filter((r) => r.pdfItem)
      .map((r, idx) => {
        const chosenSector = sectorsMap[r.id] || normalizeSector(r.sector)
        const chosenMeas =
          measMap[r.id] !== undefined
            ? measMap[r.id]
            : r.pdfItem?.measurements || r.resolvedMeasurements || ''

        return {
          id: r.pdfItem?.id || `pdf_${idx}`,
          sector: chosenSector,
          code: r.pdfItem?.code || '',
          description: r.pdfItem?.description || '',
          quantity: r.pdfItem?.quantity || 1,
          unit: r.pdfItem?.unit || 'UN',
          measurements: chosenMeas,
        }
      })

    const freshRows = comparePdfWithCatalog(pdfComponents, prod)
    // Preserve existing applyToOp and updateCatalog decisions, and keep user-edited measurements
    return freshRows.map((fr) => {
      const prev = currentRows.find((cr) => cr.id === fr.id)
      const userMeas = measMap[fr.id]
      return {
        ...fr,
        resolvedMeasurements: userMeas !== undefined ? userMeas : fr.resolvedMeasurements,
        pdfItem: fr.pdfItem
          ? {
              ...fr.pdfItem,
              measurements: userMeas !== undefined ? userMeas : fr.pdfItem.measurements,
            }
          : undefined,
        applyToOp: prev ? prev.applyToOp : fr.status !== 'removed',
        updateCatalog: prev ? prev.updateCatalog : false,
      }
    })
  }

  // Handle Sector Change for a row
  const handleSectorChange = (rowId: string, newSector: PcpOrderMaterialSector) => {
    const nextSectors = { ...rowSectors, [rowId]: newSector }
    setRowSectors(nextSectors)

    if (selectedProduct) {
      const recalculated = runComparison(rows, selectedProduct, nextSectors, rowMeasurements)
      setRows(recalculated)
    } else {
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                sector: newSector,
                resolvedSector: newSector,
                pdfItem: r.pdfItem ? { ...r.pdfItem, sector: newSector } : undefined,
              }
            : r,
        ),
      )
    }
  }

  // Handle Cut Measurement Change for a row
  const handleMeasurementChange = (rowId: string, newMeas: string) => {
    const nextMeas = { ...rowMeasurements, [rowId]: newMeas }
    setRowMeasurements(nextMeas)

    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              resolvedMeasurements: newMeas,
              pdfItem: r.pdfItem ? { ...r.pdfItem, measurements: newMeas } : undefined,
            }
          : r,
      ),
    )
  }

  // Handle Quantity Change for a row (normalized per piece)
  const handleQuantityChange = (rowId: string, newQty: number) => {
    const nextQty = { ...rowQuantities, [rowId]: newQty }
    setRowQuantities(nextQty)

    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              resolvedQuantity: newQty,
            }
          : r,
      ),
    )
  }

  const toggleApplyToOp = (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, applyToOp: !r.applyToOp } : r)))
  }

  const toggleUpdateCatalog = (id: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, updateCatalog: !r.updateCatalog } : r)),
    )
  }

  const updateResolvedField = (id: string, field: keyof ComponentComparisonRow, value: any) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  const handleApplyAllSame = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        applyToOp: r.status !== 'removed',
      })),
    )
  }

  const handleCheckAllCatalogUpdates = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        updateCatalog: r.status === 'divergent' || r.status === 'new',
      })),
    )
  }

  const handleConfirm = async () => {
    // 1. Gather materials to be inserted into pcp_order_materials for this OP
    const materialsForOp = rows
      .filter((r) => r.applyToOp)
      .map((r) => {
        const rawSec = rowSectors[r.id] || r.resolvedSector || r.sector
        const sectorVal: PcpOrderMaterialSector = normalizeSector(rawSec)
        const itemUnit = r.resolvedUnit || r.pdfItem?.unit || 'UN'
        const measVal =
          rowMeasurements[r.id] !== undefined
            ? rowMeasurements[r.id]
            : r.resolvedMeasurements || r.pdfItem?.measurements || ''
        const qtyVal = rowQuantities[r.id] !== undefined ? rowQuantities[r.id] : r.resolvedQuantity
        const catVal = rowCategories[r.id] || r.resolvedCategory || r.suggestedCategory || 'Outros'

        return {
          sector: sectorVal,
          code: r.resolvedCode || '',
          description: r.resolvedDescription,
          quantity: qtyVal,
          unit: itemUnit,
          measurements: measVal,
          category: catVal,
        }
      })

    // Sincroniza componentes novos ou sem categoria no cadastro mestre 'components'
    // Garantindo que componentes novos já entrem com a categoria escolhida pelo gestor
    try {
      const existingComps = await getMasterComponents('', { includeInactive: true })
      const compByCode = new Map<string, any>()
      const compByDesc = new Map<string, any>()
      existingComps.forEach((c) => {
        if (c.code) compByCode.set(c.code.trim().toLowerCase(), c)
        if (c.description) compByDesc.set(c.description.trim().toLowerCase(), c)
      })

      // Mapa de categoria por nome para obter id
      const catNameToId = new Map<string, string>()
      availableCategories.forEach((cat) => catNameToId.set(cat.name.toLowerCase().trim(), cat.id))

      for (const mat of materialsForOp) {
        const cleanC = (mat.code || '').trim().toLowerCase()
        const cleanD = mat.description.trim().toLowerCase()
        const targetCatId = catNameToId.get((mat.category || '').toLowerCase().trim())

        const match = (cleanC ? compByCode.get(cleanC) : undefined) || compByDesc.get(cleanD)

        if (!match) {
          // Componente novo: cria no mestre já com a categoria escolhida
          await createMasterComponent({
            code: mat.code,
            description: mat.description,
            unit: mat.unit,
            category: targetCatId,
            source: 'imported',
            active: true,
          }).catch(() => {})
        } else if (!match.category && targetCatId) {
          // Já existe mas não tem categoria: vincula a categoria escolhida
          // (sem alterar outros dados)
          await import('@/lib/pocketbase/client').then(({ default: pb }) =>
            pb
              .collection('components')
              .update(match.id, { category: targetCatId })
              .catch(() => {}),
          )
        }
      }
    } catch (_) {
      // Ignora erro silencioso no sync mestre para não travar o fluxo de OP
    }

    // 2. Build updated catalog composition if user chose to update any item
    let catalogUpdates: { productId: string; newComposition: any[] } | undefined
    const itemsToUpdateCatalog = rows.filter((r) => r.updateCatalog)

    if (selectedProduct && itemsToUpdateCatalog.length > 0) {
      const existingComp = selectedProduct.data?.composition || []
      const updatedComp = [...existingComp]

      for (const row of itemsToUpdateCatalog) {
        const sectorVal = rowSectors[row.id] || row.resolvedSector || row.sector
        const itemUnit = row.resolvedUnit || row.pdfItem?.unit || 'UN'
        const isLinear = isLinearUnit(itemUnit)
        const measVal =
          rowMeasurements[row.id] !== undefined
            ? rowMeasurements[row.id]
            : row.resolvedMeasurements || row.pdfItem?.measurements || ''
        const qtyVal =
          rowQuantities[row.id] !== undefined ? rowQuantities[row.id] : row.resolvedQuantity

        if (row.status === 'divergent' && row.catalogItem) {
          const idx = updatedComp.findIndex((c) => c.id === row.catalogItem?.id)
          if (idx !== -1) {
            updatedComp[idx] = {
              ...updatedComp[idx],
              code: row.resolvedCode,
              description: row.resolvedDescription,
              quantity: qtyVal,
              etapa: sectorVal,
              measurements: measVal || updatedComp[idx].measurements || '',
              unit: itemUnit,
            }
          }
        } else if (row.status === 'new') {
          updatedComp.push({
            id: `cat_new_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            code: row.resolvedCode,
            description: row.resolvedDescription,
            quantity: qtyVal,
            etapa: sectorVal,
            measurements: measVal,
            unit: itemUnit,
            index: '',
            category_id: '',
          })
        }
      }

      catalogUpdates = {
        productId: selectedProduct.id,
        newComposition: updatedComp,
      }
    }

    onConfirm({
      header: editableHeader,
      materialsForOp,
      catalogUpdates,
    })
    onOpenChange(false)
  }

  const renderStatusBadge = (status: ComparisonStatus) => {
    switch (status) {
      case 'same':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800 text-[11px] font-semibold flex items-center gap-1"
          >
            <CheckCircle2 className="size-3 text-emerald-600" /> Igual
          </Badge>
        )
      case 'divergent':
        return (
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800 text-[11px] font-bold flex items-center gap-1"
          >
            <AlertTriangle className="size-3 text-amber-600" /> Divergente
          </Badge>
        )
      case 'new':
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800 text-[11px] font-bold flex items-center gap-1"
          >
            <PlusCircle className="size-3 text-blue-600" /> Novo no PDF
          </Badge>
        )
      case 'removed':
        return (
          <Badge
            variant="outline"
            className="bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 text-[11px] font-medium flex items-center gap-1"
          >
            <MinusCircle className="size-3 text-slate-500" /> Apenas Catálogo
          </Badge>
        )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b bg-slate-50/60 dark:bg-slate-900/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <FileText className="size-5 text-primary" />
                Revisão e Cruzamento: PDF da OP vs. Catálogo Técnico
              </DialogTitle>
              <DialogDescription className="text-sm mt-0.5">
                O sistema sinaliza as divergências item a item. <strong>Você decide</strong> o que
                entra nesta OP e se o Catálogo Técnico deve ser atualizado.
              </DialogDescription>
            </div>
            {selectedProduct && (
              <Badge
                variant="outline"
                className="px-3 py-1 font-semibold text-xs border-primary/30"
              >
                <BookOpen className="size-3.5 mr-1 text-primary" />
                Catálogo: {selectedProduct.name} ({selectedProduct.code || 'S/Código'})
              </Badge>
            )}
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={cn(
                'p-2 rounded-lg border text-left transition-all',
                statusFilter === 'ALL'
                  ? 'bg-primary/10 border-primary font-bold'
                  : 'bg-card hover:bg-muted/50',
              )}
            >
              <span className="text-muted-foreground block text-[10px]">Total Componentes</span>
              <span className="text-base font-black">{stats.total}</span>
            </button>
            <button
              onClick={() => setStatusFilter('same')}
              className={cn(
                'p-2 rounded-lg border text-left transition-all',
                statusFilter === 'same'
                  ? 'bg-emerald-100 border-emerald-500 dark:bg-emerald-950/40 font-bold'
                  : 'bg-card hover:bg-muted/50',
              )}
            >
              <span className="text-emerald-700 dark:text-emerald-400 block text-[10px] flex items-center gap-1">
                <CheckCircle2 className="size-3" /> Iguais
              </span>
              <span className="text-base font-black text-emerald-700 dark:text-emerald-400">
                {stats.same}
              </span>
            </button>
            <button
              onClick={() => setStatusFilter('divergent')}
              className={cn(
                'p-2 rounded-lg border text-left transition-all',
                statusFilter === 'divergent'
                  ? 'bg-amber-100 border-amber-500 dark:bg-amber-950/40 font-bold'
                  : 'bg-card hover:bg-muted/50',
              )}
            >
              <span className="text-amber-800 dark:text-amber-300 block text-[10px] flex items-center gap-1">
                <AlertTriangle className="size-3" /> Divergentes
              </span>
              <span className="text-base font-black text-amber-800 dark:text-amber-300">
                {stats.divergent}
              </span>
            </button>
            <button
              onClick={() => setStatusFilter('new')}
              className={cn(
                'p-2 rounded-lg border text-left transition-all',
                statusFilter === 'new'
                  ? 'bg-blue-100 border-blue-500 dark:bg-blue-950/40 font-bold'
                  : 'bg-card hover:bg-muted/50',
              )}
            >
              <span className="text-blue-700 dark:text-blue-400 block text-[10px] flex items-center gap-1">
                <PlusCircle className="size-3" /> Novos (no PDF)
              </span>
              <span className="text-base font-black text-blue-700 dark:text-blue-400">
                {stats.newItems}
              </span>
            </button>
            <button
              onClick={() => setStatusFilter('removed')}
              className={cn(
                'p-2 rounded-lg border text-left transition-all col-span-2 sm:col-span-1',
                statusFilter === 'removed'
                  ? 'bg-slate-200 border-slate-500 dark:bg-slate-800 font-bold'
                  : 'bg-card hover:bg-muted/50',
              )}
            >
              <span className="text-slate-600 dark:text-slate-400 block text-[10px] flex items-center gap-1">
                <MinusCircle className="size-3" /> Apenas no Catálogo
              </span>
              <span className="text-base font-black">{stats.removed}</span>
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Header Extracted & Editable Fields */}
          <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg text-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-blue-900 dark:text-blue-200">
                <Info className="size-4 text-blue-600 shrink-0" />
                Dados Principais da OP (Valores extraídos editáveis):
              </div>
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                Ajuste qualquer campo antes de confirmar
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Pedido *
                </Label>
                <Input
                  value={editableHeader.order_number || ''}
                  onChange={(e) =>
                    setEditableHeader((prev) => ({ ...prev, order_number: e.target.value }))
                  }
                  placeholder="Ex: 13935"
                  className="h-8 text-xs bg-white dark:bg-slate-900 font-semibold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Data de Entrega *
                </Label>
                <Input
                  type="date"
                  value={editableHeader.delivery_date || ''}
                  onChange={(e) =>
                    setEditableHeader((prev) => ({ ...prev, delivery_date: e.target.value }))
                  }
                  className="h-8 text-xs bg-white dark:bg-slate-900"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Quantidade (peças) *
                </Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={editableHeader.quantity ?? 1}
                  onChange={(e) =>
                    setEditableHeader((prev) => ({
                      ...prev,
                      quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                    }))
                  }
                  className="h-8 text-xs bg-white dark:bg-slate-900 font-semibold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Número da OP
                </Label>
                <Input
                  value={editableHeader.op_number || ''}
                  onChange={(e) =>
                    setEditableHeader((prev) => ({ ...prev, op_number: e.target.value }))
                  }
                  placeholder="Ex: OP-01"
                  className="h-8 text-xs bg-white dark:bg-slate-900"
                />
              </div>
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Cliente
                </Label>
                <Input
                  value={editableHeader.client_name || ''}
                  onChange={(e) =>
                    setEditableHeader((prev) => ({ ...prev, client_name: e.target.value }))
                  }
                  placeholder="Nome do cliente"
                  className="h-8 text-xs bg-white dark:bg-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Sector Tabs Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <Tabs
              value={activeSectorTab}
              onValueChange={setActiveSectorTab}
              className="w-full sm:w-auto"
            >
              <TabsList className="grid grid-cols-5 h-9 text-xs">
                <TabsTrigger value="ALL" className="text-xs">
                  Todos ({rows.length})
                </TabsTrigger>
                {SECTORS.map((sec) => {
                  const count = rows.filter((r) => r.sector === sec).length
                  return (
                    <TabsTrigger key={sec} value={sec} className="text-xs">
                      {sec} ({count})
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={handleApplyAllSame}
              >
                Aplicar Todos do PDF na OP
              </Button>
              {selectedProduct && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-primary"
                  onClick={handleCheckAllCatalogUpdates}
                >
                  <RefreshCw className="size-3 mr-1" /> Marcar Atualização no Catálogo
                </Button>
              )}
            </div>
          </div>

          {/* Side by Side Comparison Table */}
          <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100/70 dark:bg-slate-800/70 text-xs font-bold">
                  <TableHead className="w-[120px]">Etapa / Setor</TableHead>
                  <TableHead className="w-[95px]">Status</TableHead>
                  <TableHead className="w-[22%]">Item na OP (PDF ERP)</TableHead>
                  <TableHead className="w-[130px]">Categoria</TableHead>
                  <TableHead className="w-[95px]">Qtd / Peça</TableHead>
                  <TableHead className="w-[115px]">Medida Corte</TableHead>
                  <TableHead className="w-[22%]">Item no Catálogo</TableHead>
                  <TableHead className="w-[85px] text-center">Incluir na OP</TableHead>
                  <TableHead className="w-[95px] text-center">Atualizar Catálogo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-8 text-muted-foreground text-sm"
                    >
                      Nenhum item com os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => {
                    const currentSector: PcpOrderMaterialSector =
                      rowSectors[row.id] || normalizeSector(row.sector)
                    const sectorStyle = SECTOR_COLORS[currentSector] || SECTOR_COLORS.FABRICAÇÃO
                    const hasDivergence = row.status === 'divergent' || row.status === 'new'
                    const opQty =
                      Number(editableHeader.quantity) > 0 ? Number(editableHeader.quantity) : 1
                    const pdfQtyNormalized = row.pdfItem
                      ? Math.round((Number(row.pdfItem.quantity) / opQty) * 10000) / 10000
                      : row.resolvedQuantity
                    const currentQty =
                      rowQuantities[row.id] !== undefined ? rowQuantities[row.id] : pdfQtyNormalized
                    const itemUnit = row.resolvedUnit || row.pdfItem?.unit || 'UN'
                    const isLinear = isLinearUnit(itemUnit)
                    const currentMeasurement =
                      rowMeasurements[row.id] !== undefined
                        ? rowMeasurements[row.id]
                        : row.resolvedMeasurements || row.pdfItem?.measurements || ''

                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          'text-xs transition-colors',
                          row.status === 'divergent' && 'bg-amber-50/40 dark:bg-amber-950/10',
                          row.status === 'new' && 'bg-blue-50/40 dark:bg-blue-950/10',
                          row.status === 'removed' &&
                            'bg-slate-50/60 dark:bg-slate-900/40 opacity-75',
                        )}
                      >
                        {/* Sector (Editável) */}
                        <TableCell>
                          {row.pdfItem ? (
                            <Select
                              value={currentSector}
                              onValueChange={(val) =>
                                handleSectorChange(row.id, val as PcpOrderMaterialSector)
                              }
                            >
                              <SelectTrigger className="h-7 text-[11px] font-semibold w-[120px] bg-white dark:bg-slate-900">
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
                          ) : (
                            <Badge
                              className={cn('text-[10px] px-2 py-0.5 font-bold', sectorStyle.badge)}
                            >
                              {row.sector}
                            </Badge>
                          )}
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {renderStatusBadge(row.status)}
                            {row.divergenceReasons && (
                              <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium leading-tight">
                                {row.divergenceReasons.join(' · ')}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* PDF Column */}
                        <TableCell className="border-l border-slate-200 dark:border-slate-800">
                          {row.pdfItem ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <NoTranslate
                                  as="span"
                                  className="font-mono font-bold text-primary text-xs"
                                >
                                  {row.pdfItem.code || 'S/Cód'}
                                </NoTranslate>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 font-bold notranslate"
                                  translate="no"
                                >
                                  Total OP: {row.pdfItem.quantity} {row.pdfItem.unit || 'UN'}
                                </Badge>
                              </div>
                              <p
                                className="font-medium text-slate-900 dark:text-slate-100 text-xs notranslate"
                                translate="no"
                              >
                                {row.pdfItem.description}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">
                              — Não consta no PDF da OP —
                            </span>
                          )}
                        </TableCell>

                        {/* Categoria (Sugestão automática editável) */}
                        <TableCell className="border-l border-slate-200 dark:border-slate-800">
                          {row.pdfItem ? (
                            <div className="space-y-1">
                              <Select
                                value={
                                  rowCategories[row.id] ||
                                  row.resolvedCategory ||
                                  row.suggestedCategory ||
                                  'Outros'
                                }
                                onValueChange={(val) => handleCategoryChange(row.id, val)}
                              >
                                <SelectTrigger className="h-7 text-[11px] font-medium w-[120px] bg-white dark:bg-slate-900">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableCategories.length > 0
                                    ? availableCategories.map((c) => (
                                        <SelectItem key={c.id} value={c.name} className="text-xs">
                                          {c.name}
                                        </SelectItem>
                                      ))
                                    : [
                                        'Usinagem',
                                        'Corte a Laser',
                                        'Borracha',
                                        'Cabos',
                                        'Repuxos',
                                        'Pedras',
                                        'Ferragens',
                                        'Estrutura/Solda',
                                        'Pintura',
                                        'Elétrica',
                                        'Outros',
                                      ].map((name) => (
                                        <SelectItem key={name} value={name} className="text-xs">
                                          {name}
                                        </SelectItem>
                                      ))}
                                </SelectContent>
                              </Select>
                              {row.suggestedCategory && (
                                <span className="text-[9px] text-muted-foreground block font-mono">
                                  Sugerida: {row.suggestedCategory}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>

                        {/* Quantidade por peça (Editável) */}
                        <TableCell className="border-l border-slate-200 dark:border-slate-800">
                          {row.pdfItem ? (
                            <div className="flex flex-col gap-1">
                              <Input
                                type="number"
                                step="any"
                                min="0"
                                value={currentQty}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value)
                                  handleQuantityChange(row.id, isNaN(val) ? 0 : Math.max(0, val))
                                }}
                                className="h-7 text-xs font-mono w-[85px] bg-white dark:bg-slate-900"
                              />
                              <span className="text-[9px] text-muted-foreground font-mono">
                                {opQty > 1 ? `${row.pdfItem.quantity} ÷ ${opQty}` : 'p/ 1 peça'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>

                        {/* Medida de Corte (Editável) */}
                        <TableCell className="border-l border-slate-200 dark:border-slate-800">
                          {row.pdfItem ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1">
                                <Input
                                  value={currentMeasurement}
                                  onChange={(e) => handleMeasurementChange(row.id, e.target.value)}
                                  placeholder="Ex: 0,100M"
                                  className="h-7 text-xs font-mono w-[105px] bg-white dark:bg-slate-900"
                                  title={
                                    isLinear
                                      ? 'Medida de corte (metro/linear)'
                                      : 'Medida de corte (opcional para item PC/UN)'
                                  }
                                />
                                {!isLinear && (
                                  <span
                                    className="text-[9px] text-muted-foreground font-mono shrink-0"
                                    title="Unidade original da OP"
                                  >
                                    {row.pdfItem.unit || 'PC/UN'}
                                  </span>
                                )}
                              </div>
                              {currentMeasurement ? (
                                <span className="text-[9px] text-muted-foreground font-mono">
                                  Grava corte
                                </span>
                              ) : isLinear ? (
                                <span className="text-[9px] text-amber-600 dark:text-amber-400 font-mono">
                                  Item linear s/ corte
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">
                              {row.catalogItem?.measurements || '—'}
                            </span>
                          )}
                        </TableCell>

                        {/* Catalog Column */}
                        <TableCell className="border-l border-slate-200 dark:border-slate-800">
                          {row.catalogItem ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <NoTranslate as="span" className="font-mono font-semibold text-xs">
                                  {row.catalogItem.code || 'S/Cód'}
                                </NoTranslate>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 notranslate"
                                  translate="no"
                                >
                                  {row.catalogItem.quantity}{' '}
                                  {row.catalogItem.measurements
                                    ? `(${row.catalogItem.measurements})`
                                    : ''}
                                </Badge>
                              </div>
                              <p
                                className="text-slate-700 dark:text-slate-300 text-xs notranslate"
                                translate="no"
                              >
                                {row.catalogItem.description}
                              </p>
                              {row.catalogItem.etapa && (
                                <span className="text-[10px] text-muted-foreground block">
                                  Etapa:{' '}
                                  <NoTranslate as="span">{row.catalogItem.etapa}</NoTranslate>
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">
                              — Não cadastrado no Catálogo —
                            </span>
                          )}
                        </TableCell>

                        {/* Decision: Apply to this OP */}
                        <TableCell className="text-center border-l border-slate-200 dark:border-slate-800">
                          <div className="flex flex-col items-center justify-center gap-1">
                            <Checkbox
                              checked={row.applyToOp}
                              onCheckedChange={() => toggleApplyToOp(row.id)}
                              id={`apply-${row.id}`}
                            />
                            <Label
                              htmlFor={`apply-${row.id}`}
                              className="text-[10px] cursor-pointer text-muted-foreground"
                            >
                              {row.applyToOp ? 'Sim' : 'Não'}
                            </Label>
                          </div>
                        </TableCell>

                        {/* Decision: Update Catalog */}
                        <TableCell className="text-center border-l border-slate-200 dark:border-slate-800">
                          {selectedProduct && hasDivergence ? (
                            <div className="flex flex-col items-center justify-center gap-1">
                              <Checkbox
                                checked={row.updateCatalog}
                                onCheckedChange={() => toggleUpdateCatalog(row.id)}
                                id={`cat-${row.id}`}
                              />
                              <Label
                                htmlFor={`cat-${row.id}`}
                                className="text-[10px] cursor-pointer text-primary font-medium"
                              >
                                {row.updateCatalog ? 'Atualizar' : 'Manter'}
                              </Label>
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
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

        <DialogFooter className="p-4 border-t bg-slate-50/60 dark:bg-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground text-left">
            <span>
              <strong>{rows.filter((r) => r.applyToOp).length}</strong> componentes selecionados
              para esta OP.
            </span>
            {rows.some((r) => r.updateCatalog) && (
              <span className="text-primary font-semibold ml-2">
                (<strong>{rows.filter((r) => r.updateCatalog).length}</strong> serão atualizados no
                Catálogo)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              className="bg-primary text-primary-foreground font-bold"
            >
              Aplicar e Preencher OP <ArrowRight className="size-4 ml-1.5" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
