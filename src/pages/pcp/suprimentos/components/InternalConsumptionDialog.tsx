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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { createMovement } from '@/services/inventory'
import { normalizeSearchText, formatQuantity, parseQuantityInput } from '@/lib/pcp-utils'
import type { Inventory } from '@/types'
import {
  PackageMinus,
  Search,
  AlertTriangle,
  CheckCircle,
  Loader2,
  AlertCircle,
  Check,
} from 'lucide-react'
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

export const CONSUMPTION_CATEGORIES = [
  'Consumível',
  'Insumo',
  'Ferramental',
  'EPI',
  'Manutenção',
  'Uso Interno',
  'Outro',
] as const

export type ConsumptionCategory = (typeof CONSUMPTION_CATEGORIES)[number]

export const REQUESTING_SECTORS = [
  'Serralheria',
  'Montagem',
  'Pintura',
  'Manutenção',
  'Expedição',
  'Administrativo',
  'Outro',
] as const

export type RequestingSector = (typeof REQUESTING_SECTORS)[number]

interface InternalConsumptionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function InternalConsumptionDialog({
  open,
  onOpenChange,
  onSuccess,
}: InternalConsumptionDialogProps) {
  const { toast } = useToast()
  const { user } = useAuth()

  const [inventoryList, setInventoryList] = useState<Inventory[]>([])
  const [loadingInventory, setLoadingInventory] = useState(false)

  // Search input & selected item
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<Inventory | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // Form inputs
  const [quantityInput, setQuantityInput] = useState('1')
  const [category, setCategory] = useState<ConsumptionCategory | ''>('')
  const [sector, setSector] = useState<RequestingSector | ''>('')
  const [description, setDescription] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmLargeOpen, setConfirmLargeOpen] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load inventory when dialog opens
  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setSelectedItem(null)
      setQuantityInput('1')
      setCategory('')
      setSector('')
      setDescription('')
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

  const numQty = parseQuantityInput(quantityInput)
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
      const currentFull = selectedItem.code
        ? `${selectedItem.code} — ${selectedItem.description}`
        : selectedItem.description
      if (val !== currentFull) {
        setSelectedItem(null)
      }
    }
  }

  const buildReason = () => {
    const parts = [`Consumo interno — ${category}`]
    if (sector.trim()) {
      parts.push(sector.trim())
    }
    if (description.trim()) {
      parts.push(description.trim())
    }
    return parts.join(' — ')
  }

  const executeWithdrawal = async (confirmedLarge = false) => {
    if (!selectedItem || !category) return

    if (!Number.isFinite(numQty) || numQty <= 0) {
      toast({
        title: 'Quantidade inválida',
        description: 'Informe uma quantidade maior que zero.',
        variant: 'destructive',
      })
      return
    }

    if (numQty > 100000) {
      toast({
        title: 'Quantidade bloqueada',
        description:
          'Quantidades acima de 100.000 unidades não são permitidas por segurança do sistema.',
        variant: 'destructive',
      })
      return
    }

    if (numQty > currentStock) {
      toast({
        title: 'Saldo insuficiente',
        description: `O saldo disponível (${formatQuantity(currentStock)} ${selectedItem.unit || 'un'}) é menor que a quantidade solicitada (${formatQuantity(numQty)}).`,
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const reason = buildReason()
      const exitDate = new Date().toISOString()

      await createMovement({
        inventory_id: selectedItem.id,
        quantity: numQty,
        type: 'Saída',
        reason,
        exit_date: exitDate,
        confirmed_large: confirmedLarge,
      })

      toast({
        title: 'Saída de consumo registrada!',
        description: `${formatQuantity(numQty)} ${selectedItem.unit || 'un'} de "${selectedItem.description}" baixado(s) do estoque.`,
      })

      setConfirmLargeOpen(false)
      onSuccess?.()
      onOpenChange(false)
    } catch (err: any) {
      toast({
        title: 'Erro ao registrar saída de consumo',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmWithdrawal = async () => {
    if (!selectedItem) {
      toast({
        title: 'Selecione um item do estoque',
        description: 'Busque e selecione o material que será baixado.',
        variant: 'destructive',
      })
      return
    }

    if (!category) {
      toast({
        title: 'Categoria obrigatória',
        description: 'Selecione a categoria de consumo antes de confirmar a saída.',
        variant: 'destructive',
      })
      return
    }

    if (!Number.isFinite(numQty) || numQty <= 0) {
      toast({
        title: 'Quantidade inválida',
        description: 'Informe uma quantidade maior que zero.',
        variant: 'destructive',
      })
      return
    }

    if (numQty > 100000) {
      toast({
        title: 'Quantidade bloqueada',
        description:
          'Quantidades acima de 100.000 unidades não são permitidas por segurança do sistema.',
        variant: 'destructive',
      })
      return
    }

    if (numQty > currentStock) {
      toast({
        title: 'Saldo insuficiente',
        description: `O saldo disponível (${formatQuantity(currentStock)} ${selectedItem.unit || 'un'}) é menor que a quantidade solicitada (${formatQuantity(numQty)}).`,
        variant: 'destructive',
      })
      return
    }

    if (currentStock > 0 && numQty > currentStock * 10) {
      setConfirmLargeOpen(true)
      return
    }

    await executeWithdrawal(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl font-black flex items-center gap-2">
            <PackageMinus className="size-6 text-amber-600" /> Saída de Consumo Interno
          </DialogTitle>
          <DialogDescription className="text-sm">
            Baixa de materiais do estoque para uso interno da fábrica (sem vínculo com OP).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Autocomplete Search */}
          <div className="space-y-2 relative" ref={dropdownRef}>
            <Label
              htmlFor="internal-stock-search"
              className="text-sm font-semibold flex items-center justify-between"
            >
              <span>Buscar Componente / Material no Estoque *</span>
              {loadingInventory && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 font-normal">
                  <Loader2 className="size-3 animate-spin" /> Carregando estoque...
                </span>
              )}
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                id="internal-stock-search"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setIsDropdownOpen(true)}
                placeholder="Digite o código ou a descrição do material..."
                className="pl-9 pr-9 text-sm h-11 notranslate"
                translate="no"
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
                    <p>Verifique o código ou descrição informados.</p>
                  </div>
                ) : (
                  filteredSuggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs sm:text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between gap-2 border-b border-border/40 last:border-0 transition-colors"
                      onClick={() => handleSelectSuggestion(item)}
                    >
                      <div className="min-w-0 flex-1 notranslate" translate="no">
                        {item.code && (
                          <span className="font-mono font-bold text-primary mr-2">
                            [{item.code}]
                          </span>
                        )}
                        <span className="font-medium">{item.description}</span>
                      </div>
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 notranslate"
                        translate="no"
                      >
                        Saldo: {formatQuantity(item.quantity)} {item.unit || 'un'}
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
              <div className="min-w-0 notranslate" translate="no">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                  Material Selecionado
                </span>
                <p className="font-bold text-foreground truncate">
                  {selectedItem.code ? `[${selectedItem.code}] ` : ''}
                  {selectedItem.description}
                </p>
                {user && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Registrado por:{' '}
                    <strong className="text-foreground">{user.name || user.email}</strong>
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                  Saldo Disponível
                </span>
                <span className="text-base font-black text-primary notranslate" translate="no">
                  {formatQuantity(currentStock)} {selectedItem.unit || 'un'}
                </span>
              </div>
            </div>
          )}

          {/* Quantity Input */}
          <div className="space-y-2">
            <Label htmlFor="consumption-qty" className="text-sm font-semibold">
              Quantidade a Baixar *
            </Label>
            <Input
              id="consumption-qty"
              type="text"
              inputMode="decimal"
              value={quantityInput}
              onChange={(e) => setQuantityInput(e.target.value)}
              placeholder="Ex: 5,73 ou 10"
              className="text-base font-semibold h-11 notranslate"
              translate="no"
            />
            {numQty > 100000 && (
              <div className="p-2.5 rounded border border-red-300 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0 text-red-600" />
                <span>
                  Atenção: Quantidades acima de 100.000 unidades são rejeitadas pelo sistema.
                </span>
              </div>
            )}
          </div>

          {/* Warning: quantity > stock (BLOCKING) */}
          {isOverStock && (
            <div className="p-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700 text-red-900 dark:text-red-200 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertTriangle className="size-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
              <div className="flex-1 space-y-0.5">
                <p className="font-bold">Saldo insuficiente no estoque!</p>
                <p className="text-xs text-red-800 dark:text-red-300">
                  A quantidade solicitada ({formatQuantity(numQty)}) é maior que o saldo disponível
                  em estoque ({formatQuantity(currentStock)} {selectedItem?.unit || 'un'}). A saída
                  não poderá ser concluída até que a quantidade seja ajustada.
                </p>
              </div>
            </div>
          )}

          {/* Category & Sector Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="consumption-category" className="text-sm font-semibold">
                Categoria *
              </Label>
              <Select
                value={category}
                onValueChange={(val) => setCategory(val as ConsumptionCategory)}
              >
                <SelectTrigger id="consumption-category" className="h-11">
                  <SelectValue placeholder="Selecione a categoria..." />
                </SelectTrigger>
                <SelectContent>
                  {CONSUMPTION_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="consumption-sector" className="text-sm font-semibold">
                Setor Solicitante{' '}
                <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Select
                value={sector}
                onValueChange={(val) =>
                  setSector((val === 'none' ? '' : val) as RequestingSector | '')
                }
              >
                <SelectTrigger id="consumption-sector" className="h-11">
                  <SelectValue placeholder="Selecione o setor..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum setor específico</SelectItem>
                  {REQUESTING_SECTORS.map((sec) => (
                    <SelectItem key={sec} value={sec}>
                      {sec}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Motivo / Descrição Textarea */}
          <div className="space-y-2">
            <Label htmlFor="consumption-description" className="text-sm font-semibold">
              Motivo / Detalhes{' '}
              <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Textarea
              id="consumption-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Troca de pastilha de corte da serra, reposição de luvas na solda, etc."
              rows={2}
              className="text-sm resize-none notranslate"
              translate="no"
            />
          </div>

          {/* Preview of Reason text */}
          {category && (
            <div className="p-2.5 rounded-md border bg-slate-50 dark:bg-slate-900/60 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Registro no histórico: </span>
              <span className="italic">{buildReason()}</span>
            </div>
          )}
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
            className="h-11 font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
            disabled={
              isSubmitting ||
              !selectedItem ||
              !category ||
              numQty <= 0 ||
              numQty > 100000 ||
              numQty > currentStock
            }
            onClick={handleConfirmWithdrawal}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" /> Registrando...
              </>
            ) : (
              <>
                <CheckCircle className="size-4 mr-2" /> Confirmar Saída
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmLargeOpen} onOpenChange={setConfirmLargeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="size-5 text-amber-600" />
              Confirmação de Saída de Grande Porte
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <p>
                A quantidade informada para saída é mais de <strong>10 vezes superior</strong> ao
                saldo atual em estoque deste item:
              </p>
              <div className="p-3 rounded-lg border bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200">
                <div className="text-xs uppercase font-bold text-amber-700 dark:text-amber-400">
                  Quantidade Digitada
                </div>
                <div
                  className="text-2xl font-black text-amber-800 dark:text-amber-200 notranslate"
                  translate="no"
                >
                  {formatQuantity(numQty)} {selectedItem?.unit || 'un'}
                </div>
                <div className="text-xs mt-1 text-amber-700 dark:text-amber-300">
                  Saldo atual em estoque:{' '}
                  <strong className="notranslate" translate="no">
                    {formatQuantity(currentStock)} {selectedItem?.unit || 'un'}
                  </strong>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Confirme se a quantidade foi digitada corretamente para autorizar a operação com a
                marcação de saída extraordinária.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancelar e Corrigir</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
              onClick={(e) => {
                e.preventDefault()
                executeWithdrawal(true)
              }}
            >
              {isSubmitting ? 'Registrando...' : 'Sim, Confirmar Saída Extraordinária'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
