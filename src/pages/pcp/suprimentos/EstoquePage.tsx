import { useState, useEffect } from 'react'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Inventory } from '@/types'
import { Warehouse, AlertTriangle, Plus, History, FileSpreadsheet, Pencil } from 'lucide-react'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { InventoryItemDialog } from './components/InventoryItemDialog'
import { EditInventoryItemDialog } from './components/EditInventoryItemDialog'
import { ProductDossierModal } from './components/ProductDossierModal'
import { ProductSearchBar } from './components/ProductSearchBar'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { NoTranslate } from '@/components/NoTranslate'
import { getInventory, createInventoryItem } from '@/services/inventory'
import { getActiveReservationsMap, normalizeCode } from '@/services/material-reservations'
import {
  getMaterialMinLevels,
  calculateMinLevelAlerts,
  PcpMaterialMinLevel,
  MaterialMinLevelAlertItem,
} from '@/services/material-min-levels'
import { MaterialMinLevelAlertBlock } from './components/MaterialMinLevelAlertBlock'
import { useAuth } from '@/hooks/use-auth'
import { isPcpManager } from '@/lib/message-sector'

export default function EstoquePage() {
  const { user } = useAuth()
  const isManager = isPcpManager(user)
  const [minLevels, setMinLevels] = useState<PcpMaterialMinLevel[]>([])
  const [minLevelAlerts, setMinLevelAlerts] = useState<MaterialMinLevelAlertItem[]>([])
  const [inventory, setInventory] = useState<Inventory[]>([])
  const [reservationsMap, setReservationsMap] = useState<Map<string, number>>(new Map())
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [dossierOpen, setDossierOpen] = useState(false)
  const [dossierItem, setDossierItem] = useState<Inventory | null>(null)
  const [editItem, setEditItem] = useState<{
    id?: string
    componentId?: string
    code: string
    description: string
    quantity?: number
    min_quantity?: number
    unit?: string
    isCatalogOnly?: boolean
  } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newQty, setNewQty] = useState('0')
  const [newMin, setNewMin] = useState('0')
  const [newUnit, setNewUnit] = useState('un')
  const { toast } = useToast()

  const fetchInventory = async () => {
    try {
      const [res, resvMap, levels] = await Promise.all([
        getInventory(),
        getActiveReservationsMap(),
        getMaterialMinLevels(),
      ])
      setInventory(res)
      setReservationsMap(resvMap)
      setMinLevels(levels)

      // Montar mapa de disponibilidade para os alertas de estoque mínimo
      const invByCode = new Map<string, any>()
      for (const item of res) {
        const norm = normalizeCode(item.code)
        if (norm) invByCode.set(norm, item)
      }

      const stockMapForAlerts = new Map<
        string,
        { totalStock: number; reservedStock: number; availableStock: number; unit?: string }
      >()
      for (const lvl of levels) {
        const norm = normalizeCode(lvl.material_code)
        if (!norm) continue
        const inv = invByCode.get(norm)
        const total = inv ? Number(inv.quantity) || 0 : 0
        const reserved = resvMap.get(norm) || 0
        const available = Math.max(0, total - reserved)
        stockMapForAlerts.set(norm, {
          totalStock: total,
          reservedStock: reserved,
          availableStock: available,
          unit: inv?.unit || 'un',
        })
      }

      const alerts = calculateMinLevelAlerts(levels, stockMapForAlerts)
      setMinLevelAlerts(alerts)
    } catch {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchInventory()
  }, [])

  useRealtime('inventory', fetchInventory)
  useRealtime('inventory_movements', fetchInventory)
  useRealtime('material_reservations', fetchInventory)
  useRealtime('material_separations', fetchInventory)
  useRealtime('pcp_material_min_levels', fetchInventory)
  useRealtime('components', fetchInventory)

  const selectedItem = inventory.find((i) => i.id === selectedItemId) ?? null

  const handleCreate = async () => {
    if (!newCode.trim() || !newDesc.trim()) {
      toast({
        title: 'Erro',
        description: 'Código e descrição são obrigatórios.',
        variant: 'destructive',
      })
      return
    }
    try {
      await createInventoryItem({
        code: newCode.trim(),
        description: newDesc.trim(),
        quantity: Number(newQty) || 0,
        min_quantity: Number(newMin) || 0,
        unit: newUnit.trim() || 'un',
      })
      toast({ title: 'Item criado com sucesso' })
      setCreateOpen(false)
      setNewCode('')
      setNewDesc('')
      setNewQty('0')
      setNewMin('0')
      setNewUnit('un')
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const [searchTerm, setSearchTerm] = useState('')

  const filteredInventory = inventory.filter((item) => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase().trim()
    const matchCode = item.code ? item.code.toLowerCase().includes(term) : false
    const matchDesc = item.description ? item.description.toLowerCase().includes(term) : false
    return matchCode || matchDesc
  })

  const lowStockCount = inventory.filter((i) => {
    const reserved = reservationsMap.get(normalizeCode(i.code)) || 0
    const available = Math.max(0, (Number(i.quantity) || 0) - reserved)
    return available <= (i.min_quantity || 0)
  }).length
  const totalItems = inventory.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0)
  const totalReserved = Array.from(reservationsMap.values()).reduce((acc, val) => acc + val, 0)
  const totalAvailable = Math.max(0, totalItems - totalReserved)

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <SuprimentosHeader
        title="Estoque"
        description="Controle de saldo de materiais, alertas de estoque mínimo e histórico de movimentações."
        icon={Warehouse}
        action={
          <div className="flex items-center gap-2">
            <ProductSearchBar
              className="w-64 sm:w-80"
              placeholder="Pesquisar produto (dossiê)..."
              onSelectProduct={(p) => {
                const inv = p.inventoryItem || inventory.find((i) => i.id === p.id) || null
                setDossierItem(
                  inv ||
                    ({
                      id: p.id || '',
                      code: p.code,
                      description: p.description,
                      quantity: p.quantity || 0,
                      created: '',
                      updated: '',
                    } as Inventory),
                )
                setDossierOpen(true)
              }}
            />
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="size-4 mr-2" /> Novo Item
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Estoque Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className="text-2xl font-bold text-slate-800 dark:text-slate-100 notranslate"
              translate="no"
            >
              {totalItems}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-700 dark:text-amber-400">
              Total Reservado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className="text-2xl font-bold text-amber-600 dark:text-amber-400 notranslate"
              translate="no"
            >
              {totalReserved}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-emerald-700 dark:text-emerald-400">
              Total Disponível
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 notranslate"
              translate="no"
            >
              {totalAvailable}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Estoque Crítico</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                'text-2xl font-bold notranslate',
                lowStockCount > 0 ? 'text-red-600' : 'text-slate-700 dark:text-slate-300',
              )}
              translate="no"
            >
              {lowStockCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bloco Alerta de Estoque Mínimo (Disponível abaixo da Margem de Segurança) */}
      <MaterialMinLevelAlertBlock
        alerts={minLevelAlerts}
        allMinLevels={minLevels}
        isManager={isManager}
        onReload={fetchInventory}
        onEditItem={(alertItem) => {
          const norm = normalizeCode(alertItem.code)
          const matchedInv = inventory.find((inv) => normalizeCode(inv.code) === norm)
          if (matchedInv) {
            setEditItem({
              id: matchedInv.id,
              componentId: (matchedInv as any).component_id,
              code: matchedInv.code,
              description: matchedInv.description,
              quantity: matchedInv.quantity,
              min_quantity: matchedInv.min_quantity,
              unit: matchedInv.unit,
              isCatalogOnly: false,
            })
          } else {
            setEditItem({
              code: alertItem.code,
              description: alertItem.description || '',
              min_quantity: alertItem.minLevel || 0,
              unit: 'un',
              isCatalogOnly: true,
            })
          }
        }}
      />

      {/* Barra de busca na listagem de estoque */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder="Pesquisar estoque por código ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-3 pr-8"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>
        {searchTerm && (
          <span className="text-xs text-muted-foreground self-center">
            {filteredInventory.length} de {inventory.length} item(ns) encontrado(s)
          </span>
        )}
      </div>

      {inventory.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          Nenhum item em estoque.
        </div>
      ) : filteredInventory.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          Nenhum item encontrado para &ldquo;{searchTerm}&rdquo;.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
              <TableRow>
                <TableHead className="w-[120px]">Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right w-[110px]">Estoque total</TableHead>
                <TableHead className="text-right w-[100px]">Reservado</TableHead>
                <TableHead className="text-right w-[100px]">Disponível</TableHead>
                <TableHead className="text-right w-[100px]">Estoque Mín.</TableHead>
                <TableHead className="w-[70px]">Unidade</TableHead>
                <TableHead className="text-center w-[90px]">Status</TableHead>
                <TableHead className="text-center w-[120px]">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInventory.map((item) => {
                const totalStock = Number(item.quantity) || 0
                const reservedStock = reservationsMap.get(normalizeCode(item.code)) || 0
                const availableStock = Math.max(0, totalStock - reservedStock)
                const isLow = availableStock <= (item.min_quantity || 0)
                return (
                  <TableRow
                    key={item.id}
                    className={cn(
                      'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors',
                      isLow && 'bg-red-50/70 dark:bg-red-950/20',
                    )}
                    onClick={() => setSelectedItemId(item.id)}
                  >
                    <TableCell className="text-xs font-medium text-slate-500 font-mono">
                      <NoTranslate as="span">{item.code}</NoTranslate>
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      <NoTranslate as="span">{item.description}</NoTranslate>
                    </TableCell>
                    <TableCell className="text-right">
                      <NoTranslate
                        as="span"
                        className="font-semibold text-slate-800 dark:text-slate-200"
                      >
                        {totalStock}
                      </NoTranslate>
                    </TableCell>
                    <TableCell className="text-right">
                      {reservedStock > 0 ? (
                        <NoTranslate
                          as="span"
                          className="font-bold text-amber-600 dark:text-amber-400"
                        >
                          {reservedStock}
                        </NoTranslate>
                      ) : (
                        <span className="text-muted-foreground text-xs">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <NoTranslate
                        as="span"
                        className={cn(
                          'font-bold',
                          availableStock === 0
                            ? 'text-red-600'
                            : isLow
                              ? 'text-amber-600'
                              : 'text-emerald-600 dark:text-emerald-400',
                        )}
                      >
                        {availableStock}
                      </NoTranslate>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      <NoTranslate as="span">{item.min_quantity || 0}</NoTranslate>
                    </TableCell>
                    <TableCell className="text-xs">
                      <NoTranslate as="span">{item.unit || '-'}</NoTranslate>
                    </TableCell>
                    <TableCell className="text-center">
                      {availableStock === 0 ? (
                        <Badge variant="destructive" className="text-[10px]">
                          Esgotado
                        </Badge>
                      ) : isLow ? (
                        <Badge variant="destructive" className="text-[10px]">
                          <AlertTriangle className="size-3 mr-1" /> Baixo
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="text-[10px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40"
                        >
                          OK
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDossierItem(item)
                            setDossierOpen(true)
                          }}
                          title="Abrir Dossiê / Ficha do Produto"
                        >
                          <FileSpreadsheet className="size-3 mr-1" /> Ficha
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditItem({
                              id: item.id,
                              componentId: (item as any).component_id,
                              code: item.code,
                              description: item.description,
                              quantity: item.quantity,
                              min_quantity: item.min_quantity,
                              unit: item.unit,
                              isCatalogOnly: false,
                            })
                          }}
                          title="Editar código, descrição, estoque mínimo e unidade"
                        >
                          <Pencil className="size-3 mr-1" /> Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedItemId(item.id)
                          }}
                        >
                          <History className="size-3 mr-1" /> Movim.
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <InventoryItemDialog
        item={selectedItem}
        open={!!selectedItemId}
        onOpenChange={(o) => !o && setSelectedItemId(null)}
      />

      <EditInventoryItemDialog
        open={!!editItem}
        onOpenChange={(open) => !open && setEditItem(null)}
        item={editItem}
        onSaved={fetchInventory}
      />

      <ProductDossierModal
        open={dossierOpen}
        onOpenChange={setDossierOpen}
        initialProduct={dossierItem}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Novo Item de Estoque</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Código</Label>
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Código do item"
                className="notranslate font-mono"
                translate="no"
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Descrição do item"
                className="notranslate"
                translate="no"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  className="notranslate"
                  translate="no"
                />
              </div>
              <div className="space-y-2">
                <Label>Estoque Mín.</Label>
                <Input
                  type="number"
                  value={newMin}
                  onChange={(e) => setNewMin(e.target.value)}
                  className="notranslate"
                  translate="no"
                />
              </div>
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Input
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  className="notranslate"
                  translate="no"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleCreate}>
              Criar Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
