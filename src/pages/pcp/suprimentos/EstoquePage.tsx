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
import { getInventory, createInventoryItem } from '@/services/inventory'

export default function EstoquePage() {
  const [inventory, setInventory] = useState<Inventory[]>([])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [dossierOpen, setDossierOpen] = useState(false)
  const [dossierItem, setDossierItem] = useState<Inventory | null>(null)
  const [editItem, setEditItem] = useState<Inventory | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newQty, setNewQty] = useState('0')
  const [newMin, setNewMin] = useState('0')
  const [newUnit, setNewUnit] = useState('un')
  const { toast } = useToast()

  const fetchInventory = async () => {
    try {
      const res = await getInventory()
      setInventory(res)
    } catch {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchInventory()
  }, [])

  useRealtime('inventory', fetchInventory)
  useRealtime('inventory_movements', fetchInventory)

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

  const lowStockCount = inventory.filter((i) => i.quantity <= (i.min_quantity || 0)).length
  const totalItems = inventory.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0)

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total de Itens</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{inventory.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Estoque Baixo</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                'text-2xl font-bold',
                lowStockCount > 0 ? 'text-red-600' : 'text-slate-700 dark:text-slate-300',
              )}
            >
              {lowStockCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Saldo Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{totalItems}</p>
          </CardContent>
        </Card>
      </div>

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
                <TableHead className="text-right w-[100px]">Saldo</TableHead>
                <TableHead className="text-right w-[120px]">Estoque Mín.</TableHead>
                <TableHead className="w-[80px]">Unidade</TableHead>
                <TableHead className="text-center w-[100px]">Status</TableHead>
                <TableHead className="text-center w-[120px]">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInventory.map((item) => {
                const isLow = item.quantity <= (item.min_quantity || 0)
                return (
                  <TableRow
                    key={item.id}
                    className={cn(
                      'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors',
                      isLow && 'bg-red-50 dark:bg-red-950/20',
                    )}
                    onClick={() => setSelectedItemId(item.id)}
                  >
                    <TableCell className="text-xs font-medium text-slate-500">
                      {item.code}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{item.description}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn('font-bold', isLow && 'text-red-600')}>
                        {item.quantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {item.min_quantity || 0}
                    </TableCell>
                    <TableCell className="text-xs">{item.unit || '-'}</TableCell>
                    <TableCell className="text-center">
                      {isLow ? (
                        <Badge variant="destructive" className="text-[10px]">
                          <AlertTriangle className="size-3 mr-1" /> Baixo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
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
                            setEditItem(item)
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
        item={
          editItem
            ? {
                id: editItem.id,
                componentId: (editItem as any).component_id,
                code: editItem.code,
                description: editItem.description,
                quantity: editItem.quantity,
                min_quantity: editItem.min_quantity,
                unit: editItem.unit,
                isCatalogOnly: false,
              }
            : null
        }
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
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Descrição do item"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input type="number" value={newQty} onChange={(e) => setNewQty(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Estoque Mín.</Label>
                <Input type="number" value={newMin} onChange={(e) => setNewMin(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
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
