import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import pb from '@/lib/pocketbase/client'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import { format } from 'date-fns'
import { Plus } from 'lucide-react'

const schema = z
  .object({
    order_number: z.string().min(1, 'Número da OP é obrigatório'),
    client_id: z.string().min(1, 'Cliente é obrigatório'),
    op_type: z.enum(['Linha', 'Especial', 'Assistência']),
    product_id: z.string().optional(),
    manual_product_name: z.string().optional(),
    quantity: z.coerce.number().min(1, 'Quantidade deve ser maior que zero'),
    delivery_date: z.string().min(1, 'Data de entrega é obrigatória'),
    manual_priority: z.number().default(0),
    estimates: z.record(z.string(), z.union([z.number(), z.nan()])).optional(),
  })
  .refine(
    (data) => {
      if (data.op_type === 'Linha' && !data.product_id) return false
      if (data.op_type === 'Assistência' && !data.manual_product_name) return false
      return true
    },
    { message: 'Preencha o produto corretamente', path: ['product_id'] },
  )

export function PcpOrderForm({ open, onOpenChange, onSuccess }: any) {
  const [clients, setClients] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [processes, setProcesses] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [newClientOpen, setNewClientOpen] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientType, setNewClientType] = useState('B2B')
  const { toast } = useToast()

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      order_number: '',
      client_id: '',
      op_type: 'Linha',
      quantity: 1,
      delivery_date: format(new Date(), 'yyyy-MM-dd'),
      manual_priority: 0,
      estimates: {},
    },
  })

  const opType = form.watch('op_type')

  useEffect(() => {
    const loadClients = () =>
      pb.collection('clients').getFullList({ sort: 'name' }).then(setClients)

    if (open) {
      form.reset({
        order_number: '',
        client_id: '',
        op_type: 'Linha',
        quantity: 1,
        delivery_date: format(new Date(), 'yyyy-MM-dd'),
        manual_priority: 0,
        estimates: {},
      })
      loadClients()
      pb.collection('products').getFullList({ sort: 'name' }).then(setProducts)

      pb.collection('product_processes')
        .getFullList({ sort: 'name' })
        .then((res) => {
          const unique = Array.from(new Set(res.map((r) => r.name)))
            .map((name) => {
              return res.find((r) => r.name === name)
            })
            .filter(Boolean)
          setProcesses(unique)
        })
    }
  }, [open, form])

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClientName) return
    setLoading(true)
    try {
      const record = await pb.collection('clients').create({
        name: newClientName,
        type: newClientType,
      })
      await loadClients()
      form.setValue('client_id', record.id)
      setNewClientOpen(false)
      setNewClientName('')
      setNewClientType('B2B')
      toast({ title: 'Cliente criado com sucesso!' })
    } catch (err: any) {
      toast({ title: 'Erro ao criar cliente', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setLoading(true)
    try {
      const client = clients.find((c) => c.id === data.client_id)

      const payload: any = {
        order_number: data.order_number,
        client_id: data.client_id,
        client_name: client?.name || '',
        op_type: data.op_type,
        quantity: data.quantity,
        delivery_date: new Date(data.delivery_date).toISOString(),
        status: 'Fila',
        stage: 'Projetos',
        manual_priority: data.manual_priority,
        bottleneck_reason: 'Nenhum',
      }

      if (data.op_type === 'Linha') {
        payload.product_id = data.product_id
      } else {
        if (data.op_type === 'Assistência') {
          payload.manual_product_name = data.manual_product_name
        }

        // Clean estimates: remove NaNs resulting from empty inputs
        const validEstimates: Record<string, number> = {}
        if (data.estimates) {
          for (const [key, val] of Object.entries(data.estimates)) {
            if (!Number.isNaN(val) && val > 0) {
              validEstimates[key] = val
            }
          }
        }

        payload.outsourcing_data = {
          estimates: validEstimates,
        }
      }

      await pb.collection('pcp_orders').create(payload)
      toast({ title: 'OP criada com sucesso!' })
      onSuccess?.()
      onOpenChange(false)
    } catch (err: any) {
      toast({ title: 'Erro ao criar OP', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Ordem de Produção</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Número da OP</Label>
                <Input {...form.register('order_number')} placeholder="Ex: OP-1234" />
              </div>
              <div className="space-y-2">
                <Label>Data de Entrega</Label>
                <Input type="date" {...form.register('delivery_date')} />
              </div>
              <div className="space-y-2 col-span-2">
                <div className="flex items-center justify-between">
                  <Label>Cliente</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setNewClientOpen(true)}
                  >
                    <Plus className="size-3 mr-1" /> Novo Cliente
                  </Button>
                </div>
                <Controller
                  control={form.control}
                  name="client_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} {c.type ? `(${c.type})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de OP</Label>
                <Controller
                  control={form.control}
                  name="op_type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Linha">Linha</SelectItem>
                        <SelectItem value="Especial">Especial</SelectItem>
                        <SelectItem value="Assistência">Assistência</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input type="number" min="1" {...form.register('quantity')} />
              </div>

              {opType === 'Linha' && (
                <div className="space-y-2 col-span-2">
                  <Label>Produto</Label>
                  <Controller
                    control={form.control}
                    name="product_id"
                    render={({ field }) => (
                      <Select value={field.value || ''} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um produto" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              )}

              {opType === 'Assistência' && (
                <div className="space-y-2 col-span-2">
                  <Label>Nome do Produto (Assistência)</Label>
                  <Input
                    {...form.register('manual_product_name')}
                    placeholder="Descrição do produto para assistência"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg bg-red-50/50 dark:bg-red-950/20">
              <div className="space-y-0.5">
                <Label className="text-red-600 dark:text-red-400 font-bold">
                  Marcar como Emergência
                </Label>
                <p className="text-sm text-muted-foreground">
                  Esta OP terá prioridade máxima no painel do operador.
                </p>
              </div>
              <Controller
                control={form.control}
                name="manual_priority"
                render={({ field }) => (
                  <Switch
                    checked={field.value === 1}
                    onCheckedChange={(c) => field.onChange(c ? 1 : 0)}
                  />
                )}
              />
            </div>

            {opType !== 'Linha' && (
              <div className="mt-6 border-t pt-4">
                <h3 className="font-bold mb-2">Registro de Tempos Simplificado</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Informe o tempo estimado (em horas) para as etapas desta OP. Deixe em branco ou
                  zero para pular a etapa.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {processes.map((proc) => (
                    <div key={proc.id} className="flex flex-col gap-1">
                      <Label className="text-xs truncate" title={proc.name}>
                        {proc.name}
                      </Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="0"
                        {...form.register(`estimates.${proc.name}`, { valueAsNumber: true })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Salvando...' : 'Criar OP'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateClient} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Cliente</Label>
              <Input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Ex: Indústria XYZ"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Cliente</Label>
              <Select value={newClientType} onValueChange={setNewClientType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="B2B">B2B</SelectItem>
                  <SelectItem value="B2C">B2C</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewClientOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Salvando...' : 'Criar Cliente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
