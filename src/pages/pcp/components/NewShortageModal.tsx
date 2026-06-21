import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PcpOrder, Product } from '@/types'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'

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

  const [comboboxOpen, setComboboxOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<{ code: string; desc: string }[]>([])

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
    }
  }, [open])

  useEffect(() => {
    if (selectedOrderId && selectedOrderId !== 'none') {
      const op = orders.find((o) => o.id === selectedOrderId)
      if (op?.expand?.product_id?.data?.composition) {
        const comp = op.expand.product_id.data.composition
        const formatted = comp.map((c: any) => ({ code: c.code || '', desc: c.description || '' }))
        const unique = Array.from(new Set(formatted.map((c) => c.desc))).map((desc) => {
          return formatted.find((c) => c.desc === desc)!
        })
        setSuggestions(unique)
      } else {
        setSuggestions([])
      }
    } else {
      pb.collection('products')
        .getFullList<Product>()
        .then((prods) => {
          const allComp: { code: string; desc: string }[] = []
          prods.forEach((p) => {
            if (p.data?.composition) {
              p.data.composition.forEach((c: any) => {
                if (c.description) {
                  allComp.push({ code: c.code || '', desc: c.description })
                }
              })
            }
          })
          const unique = Array.from(new Set(allComp.map((c) => c.desc))).map((desc) => {
            return allComp.find((c) => c.desc === desc)!
          })
          setSuggestions(unique)
        })
        .catch(() => {})
    }
  }, [selectedOrderId, orders])

  const handleSubmit = async () => {
    try {
      if (!itemDesc) throw new Error('A descrição do item é obrigatória')
      if (!quantity || Number(quantity) <= 0)
        throw new Error('A quantidade deve ser maior que zero')
      if (!sector) throw new Error('O setor é obrigatório')

      await pb.collection('material_shortages').create({
        order_id: selectedOrderId === 'none' ? null : selectedOrderId,
        description: itemDesc,
        code: itemCode,
        quantity: Number(quantity),
        sector,
        status: 'Pendente',
        priority,
        request_type: requestType,
        requested_by: user?.id,
        observation,
      })

      toast({ title: 'Solicitação criada com sucesso' })
      onOpenChange(false)
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
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

          <div className="space-y-1.5 flex flex-col relative">
            <Label>Item / Material</Label>
            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboboxOpen}
                  className="justify-between w-full font-normal"
                >
                  <span className="truncate">
                    {itemDesc
                      ? `${itemCode ? itemCode + ' - ' : ''}${itemDesc}`
                      : 'Buscar ou digitar novo item...'}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[550px] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Buscar item..."
                    value={itemDesc}
                    onValueChange={(val) => {
                      setItemDesc(val)
                      setItemCode('')
                    }}
                  />
                  <CommandList>
                    <CommandEmpty className="p-2">
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-sm h-auto py-2 whitespace-normal text-left"
                        onClick={() => {
                          setComboboxOpen(false)
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4 shrink-0" />
                        <span>Usar texto livre: "{itemDesc}"</span>
                      </Button>
                    </CommandEmpty>
                    {suggestions.length > 0 && (
                      <CommandGroup
                        heading={selectedOrderId !== 'none' ? 'Componentes da OP' : 'Catálogo'}
                      >
                        {suggestions.map((s, i) => (
                          <CommandItem
                            key={i}
                            value={`${s.code} ${s.desc}`}
                            onSelect={() => {
                              setItemCode(s.code)
                              setItemDesc(s.desc)
                              setComboboxOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                itemDesc === s.desc ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            {s.code && (
                              <span className="text-muted-foreground mr-2 font-medium">
                                {s.code}
                              </span>
                            )}
                            {s.desc}
                          </CommandItem>
                        ))}
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
              <Input value={sector} onChange={(e) => setSector(e.target.value)} />
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
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSubmit}>
              Salvar Solicitação
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
