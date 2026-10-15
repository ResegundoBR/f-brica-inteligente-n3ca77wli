import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Plus, Trash2, Loader2, ChevronsUpDown, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { NoTranslate } from '@/components/NoTranslate'
import { toDateFieldValue } from '@/lib/pcp-utils'
import { formatDetailedErrorMessage } from '@/lib/pocketbase/errors'
import { getSuppliers, Supplier } from '@/services/suppliers'
import {
  getOrdemCompraItens,
  updateOrdemCompra,
  UpdateOrdemCompraItemInput,
} from '@/services/ordens-compra'
import type { OrdemCompra } from '@/types'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface EditOrdemCompraModalProps {
  oc: OrdemCompra | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

interface EditableItem extends UpdateOrdemCompraItemInput {
  clientKey: string
}

export function EditOrdemCompraModal({
  oc,
  open,
  onOpenChange,
  onSuccess,
}: EditOrdemCompraModalProps) {
  const { user } = useAuth()
  const [loadingItems, setLoadingItems] = useState(false)
  const [saving, setSaving] = useState(false)

  // Cabeçalho
  const [supplierName, setSupplierName] = useState('')
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const [expectedDate, setExpectedDate] = useState('')
  const [deliveryType, setDeliveryType] = useState('Entrega')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [deliveryTerms, setDeliveryTerms] = useState('')

  // Itens
  const [items, setItems] = useState<EditableItem[]>([])

  // Novo item input
  const [newDesc, setNewDesc] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newQty, setNewQty] = useState('1')
  const [newPrice, setNewPrice] = useState('')
  const [newSt, setNewSt] = useState('')
  const [newIpi, setNewIpi] = useState('')

  // Carregar lista de fornecedores
  useEffect(() => {
    if (open) {
      getSuppliers()
        .then(setSuppliers)
        .catch(() => {})
    }
  }, [open])

  // Inicializar dados da OC selecionada
  useEffect(() => {
    if (open && oc) {
      setSupplierName(oc.supplier || '')
      setSupplierId(oc.supplier_id || undefined)
      setDeliveryType(oc.delivery_type || 'Entrega')
      setPaymentTerms(oc.payment_terms || '')
      setDeliveryTerms(oc.delivery_terms || '')

      if (oc.expected_date) {
        // expected_date costuma vir como "YYYY-MM-DD" ou ISO string
        const datePart = oc.expected_date.split('T')[0].split(' ')[0]
        setExpectedDate(datePart)
      } else {
        setExpectedDate('')
      }

      setLoadingItems(true)
      getOrdemCompraItens(oc.id)
        .then((loaded) => {
          setItems(
            loaded.map((it) => ({
              id: it.id,
              clientKey: it.id,
              description: it.description,
              code: it.code || '',
              quantity: Number(it.quantity) || 0,
              unit_price: Number(it.unit_price) || 0,
              st_value: Number(it.st_value) || 0,
              ipi_value: Number(it.ipi_value) || 0,
              total: Number(it.total) || 0,
              material_shortage_id: it.material_shortage_id || undefined,
            })),
          )
        })
        .catch((err) => {
          toast.error('Erro ao carregar itens da Ordem de Compra')
          console.error(err)
        })
        .finally(() => setLoadingItems(false))

      // Limpar campos de novo item
      setNewDesc('')
      setNewCode('')
      setNewQty('1')
      setNewPrice('')
      setNewSt('')
      setNewIpi('')
    }
  }, [open, oc])

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const updateItemField = <K extends keyof EditableItem>(
    index: number,
    field: K,
    value: EditableItem[K],
  ) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it
        const updated = { ...it, [field]: value }
        // Recalcular total do item se alterou quantidade, preço, ST ou IPI
        if (['quantity', 'unit_price', 'st_value', 'ipi_value'].includes(field as string)) {
          const q = Number(updated.quantity) || 0
          const p = Number(updated.unit_price) || 0
          const st = Number(updated.st_value) || 0
          const ipi = Number(updated.ipi_value) || 0
          updated.total = q * p + st + ipi
        }
        return updated
      }),
    )
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAddItem = () => {
    if (!newDesc.trim()) {
      toast.error('Informe a descrição do item')
      return
    }
    const q = Number(newQty) || 0
    if (q <= 0) {
      toast.error('A quantidade deve ser maior que zero')
      return
    }
    const p = Number(newPrice) || 0
    const st = Number(newSt) || 0
    const ipi = Number(newIpi) || 0
    const itemTotal = q * p + st + ipi

    const newItem: EditableItem = {
      clientKey: `new_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      description: newDesc.trim(),
      code: newCode.trim() || undefined,
      quantity: q,
      unit_price: p,
      st_value: st,
      ipi_value: ipi,
      total: itemTotal,
    }

    setItems((prev) => [...prev, newItem])

    setNewDesc('')
    setNewCode('')
    setNewQty('1')
    setNewPrice('')
    setNewSt('')
    setNewIpi('')
  }

  const grandTotal = useMemo(() => {
    return items.reduce((sum, it) => {
      const q = Number(it.quantity) || 0
      const p = Number(it.unit_price) || 0
      const st = Number(it.st_value) || 0
      const ipi = Number(it.ipi_value) || 0
      return sum + (q * p + st + ipi)
    }, 0)
  }, [items])

  const handleSelectSupplier = (s: Supplier) => {
    setSupplierName(s.name)
    setSupplierId(s.id)
    setSupplierOpen(false)
  }

  const handleSave = async () => {
    if (!oc) return

    const trimmedSupplier = supplierName.trim()
    if (!trimmedSupplier) {
      toast.error('Informe o fornecedor da Ordem de Compra')
      return
    }

    if (items.length === 0) {
      toast.error('A Ordem de Compra deve ter pelo menos um item')
      return
    }

    // Validar quantidades e descrições dos itens
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!it.description.trim()) {
        toast.error(`O item ${i + 1} precisa de uma descrição válida.`)
        return
      }
      if (!it.quantity || it.quantity <= 0) {
        toast.error(`A quantidade do item "${it.description}" deve ser maior que zero.`)
        return
      }
      if (it.unit_price !== undefined && it.unit_price < 0) {
        toast.error(`O preço unitário do item "${it.description}" não pode ser negativo.`)
        return
      }
    }

    setSaving(true)
    try {
      const cleanExpectedDate =
        expectedDate && expectedDate.trim()
          ? `${toDateFieldValue(expectedDate.trim())} 12:00:00.000Z`
          : ''

      const userNameOrEmail = user?.name || user?.email || undefined

      await updateOrdemCompra(
        oc.id,
        {
          supplier: trimmedSupplier,
          supplier_id: supplierId || undefined,
          expected_date: cleanExpectedDate || undefined,
          delivery_terms: deliveryTerms.trim() || undefined,
          payment_terms: paymentTerms.trim() || undefined,
          delivery_type: deliveryType || 'Entrega',
          total: grandTotal,
          itens: items.map((it) => ({
            id: it.id,
            description: it.description,
            code: it.code?.trim() || undefined,
            quantity: Number(it.quantity),
            unit_price: Number(it.unit_price) || 0,
            st_value: Number(it.st_value) || 0,
            ipi_value: Number(it.ipi_value) || 0,
            total:
              Number(it.quantity) * (Number(it.unit_price) || 0) +
              (Number(it.st_value) || 0) +
              (Number(it.ipi_value) || 0),
            material_shortage_id: it.material_shortage_id,
          })),
        },
        userNameOrEmail,
      )

      toast.success('Ordem de Compra atualizada com sucesso!')
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Erro ao atualizar Ordem de Compra:', err)
      const detail = formatDetailedErrorMessage(err, 'Verifique os dados informados.')
      toast.error(`Não foi possível salvar a Ordem de Compra: ${detail}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Editar Ordem de Compra</span>
            {oc && (
              <span
                className="text-muted-foreground font-mono text-base font-normal notranslate"
                translate="no"
              >
                Nº {oc.oc_number}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* CABEÇALHO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Fornecedor com busca no cadastro de fornecedores */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Fornecedor *</Label>
              <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      'w-full justify-between font-normal text-left h-9',
                      !supplierName && 'text-muted-foreground',
                    )}
                  >
                    <span className="truncate notranslate" translate="no">
                      {supplierName || 'Selecione ou digite um fornecedor...'}
                    </span>
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[350px]" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Buscar fornecedor..."
                      value={supplierName}
                      onValueChange={(val) => {
                        setSupplierName(val)
                        // Se o texto não bater com nenhum supplier id, limpa supplier_id
                        const match = suppliers.find(
                          (s) => s.name.toLowerCase() === val.trim().toLowerCase(),
                        )
                        setSupplierId(match ? match.id : undefined)
                      }}
                    />
                    <CommandList>
                      <CommandEmpty>
                        <div className="p-2 text-xs text-muted-foreground">
                          Nenhum fornecedor encontrado no cadastro. Digite para usar este nome.
                        </div>
                      </CommandEmpty>
                      <CommandGroup heading="Fornecedores Cadastrados">
                        {suppliers.map((s) => (
                          <CommandItem
                            key={s.id}
                            value={s.name}
                            onSelect={() => handleSelectSupplier(s)}
                          >
                            <Check
                              className={cn(
                                'mr-2 size-4',
                                supplierId === s.id || supplierName === s.name
                                  ? 'opacity-100'
                                  : 'opacity-0',
                              )}
                            />
                            <span className="notranslate" translate="no">
                              {s.name}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Previsão de Entrega */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Previsão de Entrega</Label>
              <Input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="notranslate h-9"
                translate="no"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Condições de Pagamento */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Condições de Pagamento</Label>
              <Input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Ex.: À vista, 30 dias..."
                className="h-9"
              />
            </div>

            {/* Tipo de Entrega */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Tipo de Entrega</Label>
              <Select value={deliveryType} onValueChange={setDeliveryType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Entrega">Entrega</SelectItem>
                  <SelectItem value="Retira">Retira</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ITENS DA OC */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Itens da Ordem de Compra</Label>
            {loadingItems ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando itens...
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-[85px]">Qtde</TableHead>
                      <TableHead className="w-[110px]">Vl. Unit.</TableHead>
                      <TableHead className="w-[95px]">ST</TableHead>
                      <TableHead className="w-[95px]">IPI</TableHead>
                      <TableHead className="text-right w-[120px]">Total</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center py-6 text-sm text-muted-foreground"
                        >
                          Nenhum item na Ordem de Compra. Adicione itens abaixo.
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((item, idx) => {
                        const itemTotal =
                          (Number(item.quantity) || 0) * (Number(item.unit_price) || 0) +
                          (Number(item.st_value) || 0) +
                          (Number(item.ipi_value) || 0)

                        return (
                          <TableRow key={item.clientKey}>
                            <TableCell>
                              <Input
                                className="h-8 w-24 notranslate font-mono text-xs"
                                translate="no"
                                value={item.code || ''}
                                onChange={(e) => updateItemField(idx, 'code', e.target.value)}
                                placeholder="-"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                className="h-8 text-xs notranslate"
                                translate="no"
                                value={item.description}
                                onChange={(e) =>
                                  updateItemField(idx, 'description', e.target.value)
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                className="h-8 w-20 notranslate text-xs"
                                translate="no"
                                value={item.quantity}
                                onChange={(e) =>
                                  updateItemField(idx, 'quantity', Number(e.target.value) || 0)
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                className="h-8 w-24 notranslate text-xs"
                                translate="no"
                                value={item.unit_price ?? ''}
                                placeholder="0,00"
                                onChange={(e) =>
                                  updateItemField(idx, 'unit_price', Number(e.target.value) || 0)
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                className="h-8 w-20 notranslate text-xs"
                                translate="no"
                                value={item.st_value ?? ''}
                                placeholder="0,00"
                                onChange={(e) =>
                                  updateItemField(idx, 'st_value', Number(e.target.value) || 0)
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                className="h-8 w-20 notranslate text-xs"
                                translate="no"
                                value={item.ipi_value ?? ''}
                                placeholder="0,00"
                                onChange={(e) =>
                                  updateItemField(idx, 'ipi_value', Number(e.target.value) || 0)
                                }
                              />
                            </TableCell>
                            <TableCell
                              className="text-right text-sm font-semibold notranslate"
                              translate="no"
                            >
                              {formatCurrency(itemTotal)}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 hover:bg-red-50 dark:hover:bg-red-950/30"
                                onClick={() => removeItem(idx)}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* ADICIONAR NOVO ITEM */}
          <div className="flex flex-wrap items-end gap-2 p-3 border-2 border-dashed rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
            <div className="w-24 space-y-1">
              <Label className="text-xs">Código</Label>
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="-"
                className="notranslate font-mono text-xs h-8"
                translate="no"
              />
            </div>
            <div className="flex-1 min-w-[160px] space-y-1">
              <Label className="text-xs">Novo Item (Descrição)</Label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Ex.: Parafuso sextavado..."
                className="notranslate text-xs h-8"
                translate="no"
              />
            </div>
            <div className="w-20 space-y-1">
              <Label className="text-xs">Qtde</Label>
              <Input
                type="number"
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                className="notranslate text-xs h-8"
                translate="no"
              />
            </div>
            <div className="w-24 space-y-1">
              <Label className="text-xs">Vl. Unit.</Label>
              <Input
                type="number"
                step="0.01"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="0,00"
                className="notranslate text-xs h-8"
                translate="no"
              />
            </div>
            <div className="w-20 space-y-1">
              <Label className="text-xs">ST</Label>
              <Input
                type="number"
                step="0.01"
                value={newSt}
                onChange={(e) => setNewSt(e.target.value)}
                placeholder="0,00"
                className="notranslate text-xs h-8"
                translate="no"
              />
            </div>
            <div className="w-20 space-y-1">
              <Label className="text-xs">IPI</Label>
              <Input
                type="number"
                step="0.01"
                value={newIpi}
                onChange={(e) => setNewIpi(e.target.value)}
                placeholder="0,00"
                className="notranslate text-xs h-8"
                translate="no"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleAddItem} className="h-8">
              <Plus className="w-4 h-4 mr-1" /> Adicionar
            </Button>
          </div>

          {/* Condições de Entrega / Frete */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Frete / Condições de Entrega</Label>
            <Textarea
              value={deliveryTerms}
              onChange={(e) => setDeliveryTerms(e.target.value)}
              placeholder="Informações de frete, CIF/FOB, transportadora ou instruções de entrega..."
              rows={2}
            />
          </div>

          {/* Total Recalculado em Tempo Real */}
          <div className="flex justify-between items-center pt-3 border-t">
            <span className="text-sm font-medium text-muted-foreground">
              Total da OC (recalculado)
            </span>
            <span
              className="text-2xl font-bold text-blue-600 dark:text-blue-400 notranslate"
              translate="no"
            >
              {formatCurrency(grandTotal)}
            </span>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loadingItems || items.length === 0}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
