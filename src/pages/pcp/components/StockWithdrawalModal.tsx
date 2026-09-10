import { useState, useEffect, useMemo, useRef } from 'react'
import pb from '@/lib/pocketbase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { createMovement } from '@/services/inventory'
import { normalizeSearchText } from '@/lib/pcp-utils'
import type { PcpOrder, Inventory } from '@/types'
import {
  Package,
  Search,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Loader2,
  AlertCircle,
  Check,
} from 'lucide-react'

interface StockWithdrawalModalProps {
  op: PcpOrder | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onWithdrawalSuccess?: () => void
  onRequestMissingMaterial?: (op: PcpOrder) => void
}

export function StockWithdrawalModal({
  op,
  open,
  onOpenChange,
  onWithdrawalSuccess,
  onRequestMissingMaterial,
}: StockWithdrawalModalProps) {
  const { toast } = useToast()

  const [inventoryList, setInventoryList] = useState<Inventory[]>([])
  const [loadingInventory, setLoadingInventory] = useState(false)

  // Search input & selected item
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<Inventory | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // Quantity input
  const [quantityInput, setQuantityInput] = useState('1')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load inventory when dialog opens
  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setSelectedItem(null)
      setQuantityInput('1')
      setIsDropdownOpen(false)
      return
    }

    let isMounted = true
    setLoadingInventory(true)
    pb.collection('inventory')
      .getFullList<Inventory>({ sort: 'description' })
      .then((records) => {
        if (isMounted) {
          setInventoryList(records)
          setLoadingInventory(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setLoadingInventory(false)
          toast({
            title: 'Erro ao carregar estoque',
            description: err.message,
            variant: 'destructive',
          })
        }
      })

    return () => {
      isMounted = false
    }
  }, [open, toast])

  // Filtered inventory suggestions
  const filteredSuggestions = useMemo(() => {
    const q = normalizeSearchText(searchQuery.trim())
    if (!q) return inventoryList.slice(0, 30)

    return inventoryList
      .filter((item) => {
        const desc = normalizeSearchText(item.description || '')
        const code = normalizeSearchText(item.code || '')
        return desc.includes(q) || code.includes(q)
      })
      .slice(0, 30)
  }, [inventoryList, searchQuery])

  const parsedQty = parseFloat(quantityInput.replace(',', '.'))
  const numQty = isNaN(parsedQty) ? 0 : parsedQty
  const currentStock = selectedItem ? Number(selectedItem.quantity) || 0 : 0
  const isOverStock = selectedItem !== null && numQty > currentStock

  const handleSelectSuggestion = (item: Inventory) => {
    setSelectedItem(item)
    setSearchQuery(item.code ? `${item.code} — ${item.description}` : item.description)
    setIsDropdownOpen(false)
  }

  const handleSearchChange = (val: string) => {
    setSearchQuery(val)
    setIsDropdownOpen(true)
    if (selectedItem) {
      // If user edits text after selecting, clear item selection if it no longer matches exactly
      const currentFull = selectedItem.code
        ? `${selectedItem.code} — ${selectedItem.description}`
        : selectedItem.description
      if (val !== currentFull) {
        setSelectedItem(null)
      }
    }
  }

  const handleConfirmWithdrawal = async () => {
    if (!op) return
    if (!selectedItem) {
      toast({
        title: 'Selecione um componente',
        description: 'Selecione um item da lista ou busque pelo código/descrição.',
        variant: 'destructive',
      })
      return
    }

    if (numQty <= 0) {
      toast({
        title: 'Quantidade inválida',
        description: 'Informe uma quantidade maior que zero.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const orderNumber = op.order_number || '-'
      const opNumber = op.op_number || '-'
      const reason = `Retirada manual — Pedido ${orderNumber} / OP ${opNumber}`
      const exitDate = new Date().toISOString()

      await createMovement({
        inventory_id: selectedItem.id,
        quantity: numQty,
        type: 'Saída',
        reason,
        order_id: op.id,
        exit_date: exitDate,
      })

      toast({
        title: 'Retirada realizada com sucesso!',
        description: `${numQty} ${selectedItem.unit || 'un'} de "${selectedItem.description}" retirado(s) do estoque para a OP ${opNumber}.`,
      })

      onWithdrawalSuccess?.()
      onOpenChange(false)
    } catch (err: any) {
      toast({
        title: 'Erro ao registrar retirada',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRedirectToShortage = () => {
    if (!op) return
    onOpenChange(false)
    onRequestMissingMaterial?.(op)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl font-black flex items-center gap-2">
            <Package className="size-6 text-primary" /> Retirada de Estoque
          </DialogTitle>
          <DialogDescription className="text-sm">
            Retirada manual para OP sem composição cadastrada.
            {op && (
              <span className="block mt-1 font-semibold text-foreground">
                Pedido: {op.order_number} | OP: {op.op_number || '-'} — {op.client_name}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Autocomplete Search */}
          <div className="space-y-2 relative" ref={dropdownRef}>
            <Label
              htmlFor="stock-search"
              className="text-sm font-semibold flex items-center justify-between"
            >
              <span>Buscar Componente no Estoque *</span>
              {loadingInventory && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 font-normal">
                  <Loader2 className="size-3 animate-spin" /> Carregando estoque...
                </span>
              )}
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                id="stock-search"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setIsDropdownOpen(true)}
                placeholder="Digite o código ou a descrição do material..."
                className="pl-9 pr-9 text-sm h-11"
                autoComplete="off"
              />
              {selectedItem && (
                <Check className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-green-600 pointer-events-none" />
              )}
            </div>

            {/* Dropdown suggestions */}
            {isDropdownOpen && !loadingInventory && (
              <div
                className="absolute z-50 w-full mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-lg"
                onMouseDown={(e) => e.preventDefault()}
              >
                {filteredSuggestions.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Item não encontrado no estoque.</p>
                    <p>
                      Se o material não existe no estoque físico, solicite via Material Faltante.
                    </p>
                  </div>
                ) : (
                  filteredSuggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs sm:text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between gap-2 border-b border-border/40 last:border-0 transition-colors"
                      onClick={() => handleSelectSuggestion(item)}
                    >
                      <div className="min-w-0 flex-1">
                        {item.code && (
                          <span className="font-mono font-bold text-primary mr-2">
                            [{item.code}]
                          </span>
                        )}
                        <span className="font-medium">{item.description}</span>
                      </div>
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-[10px] font-semibold bg-slate-100 dark:bg-slate-800"
                      >
                        Saldo: {item.quantity} {item.unit || 'un'}
                      </Badge>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selected Component Stock Card */}
          {selectedItem && (
            <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                  Componente Selecionado
                </span>
                <p className="font-bold text-foreground truncate">
                  {selectedItem.code ? `[${selectedItem.code}] ` : ''}
                  {selectedItem.description}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                  Saldo Disponível
                </span>
                <span className="text-base font-black text-primary">
                  {currentStock} {selectedItem.unit || 'un'}
                </span>
              </div>
            </div>
          )}

          {/* Quantity Input */}
          <div className="space-y-2">
            <Label htmlFor="stock-qty" className="text-sm font-semibold">
              Quantidade a Retirar *
            </Label>
            <Input
              id="stock-qty"
              type="number"
              step="any"
              min="0.001"
              value={quantityInput}
              onChange={(e) => setQuantityInput(e.target.value)}
              placeholder="1"
              className="text-base font-semibold h-11"
            />
          </div>

          {/* Warning: quantity > stock (NON-BLOCKING) */}
          {isOverStock && (
            <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="flex-1 space-y-0.5">
                <p className="font-bold">Atenção: Quantidade maior que o saldo em estoque!</p>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  A quantidade solicitada ({numQty}) supera o saldo atual ({currentStock}{' '}
                  {selectedItem?.unit || 'un'}). A saída será registrada normalmente sem bloquear o
                  envio.
                </p>
              </div>
            </div>
          )}

          {/* Guidance if item not found */}
          <div className="p-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 text-xs text-muted-foreground flex items-start gap-2.5">
            <HelpCircle className="size-4 shrink-0 text-slate-500 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p>
                <strong>O item buscado não existe no estoque?</strong>
              </p>
              <p>
                Utilize o botão{' '}
                <span className="font-bold text-amber-700 dark:text-amber-400">
                  Material Faltante
                </span>{' '}
                para abrir uma requisição de compra/insumo diretamente para Suprimentos.
              </p>
              {onRequestMissingMaterial && op && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1 h-7 text-xs border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40 font-semibold"
                  onClick={handleRedirectToShortage}
                >
                  <AlertCircle className="size-3 mr-1" /> Ir para Material Faltante
                </Button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-11 font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
            disabled={isSubmitting || !selectedItem || numQty <= 0}
            onClick={handleConfirmWithdrawal}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" /> Registrando...
              </>
            ) : (
              <>
                <CheckCircle className="size-4 mr-2" /> Confirmar Retirada
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
