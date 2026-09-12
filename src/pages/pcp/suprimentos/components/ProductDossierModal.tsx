import { useState, useEffect, useMemo, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserActionBadge } from '@/components/UserActionBadge'
import {
  Search,
  Package,
  ShoppingCart,
  ArrowLeftRight,
  Boxes,
  Clock,
  CheckCircle2,
  Calendar,
  Layers,
  FileSpreadsheet,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import {
  Inventory,
  InventoryMovement,
  MaterialShortage,
  OrdemCompra,
  OrdemCompraItem,
  PcpOrder,
  User,
} from '@/types'
import { format, parseISO, isValid } from 'date-fns'
import {
  calculateShortageBalance,
  findOtherOpDemands,
  isSameItem,
} from '@/services/material-consolidation'
import { cn } from '@/lib/utils'

function fmtDate(val?: string) {
  if (!val) return '-'
  try {
    const d = parseISO(val)
    return isValid(d) ? format(d, 'dd/MM/yyyy') : '-'
  } catch {
    return '-'
  }
}

function fmtCurrency(val?: number) {
  if (val == null || isNaN(val)) return '-'
  return `R$ ${Number(val).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export interface ProductDossierModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialProduct?: Inventory | MaterialShortage | null
}

export interface DossierPurchaseItem {
  id: string
  source: 'oc' | 'shortage'
  purchaseDate?: string
  supplier: string
  unitPrice: number
  totalPrice: number
  ocNumber: string
  quantity: number
  status?: string
  receivedBy?: User
  ocUser?: User
}

export function ProductDossierModal({
  open,
  onOpenChange,
  initialProduct,
}: ProductDossierModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<{
    id?: string
    code: string
    description: string
    inventoryItem?: Inventory | null
  } | null>(null)

  const [allInventory, setAllInventory] = useState<Inventory[]>([])
  const [allShortages, setAllShortages] = useState<MaterialShortage[]>([])
  const [allOcItems, setAllOcItems] = useState<OrdemCompraItem[]>([])
  const [allMovements, setAllMovements] = useState<InventoryMovement[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Carrega os dados necessários quando abre
  useEffect(() => {
    if (!open) return

    let cancelled = false
    setIsLoading(true)

    Promise.all([
      pb.collection('inventory').getFullList<Inventory>({ sort: 'description' }),
      pb.collection('material_shortages').getFullList<MaterialShortage>({
        sort: '-created',
        expand: 'order_id,order_id.product_id,received_by,requested_by',
      }),
      pb.collection('ordem_compra_itens').getFullList<OrdemCompraItem>({
        sort: '-created',
        expand: 'oc_id,oc_id.user_id,material_shortage_id',
      }),
      pb.collection('inventory_movements').getFullList<InventoryMovement>({
        sort: '-created',
        expand: 'inventory_id,order_id,user_id',
      }),
    ])
      .then(([inv, shortages, ocItens, movements]) => {
        if (cancelled) return
        setAllInventory(inv)
        setAllShortages(shortages)
        setAllOcItems(ocItens)
        setAllMovements(movements)
        setIsLoading(false)
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  // Se receber produto inicial pelo props
  useEffect(() => {
    if (initialProduct && open) {
      const code = ('code' in initialProduct ? initialProduct.code : '') || ''
      const description = initialProduct.description || ''
      const invMatch =
        allInventory.find(
          (i) =>
            (code && i.code && i.code.trim().toLowerCase() === code.trim().toLowerCase()) ||
            (i.description &&
              i.description.trim().toLowerCase() === description.trim().toLowerCase()),
        ) || ('min_quantity' in initialProduct ? (initialProduct as Inventory) : null)

      setSelectedProduct({
        id: invMatch?.id || initialProduct.id,
        code: invMatch?.code || code,
        description: invMatch?.description || description,
        inventoryItem: invMatch,
      })
      setSearchTerm(invMatch?.description || description || code)
    }
  }, [initialProduct, open, allInventory])

  // Fecha dropdown se clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Lista unificada para busca: todos do inventário + todos de shortages
  const searchableProducts = useMemo(() => {
    const list: Array<{
      key: string
      code: string
      description: string
      inventoryItem?: Inventory
      quantity?: number
    }> = []

    const seenKeys = new Set<string>()

    // Primeiro adicionar itens de estoque
    for (const inv of allInventory) {
      const descKey = (inv.description || '').trim().toLowerCase()
      const codeKey = (inv.code || '').trim().toLowerCase()
      const key = codeKey ? `code:${codeKey}` : `desc:${descKey}`
      if (!seenKeys.has(key)) {
        seenKeys.add(key)
        list.push({
          key,
          code: inv.code || '',
          description: inv.description || '',
          inventoryItem: inv,
          quantity: inv.quantity,
        })
      }
    }

    // Depois itens de shortages que possam não estar ainda no inventário
    for (const s of allShortages) {
      const descKey = (s.description || '').trim().toLowerCase()
      const codeKey = (s.code || '').trim().toLowerCase()
      const key = codeKey ? `code:${codeKey}` : `desc:${descKey}`
      if (!seenKeys.has(key) && (s.description || s.code)) {
        seenKeys.add(key)
        // Checar se bate com algum inventário pela descrição
        const matchInv = allInventory.find(
          (i) =>
            (s.code && i.code && i.code.trim().toLowerCase() === s.code.trim().toLowerCase()) ||
            (i.description && i.description.trim().toLowerCase() === descKey),
        )
        list.push({
          key,
          code: s.code || matchInv?.code || '',
          description: s.description || matchInv?.description || '',
          inventoryItem: matchInv,
          quantity: matchInv?.quantity,
        })
      }
    }

    return list
  }, [allInventory, allShortages])

  // Filtragem dos resultados de busca
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return []
    const term = searchTerm.toLowerCase().trim()
    return searchableProducts
      .filter((p) => {
        const codeMatch = p.code ? p.code.toLowerCase().includes(term) : false
        const descMatch = p.description ? p.description.toLowerCase().includes(term) : false
        return codeMatch || descMatch
      })
      .slice(0, 15)
  }, [searchableProducts, searchTerm])

  const handleSelectResult = (item: {
    code: string
    description: string
    inventoryItem?: Inventory
    id?: string
  }) => {
    const inv =
      item.inventoryItem ||
      allInventory.find(
        (i) =>
          (item.code && i.code && i.code.trim().toLowerCase() === item.code.trim().toLowerCase()) ||
          (item.description &&
            i.description.trim().toLowerCase() === item.description.trim().toLowerCase()),
      ) ||
      null

    setSelectedProduct({
      id: inv?.id,
      code: inv?.code || item.code || '',
      description: inv?.description || item.description || '',
      inventoryItem: inv,
    })
    setSearchTerm(inv?.description || item.description)
    setIsDropdownOpen(false)
  }

  // --- 1. CABEÇALHO & DADOS DE ESTOQUE ---
  const currentInventory = useMemo(() => {
    if (!selectedProduct) return null
    if (selectedProduct.inventoryItem) return selectedProduct.inventoryItem
    return (
      allInventory.find(
        (i) =>
          (selectedProduct.code &&
            i.code &&
            i.code.trim().toLowerCase() === selectedProduct.code.trim().toLowerCase()) ||
          (selectedProduct.description &&
            i.description.trim().toLowerCase() ===
              selectedProduct.description.trim().toLowerCase()),
      ) || null
    )
  }, [selectedProduct, allInventory])

  const stockBalance = currentInventory ? currentInventory.quantity : 0
  const minStock = currentInventory ? currentInventory.min_quantity || 0 : 0
  const isLowStock = currentInventory ? stockBalance <= minStock : false

  // --- 2. SEÇÃO COMPRAS: cruzando material_shortages + ordem_compra_itens/ordens_de_compra ---
  const purchases = useMemo<DossierPurchaseItem[]>(() => {
    if (!selectedProduct) return []
    const results: DossierPurchaseItem[] = []
    const seenShortageIds = new Set<string>()

    const normCode = selectedProduct.code?.trim().toLowerCase()
    const normDesc = selectedProduct.description?.trim().toLowerCase()

    const itemMatches = (code?: string, desc?: string) => {
      if (normCode && code && code.trim().toLowerCase() === normCode) return true
      if (normDesc && desc && desc.trim().toLowerCase() === normDesc) return true
      return false
    }

    // 1. Cruzar itens com OC vinculada (ordem_compra_itens)
    for (const ocItem of allOcItems) {
      const oc = ocItem.expand?.oc_id
      const match = itemMatches(ocItem.code, ocItem.description)
      if (match) {
        if (ocItem.material_shortage_id) {
          seenShortageIds.add(ocItem.material_shortage_id)
        }
        const unitPrice = Number(ocItem.unit_price) || 0
        const qty = Number(ocItem.quantity) || 0
        const total = Number(ocItem.total) || qty * unitPrice
        results.push({
          id: `oc-item-${ocItem.id}`,
          source: 'oc',
          purchaseDate: oc?.created || ocItem.created,
          supplier: oc?.supplier || '-',
          unitPrice,
          totalPrice: total,
          ocNumber: oc?.oc_number || '-',
          quantity: qty,
          status: oc?.status || 'OC',
          ocUser: oc?.expand?.user_id,
        })
      }
    }

    // 2. Cruzar compras registradas em material_shortages (se status for Compra, Recebido, Recebido_Parcial ou tiver supplier/purchase_date/unit_price)
    for (const s of allShortages) {
      if (seenShortageIds.has(s.id)) continue
      const match = itemMatches(s.code, s.description)
      if (match) {
        const isPurchaseLike =
          s.status === 'Compra' ||
          s.status === 'Recebido' ||
          s.status === 'Recebido_Parcial' ||
          !!s.purchase_date ||
          (Number(s.unit_price) || 0) > 0 ||
          !!s.supplier

        if (isPurchaseLike) {
          const unitPrice = Number(s.unit_price) || 0
          const qty = Number(s.quantity) || 0
          const total = unitPrice * qty
          results.push({
            id: `shortage-${s.id}`,
            source: 'shortage',
            purchaseDate: s.purchase_date || s.created,
            supplier: s.supplier || '-',
            unitPrice,
            totalPrice: total,
            ocNumber: '-',
            quantity: qty,
            status: s.status,
            receivedBy: s.expand?.received_by,
          })
        }
      }
    }

    // Ordenar cronologicamente decrescente
    return results.sort((a, b) => {
      const dateA = a.purchaseDate ? new Date(a.purchaseDate).getTime() : 0
      const dateB = b.purchaseDate ? new Date(b.purchaseDate).getTime() : 0
      return dateB - dateA
    })
  }, [selectedProduct, allOcItems, allShortages])

  // --- 3. SEÇÃO MOVIMENTAÇÕES: lista cronológica de entradas/saídas de inventory_movements ---
  const movements = useMemo<InventoryMovement[]>(() => {
    if (!selectedProduct) return []
    const invId = currentInventory?.id

    const normCode = selectedProduct.code?.trim().toLowerCase()
    const normDesc = selectedProduct.description?.trim().toLowerCase()

    return allMovements
      .filter((m) => {
        if (invId && m.inventory_id === invId) return true
        const inv = m.expand?.inventory_id
        if (inv) {
          if (normCode && inv.code && inv.code.trim().toLowerCase() === normCode) return true
          if (normDesc && inv.description && inv.description.trim().toLowerCase() === normDesc)
            return true
        }
        return false
      })
      .sort((a, b) => {
        const dateA = new Date(a.created).getTime()
        const dateB = new Date(b.created).getTime()
        return dateB - dateA
      })
  }, [selectedProduct, currentInventory, allMovements])

  // --- 4. SEÇÃO USO EM OPS ---
  // A) Peças totais utilizadas (soma das saídas de inventory_movements)
  const totalUsedPieces = useMemo(() => {
    return movements
      .filter((m) => m.type === 'Saída')
      .reduce((sum, m) => sum + (Number(m.quantity) || 0), 0)
  }, [movements])

  // B) Saídas agrupadas por pedido / OP
  const exitsByOp = useMemo(() => {
    const map = new Map<
      string,
      {
        orderId?: string
        opNumber: string
        orderNumber: string
        clientName?: string
        totalQuantity: number
        lastDate?: string
        lastUser?: any
        reasons: string[]
      }
    >()

    // Ordenar cronologicamente para garantir que a última movimentação determine lastDate e lastUser
    const sortedExits = movements
      .filter((m) => m.type === 'Saída')
      .sort((a, b) => {
        const dateA = new Date(a.exit_date || a.created).getTime()
        const dateB = new Date(b.exit_date || b.created).getTime()
        return dateA - dateB
      })

    sortedExits.forEach((m) => {
      const order = m.expand?.order_id
      const opNumber = order?.op_number || '-'
      const orderNumber = order?.order_number || '-'
      const key = order?.id || m.reason || 'sem-op'

      const existing = map.get(key) || {
        orderId: order?.id,
        opNumber: opNumber !== '-' ? opNumber : m.reason?.includes('OP') ? m.reason : 'OP Geral',
        orderNumber,
        clientName: order?.client_name,
        totalQuantity: 0,
        lastDate: m.exit_date || m.created,
        lastUser: m.expand?.user_id,
        reasons: [],
      }

      existing.totalQuantity += Number(m.quantity) || 0
      existing.lastDate = m.exit_date || m.created
      if (m.expand?.user_id) {
        existing.lastUser = m.expand.user_id
      }
      if (m.reason && !existing.reasons.includes(m.reason)) {
        existing.reasons.push(m.reason)
      }
      map.set(key, existing)
    })

    return Array.from(map.values()).sort((a, b) => b.totalQuantity - a.totalQuantity)
  }, [movements])

  // C) Reuso da lógica de consolidação de demanda já existente: solicitações em aberto do item com saldo pendente
  const consolidation = useMemo(() => {
    if (!selectedProduct) {
      return {
        openDemands: [],
        totalPendingQuantity: 0,
        countOpenOps: 0,
      }
    }

    const dummyShortage: Pick<MaterialShortage, 'code' | 'description'> = {
      code: selectedProduct.code,
      description: selectedProduct.description,
    }

    // Filtra todas as solicitações correspondentes em aberto
    const openDemands: Array<{
      shortageId: string
      orderNumber: string
      opNumber: string
      deliveryDate?: string
      quantity: number
      originalQuantity: number
      receivedQuantity: number
      status: string
      clientName?: string
    }> = []

    for (const s of allShortages) {
      if (s.status === 'Recebido' || s.status === 'Cancelado') continue
      if (!isSameItem(dummyShortage, s)) continue

      const balance = calculateShortageBalance(s)
      if (balance <= 0) continue

      const order = s.expand?.order_id
      const orderNumber = order?.order_number || (s.order_id ? 'OP vinculada' : 'Req. Geral')
      const opNumber = order?.op_number || '-'
      const deliveryDate = order?.delivery_date || s.expected_date

      openDemands.push({
        shortageId: s.id,
        orderNumber,
        opNumber,
        deliveryDate,
        quantity: balance,
        originalQuantity: Number(s.quantity) || 0,
        receivedQuantity: Number(s.received_quantity) || 0,
        status: s.status,
        clientName: order?.client_name,
      })
    }

    const totalPendingQuantity = openDemands.reduce((sum, d) => sum + d.quantity, 0)

    return {
      openDemands,
      totalPendingQuantity,
      countOpenOps: openDemands.length,
    }
  }, [selectedProduct, allShortages])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1000px] max-h-[92vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="pb-2 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Package className="size-5 text-blue-600" /> Ficha do Produto / Dossiê
          </DialogTitle>
        </DialogHeader>

        {/* BARRA DE PESQUISA DO PRODUTO (Autocomplete com busca por código OU descrição) */}
        <div className="relative flex-shrink-0 mb-4" ref={searchContainerRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setIsDropdownOpen(true)
              }}
              onFocus={() => {
                if (searchTerm.trim()) setIsDropdownOpen(true)
              }}
              placeholder="Pesquisar produto por código ou descrição..."
              className="pl-9 pr-9"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('')
                  setSelectedProduct(null)
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>

          {/* DROPDOWN DE RESULTADOS */}
          {isDropdownOpen && searchResults.length > 0 && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto bg-white dark:bg-slate-900 rounded-md border shadow-lg divide-y dark:divide-slate-800">
              {searchResults.map((item) => (
                <div
                  key={item.key}
                  onClick={() => handleSelectResult(item)}
                  className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between text-sm transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {item.description}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.code ? `Código: ${item.code}` : 'Sem código cadastrado'}
                    </span>
                  </div>
                  {item.quantity !== undefined && (
                    <Badge variant="outline" className="text-xs ml-2">
                      Saldo: {item.quantity}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CONTEÚDO PRINCIPAL DO DOSSIÊ */}
        {!selectedProduct ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center border-2 border-dashed rounded-lg text-muted-foreground">
            <Search className="size-10 text-slate-300 mb-2" />
            <p className="font-medium text-base">Nenhum produto selecionado</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Utilize o campo de busca acima para pesquisar por código ou descrição do produto e
              visualizar seu histórico completo de compras, movimentações e demanda.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-1 space-y-4">
            {/* CABEÇALHO COM CÓDIGO, DESCRIÇÃO, SALDO ATUAL E ESTOQUE MÍNIMO */}
            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-lg border">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-900">
                      {selectedProduct.code || 'SEM CÓDIGO'}
                    </span>
                    {isLowStock && (
                      <Badge variant="destructive" className="text-[10px]">
                        Estoque Baixo
                      </Badge>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {selectedProduct.description}
                  </h2>
                </div>

                <div className="flex items-center gap-4 text-right">
                  <div className="bg-white dark:bg-slate-900 px-3 py-2 rounded-md border text-left min-w-[110px]">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Saldo Atual
                    </span>
                    <span
                      className={cn(
                        'text-xl font-extrabold',
                        isLowStock ? 'text-red-600' : 'text-blue-600',
                      )}
                    >
                      {stockBalance} {currentInventory?.unit || 'un'}
                    </span>
                  </div>
                  <div className="bg-white dark:bg-slate-900 px-3 py-2 rounded-md border text-left min-w-[110px]">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Estoque Mínimo
                    </span>
                    <span className="text-xl font-bold text-slate-700 dark:text-slate-300">
                      {minStock} {currentInventory?.unit || 'un'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* SEÇÕES EM ABAS */}
            <Tabs defaultValue="compras" className="w-full">
              <TabsList className="grid grid-cols-3 w-full max-w-md">
                <TabsTrigger value="compras" className="flex items-center gap-1.5 text-xs">
                  <ShoppingCart className="size-3.5" />
                  Compras ({purchases.length})
                </TabsTrigger>
                <TabsTrigger value="movimentacoes" className="flex items-center gap-1.5 text-xs">
                  <ArrowLeftRight className="size-3.5" />
                  Movimentações ({movements.length})
                </TabsTrigger>
                <TabsTrigger value="uso_ops" className="flex items-center gap-1.5 text-xs">
                  <Boxes className="size-3.5" />
                  Uso em OPs ({exitsByOp.length + consolidation.openDemands.length})
                </TabsTrigger>
              </TabsList>

              {/* SEÇÃO COMPRAS: todas as compras do item (data, fornecedor, valor unitário, valor total, nº da OC) */}
              <TabsContent value="compras" className="pt-2">
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-800/60">
                      <TableRow>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-xs">Nº da OC</TableHead>
                        <TableHead className="text-xs">Fornecedor</TableHead>
                        <TableHead className="text-xs text-right">Qtde</TableHead>
                        <TableHead className="text-xs text-right">Valor Unitário</TableHead>
                        <TableHead className="text-xs text-right">Valor Total</TableHead>
                        <TableHead className="text-xs text-center">Status</TableHead>
                        <TableHead className="text-xs">Responsável / Recebido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchases.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={8}
                            className="text-center py-6 text-muted-foreground text-xs"
                          >
                            Nenhuma compra registrada para este produto.
                          </TableCell>
                        </TableRow>
                      ) : (
                        purchases.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-xs whitespace-nowrap font-medium">
                              {fmtDate(p.purchaseDate)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {p.ocNumber && p.ocNumber !== '-' ? (
                                <Badge variant="outline" className="font-mono text-[11px]">
                                  {p.ocNumber}
                                </Badge>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs font-medium">{p.supplier}</TableCell>
                            <TableCell className="text-xs text-right font-semibold">
                              {p.quantity}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {fmtCurrency(p.unitPrice)}
                            </TableCell>
                            <TableCell className="text-xs text-right font-bold text-slate-800 dark:text-slate-200">
                              {fmtCurrency(p.totalPrice)}
                            </TableCell>
                            <TableCell className="text-xs text-center">
                              <Badge variant="secondary" className="text-[10px]">
                                {p.status || 'Registrado'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {p.receivedBy ? (
                                <UserActionBadge
                                  user={p.receivedBy}
                                  prefix="recebido por"
                                  compact={true}
                                />
                              ) : p.ocUser ? (
                                <UserActionBadge
                                  user={p.ocUser}
                                  prefix="comprador"
                                  compact={true}
                                />
                              ) : (
                                '-'
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* SEÇÃO MOVIMENTAÇÕES: lista cronológica de entradas/saídas de inventory_movements */}
              <TabsContent value="movimentacoes" className="pt-2">
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-800/60">
                      <TableRow>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs text-right">Quantidade</TableHead>
                        <TableHead className="text-xs text-right">Saldo Após</TableHead>
                        <TableHead className="text-xs">OP Vinculada</TableHead>
                        <TableHead className="text-xs">Motivo</TableHead>
                        <TableHead className="text-xs">Realizado por</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center py-6 text-muted-foreground text-xs"
                          >
                            Nenhuma movimentação registrada para este item no estoque.
                          </TableCell>
                        </TableRow>
                      ) : (
                        movements.map((m) => {
                          const order = m.expand?.order_id
                          const opLabel = order?.op_number
                            ? `OP ${order.op_number}`
                            : order?.order_number
                              ? `Pedido ${order.order_number}`
                              : '-'
                          const isEntry = m.type === 'Entrada'
                          return (
                            <TableRow key={m.id}>
                              <TableCell className="text-xs whitespace-nowrap font-medium">
                                {fmtDate(m.arrival_date || m.exit_date || m.created)}
                              </TableCell>
                              <TableCell className="text-xs">
                                <Badge
                                  variant={isEntry ? 'secondary' : 'destructive'}
                                  className="text-[10px]"
                                >
                                  {m.type}
                                </Badge>
                              </TableCell>
                              <TableCell
                                className={cn(
                                  'text-xs text-right font-bold',
                                  isEntry ? 'text-green-600' : 'text-red-600',
                                )}
                              >
                                {isEntry ? '+' : '-'}
                                {m.quantity}
                              </TableCell>
                              <TableCell className="text-xs text-right font-semibold">
                                {m.balance_after != null ? m.balance_after : '-'}
                              </TableCell>
                              <TableCell className="text-xs font-mono text-slate-700 dark:text-slate-300">
                                {opLabel}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {m.reason || '-'}
                              </TableCell>
                              <TableCell className="text-xs">
                                <UserActionBadge
                                  user={m.expand?.user_id}
                                  prefix={isEntry ? 'entrada por' : 'baixa por'}
                                  compact={true}
                                  fallbackText="-"
                                />
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* SEÇÃO USO EM OPS: peças totais utilizadas, saídas por OP/pedido e solicitações em aberto */}
              <TabsContent value="uso_ops" className="pt-2 space-y-4">
                {/* KPIs de Uso */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Peças Totais Utilizadas
                    </span>
                    <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
                      {totalUsedPieces}{' '}
                      <span className="text-xs font-normal text-muted-foreground">un</span>
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Soma total de saídas registradas
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Demanda Pendente em Aberto
                    </span>
                    <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                      {consolidation.totalPendingQuantity}{' '}
                      <span className="text-xs font-normal text-muted-foreground">un</span>
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Saldo necessário em {consolidation.countOpenOps} solicitação(ões)
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      OPs com Histórico de Saída
                    </span>
                    <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                      {exitsByOp.length}
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Pedidos que já consumiram este item
                    </p>
                  </div>
                </div>

                {/* Bloco 1: Peças Utilizadas por Pedido / OP */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="size-3.5 text-blue-600" /> Histórico de Saídas por Pedido /
                    OP
                  </h3>
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50 dark:bg-slate-800/60">
                        <TableRow>
                          <TableHead className="text-xs">OP</TableHead>
                          <TableHead className="text-xs">Nº Pedido</TableHead>
                          <TableHead className="text-xs">Cliente</TableHead>
                          <TableHead className="text-xs text-right">Qtde Utilizada</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Última Saída</TableHead>
                          <TableHead className="text-xs">Motivo / Obs</TableHead>
                          <TableHead className="text-xs">Baixa por</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {exitsByOp.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className="text-center py-4 text-muted-foreground text-xs"
                            >
                              Nenhuma saída vinculada a OPs encontrada.
                            </TableCell>
                          </TableRow>
                        ) : (
                          exitsByOp.map((op, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                                {op.opNumber}
                              </TableCell>
                              <TableCell className="text-xs font-mono">{op.orderNumber}</TableCell>
                              <TableCell className="text-xs">{op.clientName || '-'}</TableCell>
                              <TableCell className="text-xs text-right font-bold text-red-600">
                                {op.totalQuantity}
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap">
                                {fmtDate(op.lastDate)}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {op.reasons.join(', ') || '-'}
                              </TableCell>
                              <TableCell className="text-xs">
                                <UserActionBadge
                                  user={op.lastUser}
                                  prefix="baixa por"
                                  compact={true}
                                  fallbackText="-"
                                />
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Bloco 2: Solicitações em Aberto com Saldo Pendente (Consolidação de Demanda) */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="size-3.5" /> Solicitações em Aberto com Demanda Pendente
                    </h3>
                    <Badge variant="outline" className="text-xs">
                      Total pendente: {consolidation.totalPendingQuantity} un
                    </Badge>
                  </div>
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader className="bg-amber-50/50 dark:bg-amber-950/20">
                        <TableRow>
                          <TableHead className="text-xs">OP</TableHead>
                          <TableHead className="text-xs">Pedido</TableHead>
                          <TableHead className="text-xs">Cliente</TableHead>
                          <TableHead className="text-xs text-right">Saldo Faltante</TableHead>
                          <TableHead className="text-xs text-right">
                            Qtde Total / Recebida
                          </TableHead>
                          <TableHead className="text-xs">Previsão / Vencimento</TableHead>
                          <TableHead className="text-xs text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {consolidation.openDemands.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className="text-center py-4 text-muted-foreground text-xs"
                            >
                              Não há outras solicitações em aberto pendentes deste item.
                            </TableCell>
                          </TableRow>
                        ) : (
                          consolidation.openDemands.map((d) => (
                            <TableRow key={d.shortageId}>
                              <TableCell className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                                {d.opNumber}
                              </TableCell>
                              <TableCell className="text-xs font-mono">{d.orderNumber}</TableCell>
                              <TableCell className="text-xs">{d.clientName || '-'}</TableCell>
                              <TableCell className="text-xs text-right font-extrabold text-amber-600 dark:text-amber-400">
                                {d.quantity}
                              </TableCell>
                              <TableCell className="text-xs text-right text-muted-foreground">
                                {d.originalQuantity} ({d.receivedQuantity} rec.)
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap">
                                {fmtDate(d.deliveryDate)}
                              </TableCell>
                              <TableCell className="text-xs text-center">
                                <Badge variant="secondary" className="text-[10px]">
                                  {d.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
