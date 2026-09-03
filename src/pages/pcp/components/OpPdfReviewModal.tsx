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
import type { Product, PcpOrderMaterialSector } from '@/types'
import type {
  ExtractedOpHeader,
  ExtractedOpComponent,
  ComponentComparisonRow,
  ComparisonStatus,
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
    header: ExtractedOpHeader
    materialsForOp: Array<{
      sector: PcpOrderMaterialSector
      code: string
      description: string
      quantity: number
      unit: string
      measurements?: string
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
  const [activeSectorTab, setActiveSectorTab] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  // Keep state updated if props change
  useEffect(() => {
    setRows(initialRows)
  }, [initialRows])

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

  const handleConfirm = () => {
    // 1. Gather materials to be inserted into pcp_order_materials for this OP
    const materialsForOp = rows
      .filter((r) => r.applyToOp)
      .map((r) => ({
        sector: r.resolvedSector,
        code: r.resolvedCode || '',
        description: r.resolvedDescription,
        quantity: r.resolvedQuantity,
        unit: r.resolvedUnit || 'UN',
        measurements: r.resolvedMeasurements || '',
      }))

    // 2. Build updated catalog composition if user chose to update any item
    let catalogUpdates: { productId: string; newComposition: any[] } | undefined
    const itemsToUpdateCatalog = rows.filter((r) => r.updateCatalog)

    if (selectedProduct && itemsToUpdateCatalog.length > 0) {
      const existingComp = selectedProduct.data?.composition || []
      const updatedComp = [...existingComp]

      for (const row of itemsToUpdateCatalog) {
        if (row.status === 'divergent' && row.catalogItem) {
          const idx = updatedComp.findIndex((c) => c.id === row.catalogItem?.id)
          if (idx !== -1) {
            updatedComp[idx] = {
              ...updatedComp[idx],
              code: row.resolvedCode,
              description: row.resolvedDescription,
              quantity: row.resolvedQuantity,
              etapa: row.resolvedSector,
              measurements: row.resolvedMeasurements || updatedComp[idx].measurements || '',
            }
          }
        } else if (row.status === 'new') {
          updatedComp.push({
            id: `cat_new_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            code: row.resolvedCode,
            description: row.resolvedDescription,
            quantity: row.resolvedQuantity,
            etapa: row.resolvedSector,
            measurements: row.resolvedMeasurements || '',
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
                  <TableHead className="w-[120px]">Setor</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[30%]">Item na OP (PDF ERP)</TableHead>
                  <TableHead className="w-[30%]">Item no Catálogo Técnico</TableHead>
                  <TableHead className="w-[100px] text-center">Incluir na OP</TableHead>
                  <TableHead className="w-[110px] text-center">Atualizar Catálogo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-8 text-muted-foreground text-sm"
                    >
                      Nenhum item com os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => {
                    const sectorStyle = SECTOR_COLORS[row.sector] || SECTOR_COLORS.FABRICAÇÃO
                    const hasDivergence = row.status === 'divergent' || row.status === 'new'

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
                        {/* Sector */}
                        <TableCell>
                          <Badge
                            className={cn('text-[10px] px-2 py-0.5 font-bold', sectorStyle.badge)}
                          >
                            {row.sector}
                          </Badge>
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
                                <span className="font-mono font-bold text-primary text-xs">
                                  {row.pdfItem.code || 'S/Cód'}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 font-bold"
                                >
                                  {row.pdfItem.quantity} {row.pdfItem.unit || 'UN'}
                                </Badge>
                              </div>
                              <p className="font-medium text-slate-900 dark:text-slate-100 text-xs">
                                {row.pdfItem.description}
                              </p>
                              {row.pdfItem.measurements && (
                                <span className="text-[10px] text-muted-foreground">
                                  Medida: {row.pdfItem.measurements}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">
                              — Não consta no PDF da OP —
                            </span>
                          )}
                        </TableCell>

                        {/* Catalog Column */}
                        <TableCell className="border-l border-slate-200 dark:border-slate-800">
                          {row.catalogItem ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-xs">
                                  {row.catalogItem.code || 'S/Cód'}
                                </span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {row.catalogItem.quantity}{' '}
                                  {row.catalogItem.measurements
                                    ? `(${row.catalogItem.measurements})`
                                    : ''}
                                </Badge>
                              </div>
                              <p className="text-slate-700 dark:text-slate-300 text-xs">
                                {row.catalogItem.description}
                              </p>
                              {row.catalogItem.etapa && (
                                <span className="text-[10px] text-muted-foreground block">
                                  Etapa: {row.catalogItem.etapa}
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
