import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { Client, Product, ProductProcessModel } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const ALL_STAGES = [
  'Separação no estoque fisico',
  'Separação',
  'Cotação',
  'Compra',
  'Retirada',
  'Aguardando',
  'Corte',
  'Dobra',
  'Calandra',
  'Solda',
  'Acab. Solda',
  'Furação',
  'Rosca',
  'Concreto',
  'Terceirização',
  'Preparação',
  'Pintura',
  'Verniz',
  'Retoques',
  'Montagem',
  'Qualidade',
  'Embalagem',
  'Expedição',
]

export function PcpOrderForm({
  isOpen,
  onOpenChange,
  clients,
  products,
  onSuccess,
}: {
  isOpen: boolean
  onOpenChange: (val: boolean) => void
  clients: Client[]
  products: Product[]
  onSuccess: () => void
}) {
  const { toast } = useToast()
  const [isClientModalOpen, setIsClientModalOpen] = useState(false)
  const [newClientName, setNewClientName] = useState('')

  const [orderNumber, setOrderNumber] = useState('')
  const [opNumber, setOpNumber] = useState('')
  const [opType, setOpType] = useState('Linha')
  const [clientId, setClientId] = useState('')
  const [quantity, setQuantity] = useState<number | string>(1)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [productId, setProductId] = useState('')
  const [manualProduct, setManualProduct] = useState('')
  const [manualPriority, setManualPriority] = useState('')
  const [annex, setAnnex] = useState<File | null>(null)

  const [formObservations, setFormObservations] = useState<{ sector: string; content: string }[]>(
    [],
  )

  const [processes, setProcesses] = useState<ProductProcessModel[]>([])
  const [showEstimatesModal, setShowEstimatesModal] = useState(false)
  const [estimatesForm, setEstimatesForm] = useState<Record<string, number | string>>({})
  const [globalProcessNames, setGlobalProcessNames] = useState<string[]>(ALL_STAGES)

  useEffect(() => {
    // Suppress previous logic and fetch exclusively active processes
    pb.collection('product_processes')
      .getFullList<{ name: string; order: number }>({ fields: 'name,order', sort: 'order' })
      .then((res) => {
        const uniqueNames = Array.from(new Set(res.map((r) => r.name))).filter(Boolean)
        if (uniqueNames.length > 0) {
          setGlobalProcessNames(uniqueNames)
        }
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    return // Disable the original effect completely
    pb.collection('product_processes')
      .getFullList<{ name: string; order: number }>({ fields: 'name,order', sort: 'order' })
      .then((res) => {
        const unique = new Set<string>(ALL_STAGES)
        res.forEach((r) => unique.add(r.name))
        setGlobalProcessNames(Array.from(unique))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (productId && opType === 'Linha') {
      pb.collection('product_processes')
        .getFullList<ProductProcessModel>({ filter: `product_id="${productId}"` })
        .then((res) => setProcesses(res))
        .catch(() => setProcesses([]))
    } else {
      setProcesses([])
    }
  }, [productId, opType])

  const handleQuickClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const record = await pb.collection('clients').create({ name: newClientName })
      setClientId(record.id)
      setIsClientModalOpen(false)
      setNewClientName('')
      onSuccess()
      toast({ title: 'Sucesso', description: 'Cliente adicionado.' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const executeCreateOrder = async (estimates?: Record<string, number | string>) => {
    try {
      const formData = new FormData()
      formData.append('order_number', orderNumber)
      formData.append('op_number', opNumber)

      const selectedClient = clients.find((c) => c.id === clientId)
      if (selectedClient) formData.append('client_name', selectedClient.name)

      formData.append('client_id', clientId)
      formData.append('quantity', quantity.toString())
      formData.append('delivery_date', new Date(deliveryDate).toISOString())
      formData.append('op_type', opType)
      formData.append('manual_priority', manualPriority ? manualPriority : '999')

      if (opType === 'Linha' && productId) formData.append('product_id', productId)
      if (opType === 'Assistência') formData.append('manual_product_name', manualProduct)
      if (annex) formData.append('annex', annex)

      formData.append('status', 'Fila')
      formData.append('bottleneck_reason', 'Nenhum')

      let initialStage = opType === 'Especial' ? 'Projetos' : 'Separação no estoque fisico'

      if (opType === 'Linha' && productId && estimates) {
        for (const stage of globalProcessNames) {
          const val = estimates[stage]
          const hrs = typeof val === 'number' ? val : parseFloat(val as string)
          if (hrs > 0) {
            initialStage = stage
            break
          }
        }
      }

      formData.append('stage', initialStage)

      const record = await pb.collection('pcp_orders').create(formData)

      for (const obs of formObservations) {
        if (obs.content.trim()) {
          await pb.collection('pcp_order_observations').create({
            order_id: record.id,
            sector: obs.sector,
            content: obs.content,
          })
        }
      }

      toast({ title: 'Sucesso', description: 'Ordem de Produção criada com sucesso.' })
      onOpenChange(false)

      setOrderNumber('')
      setOpNumber('')
      setClientId('')
      setQuantity(1)
      setDeliveryDate('')
      setOpType('Linha')
      setProductId('')
      setManualProduct('')
      setManualPriority('')
      setAnnex(null)
      setFormObservations([])
      onSuccess()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const checkAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (opType === 'Linha' && productId) {
      const initForm: Record<string, number | string> = {}
      globalProcessNames.forEach((name) => {
        const existing = processes.find((p) => p.name === name)
        initForm[name] = existing?.estimated_hours || ''
      })
      setEstimatesForm(initForm)
      setShowEstimatesModal(true)
      return
    }

    await executeCreateOrder()
  }

  const saveEstimates = async () => {
    try {
      const existingMap = new Map(processes.map((p) => [p.name, p]))
      let currentOrder = 1

      for (const name of globalProcessNames) {
        const val = estimatesForm[name]
        const num = typeof val === 'number' ? val : parseFloat(val as string)
        const hrs = isNaN(num) ? 0 : num

        const existing = existingMap.get(name)
        if (existing) {
          if (existing.estimated_hours !== hrs) {
            await pb.collection('product_processes').update(existing.id, { estimated_hours: hrs })
          }
        } else if (hrs > 0) {
          await pb.collection('product_processes').create({
            product_id: productId,
            name: name,
            estimated_hours: hrs,
            order: currentOrder,
          })
        }
        currentOrder++
      }

      setShowEstimatesModal(false)
      toast({ title: 'Sucesso', description: 'Roteiro salvo. Criando OP...' })
      await executeCreateOrder(estimatesForm)
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' })
    }
  }

  return (
    <>
      <Dialog open={showEstimatesModal} onOpenChange={setShowEstimatesModal}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Configuração de Roteiro e Tempos</DialogTitle>
            <DialogDescription>
              Defina o tempo estimado para cada etapa. Deixe em branco ou 0 para pular a etapa.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4 max-h-[60vh] overflow-y-auto pr-2">
            {globalProcessNames.map((name) => {
              const val = estimatesForm[name]
              const isActive = val && Number(val) > 0
              return (
                <div key={name} className="flex items-center justify-between gap-4">
                  <Label
                    className="font-bold text-slate-700 dark:text-slate-300 w-1/2 truncate"
                    title={name}
                  >
                    {name}
                  </Label>
                  <div className="flex gap-2 items-center w-1/2">
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      value={val === undefined ? '' : val}
                      onChange={(e) =>
                        setEstimatesForm({ ...estimatesForm, [name]: e.target.value })
                      }
                      placeholder="0 (Pular)"
                      className={
                        isActive ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''
                      }
                    />
                    <span className="text-sm text-muted-foreground font-medium w-12">horas</span>
                  </div>
                </div>
              )
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEstimatesModal(false)}>
              Cancelar
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={saveEstimates}>
              Salvar e Criar OP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
            <DialogDescription>
              Crie um novo cliente rapidamente para vinculá-lo à OP.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleQuickClientSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                required
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Ex: Indústria Alpha"
              />
            </div>
            <Button type="submit" className="w-full">
              Adicionar
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>
          <Button>
            <Plus className="mr-2 size-4" /> Nova OP
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Criar Ordem de Produção</SheetTitle>
            <SheetDescription>
              Preencha os dados ou anexe o documento do sistema externo.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={checkAndSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nº do Pedido</Label>
                <Input
                  required
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="Ex: PED-2026-100"
                />
              </div>
              <div className="space-y-2">
                <Label>Nº da OP</Label>
                <Input
                  required
                  value={opNumber}
                  onChange={(e) => setOpNumber(e.target.value)}
                  placeholder="Ex: OP-001"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tipo de OP</Label>
              <Select required value={opType} onValueChange={setOpType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Linha">Linha</SelectItem>
                  <SelectItem value="Especial">Especial</SelectItem>
                  <SelectItem value="Assistência">Assistência</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Cliente</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setIsClientModalOpen(true)}
                >
                  <Plus className="mr-1 size-3" /> Novo Cliente
                </Button>
              </div>
              <Select required value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {opType === 'Assistência' && (
              <div className="space-y-2">
                <Label>Produto (Manual)</Label>
                <Input
                  required
                  value={manualProduct}
                  onChange={(e) => setManualProduct(e.target.value)}
                  placeholder="Nome do produto ou peça..."
                />
              </div>
            )}
            {opType === 'Linha' && (
              <div className="space-y-2">
                <Label>Produto</Label>
                <Select required value={productId} onValueChange={setProductId}>
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
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  required
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Data de Entrega</Label>
                <Input
                  type="date"
                  required
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <Label>Prioridade Manual (1 = Alta)</Label>
              <Input
                type="number"
                min={1}
                max={999}
                value={manualPriority}
                onChange={(e) => setManualPriority(e.target.value)}
                placeholder="Opcional. Padrão: 999"
              />
            </div>

            <div className="space-y-4 pt-2 border-t mt-4">
              <div className="flex items-center justify-between">
                <Label>Observações por Setor</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFormObservations([
                      ...formObservations,
                      { sector: 'Fabricação', content: '' },
                    ])
                  }
                >
                  <Plus className="mr-1 size-3" /> Adicionar
                </Button>
              </div>
              {formObservations.map((obs, idx) => (
                <div key={idx} className="space-y-2 p-3 border rounded-md relative group">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100"
                    onClick={() =>
                      setFormObservations(formObservations.filter((_, i) => i !== idx))
                    }
                  >
                    <X className="size-3" />
                  </Button>
                  <Select
                    value={obs.sector}
                    onValueChange={(val) => {
                      const newObs = [...formObservations]
                      newObs[idx].sector = val
                      setFormObservations(newObs)
                    }}
                  >
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Fabricação">Fabricação</SelectItem>
                      <SelectItem value="Acabamento">Acabamento</SelectItem>
                      <SelectItem value="Montagem">Montagem</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={obs.content}
                    onChange={(e) => {
                      const newObs = [...formObservations]
                      newObs[idx].content = e.target.value
                      setFormObservations(newObs)
                    }}
                    className="min-h-[60px] text-sm"
                    placeholder="Detalhes da observação..."
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Anexo (PDF/Imagem)</Label>
              <Input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setAnnex(e.target.files?.[0] || null)}
              />
            </div>
            <Button type="submit" className="w-full mt-4">
              Salvar OP
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
