import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Check,
  ChevronsUpDown,
  Plus,
  History,
  AlertCircle,
  AlertTriangle,
  Link2,
} from 'lucide-react'
import { cn, formatQuantity } from '@/lib/utils'
import { PcpOrder, Product, MaterialShortage } from '@/types'
import { getMasterComponents, validateUnifiedCodeExists } from '@/services/components'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { extractFieldErrors, type FieldErrors } from '@/lib/pocketbase/errors'
import {
  sanitizeNumber,
  sanitizeString,
  sanitizeSelectValue,
  VALID_PRIORITIES,
  VALID_REQUEST_TYPES,
} from '@/lib/shortage-utils'
import { upsertMaterialShortage, OPEN_SHORTAGE_STATUS_FILTER } from '@/services/material-shortages'
import { NoTranslate } from '@/components/NoTranslate'

export function NewShortageModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { user } = useAuth()
  const { toast } = useToast()

  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState<string>('none')

  const [requestType, setRequestType] = useState<string>('Materiais')
  const [priority, setPriority] = useState<string>('Sem pressa')
  const [quantity, setQuantity] = useState<string>('1')
  const [sector, setSector] = useState<string>('Fabricação')

  const [itemCode, setItemCode] = useState('')
  const [itemDesc, setItemDesc] = useState('')
  const [observation, setObservation] = useState('')

  const [unitPrice, setUnitPrice] = useState<string>('')
  const [history, setHistory] = useState<MaterialShortage[]>([])
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  // Trava anti-duplicidade em solicitação manual
  const [duplicateShortages, setDuplicateShortages] = useState<MaterialShortage[]>([])
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [showBypassForm, setShowBypassForm] = useState(false)
  const [bypassReason, setBypassReason] = useState('')

  const [comboboxOpen, setComboboxOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<
    {
      code: string
      desc: string
      source?: string
      stock_quantity?: number
      has_stock?: boolean
      unit?: string
    }[]
  >([])
  const [globalSuggestions, setGlobalSuggestions] = useState<
    {
      code: string
      desc: string
      source?: string
      stock_quantity?: number
      has_stock?: boolean
      unit?: string
    }[]
  >([])

  useEffect(() => {
    if (open) {
      pb.collection('pcp_orders')
        .getFullList<PcpOrder>({
          filter: 'status != "Concluído" && status != "Parado"',
          expand: 'product_id',
          sort: '-created',
        })
        .then(setOrders)
        .catch(() => {})

      setSelectedOrderId('none')
      setRequestType('Materiais')
      setPriority('Sem pressa')
      setQuantity('1')
      setSector('Fabricação')
      setItemCode('')
      setItemDesc('')
      setObservation('')
      setUnitPrice('')
      setHistory([])
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    Promise.all([
      getMasterComponents('', { includeInactive: false }).catch(() => []),
      pb
        .collection('components')
        .getFullList<{ id: string; code?: string; description?: string }>({
          filter: 'active = false',
          fields: 'id,code,description',
        })
        .catch(() => []),
      pb
        .collection('inventory')
        .getFullList<{
          id: string
          code?: string
          description?: string
          quantity?: number
          unit?: string
          component_id?: string
        }>()
        .catch(() => []),
      pb
        .collection('products')
        .getFullList<Product>()
        .catch(() => [] as Product[]),
      pb
        .collection('material_shortages')
        .getFullList<MaterialShortage>({
          fields: 'code,description',
        })
        .catch(() => [] as MaterialShortage[]),
    ])
      .then(([activeComponents, inactiveComponents, inventoryItems, prods, shorts]) => {
        const allComp: {
          code: string
          desc: string
          source?: string
          stock_quantity?: number
          has_stock?: boolean
          unit?: string
        }[] = []

        const inactiveKeySet = new Set<string>()
        inactiveComponents.forEach((ic) => {
          if (ic.code) inactiveKeySet.add(`code:${ic.code.trim().toLowerCase()}`)
          if (ic.description) inactiveKeySet.add(`desc:${ic.description.trim().toLowerCase()}`)
        })

        const isInactive = (code?: string, desc?: string) => {
          if (code && inactiveKeySet.has(`code:${code.trim().toLowerCase()}`)) return true
          if (desc && inactiveKeySet.has(`desc:${desc.trim().toLowerCase()}`)) return true
          return false
        }

        const invByCompId = new Map<
          string,
          { quantity?: number; unit?: string; code?: string; description?: string }
        >()
        const invByCode = new Map<
          string,
          { quantity?: number; unit?: string; code?: string; description?: string }
        >()
        const invByDesc = new Map<
          string,
          { quantity?: number; unit?: string; code?: string; description?: string }
        >()

        inventoryItems.forEach((inv) => {
          if (inv.component_id) invByCompId.set(inv.component_id, inv)
          if (inv.code) invByCode.set(inv.code.toLowerCase().trim(), inv)
          if (inv.description) invByDesc.set(inv.description.toLowerCase().trim(), inv)
        })

        // 1. Mestre unificado de componentes ativos
        activeComponents.forEach((comp) => {
          if (comp.description) {
            const invMatch =
              invByCompId.get(comp.id) ||
              (comp.code ? invByCode.get(comp.code.toLowerCase().trim()) : undefined) ||
              invByDesc.get(comp.description.toLowerCase().trim())

            const hasStock =
              !!invMatch &&
              invMatch.quantity !== undefined &&
              invMatch.quantity !== null &&
              invMatch.quantity > 0

            allComp.push({
              code: comp.code || invMatch?.code || '',
              desc: comp.description,
              stock_quantity: invMatch?.quantity,
              has_stock: hasStock,
              unit: comp.unit || invMatch?.unit || 'un',
            })
          }
        })

        // 2. Itens do inventário restantes (excluindo inativos do mestre)
        inventoryItems.forEach((inv) => {
          if (inv.description && !isInactive(inv.code, inv.description)) {
            const hasStock = inv.quantity !== undefined && inv.quantity !== null && inv.quantity > 0
            allComp.push({
              code: inv.code || '',
              desc: inv.description,
              stock_quantity: inv.quantity,
              has_stock: hasStock,
              unit: inv.unit || 'un',
            })
          }
        })

        // 3. Composição de produtos (excluindo inativos)
        prods.forEach((p) => {
          if (p.data?.composition) {
            p.data.composition.forEach((c: any) => {
              if (c.description && !isInactive(c.code, c.description)) {
                const invMatch =
                  (c.code ? invByCode.get(c.code.toLowerCase().trim()) : undefined) ||
                  invByDesc.get(c.description.toLowerCase().trim())
                const hasStock =
                  !!invMatch &&
                  invMatch.quantity !== undefined &&
                  invMatch.quantity !== null &&
                  invMatch.quantity > 0
                allComp.push({
                  code: c.code || invMatch?.code || '',
                  desc: c.description,
                  stock_quantity: invMatch?.quantity,
                  has_stock: hasStock,
                  unit: invMatch?.unit || 'un',
                })
              }
            })
          }
        })

        // 4. Faltas anteriores (excluindo inativos)
        shorts.forEach((s) => {
          if (s.description && !isInactive(s.code, s.description)) {
            const invMatch =
              (s.code ? invByCode.get(s.code.toLowerCase().trim()) : undefined) ||
              invByDesc.get(s.description.toLowerCase().trim())
            const hasStock =
              !!invMatch &&
              invMatch.quantity !== undefined &&
              invMatch.quantity !== null &&
              invMatch.quantity > 0
            allComp.push({
              code: s.code || invMatch?.code || '',
              desc: s.description,
              stock_quantity: invMatch?.quantity,
              has_stock: hasStock,
              unit: invMatch?.unit || 'un',
            })
          }
        })
        const seen = new Set<string>()
        const unique: {
          code: string
          desc: string
          source?: string
          stock_quantity?: number
          has_stock?: boolean
          unit?: string
        }[] = []
        allComp.forEach((item) => {
          const key = `${item.code.toLowerCase()}|${item.desc.toLowerCase()}`
          if (!seen.has(key)) {
            seen.add(key)
            unique.push(item)
          }
        })
        setGlobalSuggestions(unique)
      })
      .catch(() => {})
  }, [open])

  useEffect(() => {
    if (selectedOrderId && selectedOrderId !== 'none') {
      const op = orders.find((o) => o.id === selectedOrderId)
      if (op?.expand?.product_id?.data?.composition) {
        const comp = op.expand.product_id.data.composition
        const formatted = comp.map((c: any) => {
          const matchedGlobal = globalSuggestions.find(
            (g) => (c.code && g.code === c.code) || g.desc === c.description,
          )
          return {
            code: c.code || matchedGlobal?.code || '',
            desc: c.description || '',
            stock_quantity: matchedGlobal?.stock_quantity,
            has_stock: matchedGlobal?.has_stock,
            unit: matchedGlobal?.unit || 'un',
          }
        })
        const uniqueOp = Array.from(new Set(formatted.map((c: any) => c.desc))).map((desc) => {
          return formatted.find((c: any) => c.desc === desc)!
        })

        const opDescSet = new Set(uniqueOp.map((c: any) => c.desc))
        const remainingGlobal = globalSuggestions.filter((g) => !opDescSet.has(g.desc))

        setSuggestions([...uniqueOp, ...remainingGlobal])
      } else {
        setSuggestions(globalSuggestions)
      }
    } else {
      setSuggestions(globalSuggestions)
    }
  }, [selectedOrderId, orders, globalSuggestions])

  useEffect(() => {
    if (!itemDesc) {
      setHistory([])
      setDuplicateShortages([])
      return
    }

    const timer = setTimeout(() => {
      const safeDesc = itemDesc.replace(/"/g, '\\"')
      const safeCode = itemCode.replace(/"/g, '\\"')

      let filterStr = `description ~ "${safeDesc}"`
      if (itemCode) {
        filterStr = `(${filterStr} || code="${safeCode}")`
      }
      filterStr = `(${filterStr}) && unit_price > 0`

      pb.collection('material_shortages')
        .getList<MaterialShortage>(1, 3, {
          filter: filterStr,
          sort: '-created',
        })
        .then((res) => {
          setHistory(res.items)
        })
        .catch(() => setHistory([]))
    }, 500)

    return () => clearTimeout(timer)
  }, [itemDesc, itemCode])

  // Busca de registros em aberto para o código digitado/selecionado (trava anti-duplicidade)
  useEffect(() => {
    const cleanCode = itemCode.trim()
    if (!cleanCode) {
      setDuplicateShortages([])
      setShowBypassForm(false)
      return
    }

    setCheckingDuplicates(true)
    const safeCode = cleanCode.replace(/'/g, "\\'")
    const dupFilter = `(${OPEN_SHORTAGE_STATUS_FILTER}) && code = '${safeCode}'`

    pb.collection('material_shortages')
      .getFullList<MaterialShortage>({
        filter: dupFilter,
        sort: '-created',
        expand: 'order_id',
      })
      .then((records) => {
        setDuplicateShortages(records)
      })
      .catch((err) => {
        console.warn('Erro ao verificar duplicidade por código:', err)
        setDuplicateShortages([])
      })
      .finally(() => {
        setCheckingDuplicates(false)
      })
  }, [itemCode])

  const averagePrice = useMemo(() => {
    if (history.length === 0) return 0
    const sum = history.reduce((acc, curr) => acc + (curr.unit_price || 0), 0)
    return sum / history.length
  }, [history])

  const isPriceHigh = averagePrice > 0 && Number(unitPrice) > averagePrice

  const handleSubmit = async (options?: { accumulateQty?: boolean; bypassCheck?: boolean }) => {
    setFieldErrors({})
    try {
      if (!itemDesc.trim()) throw new Error('A descrição do item é obrigatória')
      const numQty = Number(quantity)
      if (!Number.isFinite(numQty) || numQty <= 0)
        throw new Error('A quantidade deve ser maior que zero')
      if (!sector) throw new Error('O setor é obrigatório')

      const cleanCode = itemCode.trim()
      if (cleanCode) {
        // Validação client-side contra o cadastro unificado espelhando o servidor
        const codeValidation = await validateUnifiedCodeExists(cleanCode)
        if (!codeValidation.exists) {
          throw new Error(
            `O código "${cleanCode}" não foi encontrado no Cadastro Unificado de Componentes nem no Inventário. Verifique se o código foi digitado corretamente ou cadastre o componente em Suprimentos > Componentes antes de prosseguir.`,
          )
        }
      }

      if (options?.bypassCheck && !bypassReason.trim()) {
        throw new Error('Informe uma justificativa para prosseguir avulso')
      }

      const safeUnitPrice = sanitizeNumber(unitPrice, 0, 0)

      await upsertMaterialShortage(
        {
          order_id: selectedOrderId === 'none' ? undefined : selectedOrderId,
          description: sanitizeString(itemDesc),
          code: sanitizeString(itemCode),
          quantity: numQty,
          sector: sanitizeString(sector),
          status: 'Pendente',
          priority: sanitizeSelectValue(priority, VALID_PRIORITIES, 'Sem pressa'),
          request_type: sanitizeSelectValue(requestType, VALID_REQUEST_TYPES, 'Materiais'),
          requested_by: user?.id,
          observation: sanitizeString(observation),
          unit_price: safeUnitPrice,
        },
        user?.name || user?.email || 'Usuário',
        {
          accumulateQty: options?.accumulateQty,
          bypassCheck: options?.bypassCheck,
          bypassReason: bypassReason.trim() || undefined,
        },
      )

      toast({
        title: options?.accumulateQty
          ? 'Quantidade vinculada e somada à solicitação existente!'
          : options?.bypassCheck
            ? 'Solicitação avulsa registrada com justificativa!'
            : 'Solicitação registrada com sucesso',
      })
      onOpenChange(false)
    } catch (err: any) {
      const errors = extractFieldErrors(err)
      setFieldErrors(errors)
      const errorMsg =
        Object.values(errors).join(' ') || err.message || 'Falha ao criar a solicitação.'
      toast({ title: 'Erro', description: errorMsg, variant: 'destructive' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] overflow-visible">
        <DialogHeader>
          <DialogTitle>Nova Solicitação de Compra / Material</DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Ordem de Produção (Opcional)</Label>
              <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma OP" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (Req. Geral)</SelectItem>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      OP: {o.op_number || o.order_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de Solicitação</Label>
              <Select value={requestType} onValueChange={setRequestType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Materiais">Materiais</SelectItem>
                  <SelectItem value="Ferramentas">Ferramentas</SelectItem>
                  <SelectItem value="Insumos">Insumos</SelectItem>
                  <SelectItem value="Produtos">Produtos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="item-code">Código do Componente / Insumo</Label>
              <span className="text-[11px] text-muted-foreground">
                Obrigatório validar contra o cadastro
              </span>
            </div>
            <Input
              id="item-code"
              className="notranslate font-mono"
              value={itemCode}
              onChange={(e) => setItemCode(e.target.value)}
              placeholder="Ex.: 05090003, 05100004..."
            />
          </div>

          <div className="space-y-1.5 flex flex-col relative">
            <Label>Item / Material (Busca no Cadastro Unificado)</Label>
            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboboxOpen}
                  className="justify-between w-full font-normal notranslate"
                >
                  <span className="truncate">
                    {itemDesc
                      ? `${itemCode ? itemCode + ' - ' : ''}${itemDesc}`
                      : 'Buscar componente no cadastro unificado...'}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[550px] max-w-[95vw] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Buscar por código ou descrição no cadastro..."
                    value={itemDesc}
                    onValueChange={(val) => {
                      setItemDesc(val)
                    }}
                  />
                  <CommandList className="max-h-64 overflow-y-auto overflow-x-hidden">
                    <CommandEmpty className="p-3 text-center text-xs text-muted-foreground">
                      Nenhum item encontrado no cadastro com esse termo.
                    </CommandEmpty>
                    {suggestions.length > 0 && (
                      <CommandGroup
                        heading={
                          selectedOrderId !== 'none'
                            ? 'Componentes da OP / Cadastro Unificado'
                            : 'Cadastro Unificado (Componentes + Inventário)'
                        }
                      >
                        {suggestions.map((s, i) => {
                          const hasStock =
                            s.has_stock ||
                            (s.stock_quantity !== undefined &&
                              s.stock_quantity !== null &&
                              s.stock_quantity > 0)
                          const stockQty = s.stock_quantity ?? 0
                          const stockUnit = s.unit || 'un'
                          return (
                            <CommandItem
                              key={i}
                              value={`${s.code} ${s.desc}`}
                              title={s.desc}
                              className="flex items-center justify-between gap-3 py-2 px-3 cursor-pointer notranslate"
                              onSelect={() => {
                                setItemCode(s.code || '')
                                setItemDesc(s.desc)
                                setComboboxOpen(false)
                              }}
                            >
                              <div className="flex items-start gap-2 min-w-0 flex-1">
                                <Check
                                  className={cn(
                                    'mt-0.5 h-4 w-4 shrink-0',
                                    itemDesc === s.desc ? 'opacity-100 text-primary' : 'opacity-0',
                                  )}
                                />
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span
                                    className="font-medium text-foreground line-clamp-2 leading-snug break-words text-xs sm:text-sm notranslate"
                                    title={s.desc}
                                  >
                                    {s.desc}
                                  </span>
                                  {s.code && (
                                    <span className="text-[11px] text-muted-foreground font-mono mt-0.5 notranslate">
                                      Cód: {s.code}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="shrink-0 flex items-center">
                                {hasStock ? (
                                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                    {stockQty} {stockUnit}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground font-normal whitespace-nowrap">
                                    sem estoque
                                  </span>
                                )}
                              </div>
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Setor / Destino</Label>
              <Select value={sector} onValueChange={setSector}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o setor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Montagem">Montagem</SelectItem>
                  <SelectItem value="Acabamento">Acabamento</SelectItem>
                  <SelectItem value="Fabricação">Fabricação</SelectItem>
                  <SelectItem value="Expedição">Expedição</SelectItem>
                  <SelectItem value="Adm">Adm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sem pressa">Sem pressa</SelectItem>
                  <SelectItem value="Próximos dias">Próximos dias</SelectItem>
                  <SelectItem value="Urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Preço Unitário (Estimado)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-muted-foreground text-sm">R$</span>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="pl-8"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Solicitante</Label>
              <Input
                value={user?.name || user?.email || 'Sistema'}
                disabled
                className="bg-slate-50 dark:bg-slate-900"
              />
            </div>
          </div>

          {/* TRAVA ANTI-DUPLICIDADE: Alerta em destaque quando já existir solicitação em aberto com este código */}
          {duplicateShortages.length > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-lg space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold text-amber-900 dark:text-amber-200">
                    Atenção: já existe solicitação em aberto para este código ({itemCode})!
                  </p>
                  <div className="space-y-1">
                    {duplicateShortages.map((dup) => {
                      const opDisplay =
                        dup.expand?.order_id?.op_number ||
                        dup.expand?.order_id?.order_number ||
                        'Geral (sem OP)'
                      return (
                        <div
                          key={dup.id}
                          className="p-1.5 bg-white/80 dark:bg-slate-900/80 rounded border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2"
                        >
                          <span className="text-slate-800 dark:text-slate-200 font-medium">
                            OP {opDisplay} &bull; {formatQuantity(dup.quantity)} un &bull;{' '}
                            <span className="font-semibold text-amber-700 dark:text-amber-300">
                              {dup.status}
                            </span>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Botões de Ação para a Duplicidade */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200 dark:border-amber-800/60">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1.5"
                  onClick={() => handleSubmit({ accumulateQty: true })}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Vincular / Somar à solicitação existente (+{quantity} un)
                </Button>
                {!showBypassForm ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs border-amber-400 text-amber-800 dark:text-amber-200"
                    onClick={() => setShowBypassForm(true)}
                  >
                    Prosseguir avulso com justificativa...
                  </Button>
                ) : null}
              </div>

              {/* Formulário de Justificativa para criação avulsa */}
              {showBypassForm && (
                <div className="p-2 bg-white/90 dark:bg-slate-900/90 rounded border border-amber-300 dark:border-amber-700 space-y-2 mt-2">
                  <Label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Justificativa para solicitação avulsa duplicada:
                  </Label>
                  <Input
                    value={bypassReason}
                    onChange={(e) => setBypassReason(e.target.value)}
                    placeholder="Ex.: Solicitação para setor diferente / pedido emergencial separado..."
                    className="h-8 text-xs"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setShowBypassForm(false)
                        setBypassReason('')
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900"
                      onClick={() => handleSubmit({ bypassCheck: true })}
                      disabled={!bypassReason.trim()}
                    >
                      Confirmar Avulso
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div className="space-y-2 mt-2">
              <Label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <History className="w-4 h-4" /> Histórico de Compras (Últimas 3)
              </Label>
              <div className="text-sm border rounded-md overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="px-3 py-2 font-medium">Data</th>
                      <th className="px-3 py-2 font-medium">Fornecedor</th>
                      <th className="px-3 py-2 font-medium text-right">Qtd</th>
                      <th className="px-3 py-2 font-medium text-right">Preço Un.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-slate-800">
                    {history.map((h) => (
                      <tr key={h.id} className="bg-white dark:bg-slate-950">
                        <td className="px-3 py-2">
                          {h.purchase_date
                            ? new Date(h.purchase_date).toLocaleDateString('pt-BR', {
                                timeZone: 'UTC',
                              })
                            : new Date(h.created).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                          {h.supplier || '-'}
                        </td>
                        <td className="px-3 py-2 text-right">{h.quantity || 0}</td>
                        <td className="px-3 py-2 text-right">
                          {h.unit_price?.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isPriceHigh && (
                <Alert variant="destructive" className="py-2 mt-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="ml-2 text-sm font-semibold text-red-800 dark:text-red-200">
                    Alerta de Variação de Preço
                  </AlertTitle>
                  <AlertDescription className="ml-2 text-xs text-red-700 dark:text-red-300">
                    O valor informado (
                    {Number(unitPrice).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                    ) está acima da média recente de{' '}
                    {averagePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Input
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Detalhes adicionais..."
            />
          </div>

          <div className="flex justify-end gap-3 mt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => handleSubmit()}
            >
              Salvar Solicitação
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
