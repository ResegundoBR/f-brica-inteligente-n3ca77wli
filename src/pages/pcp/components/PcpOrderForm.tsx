import { useState, useEffect, useMemo } from 'react'
import { useForm, Controller, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useToast } from '@/components/ui/use-toast'
import { format, parseISO } from 'date-fns'
import { Plus, Trash, Check, ChevronsUpDown, FileUp, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  extractTextFromPdfFile,
  parseOpPdfDeterministic,
  comparePdfWithCatalog,
  type ExtractedOpHeader,
  type ExtractedOpComponent,
  type ComponentComparisonRow,
} from '@/lib/op-pdf-parser'
import { OpPdfReviewModal } from './OpPdfReviewModal'
import {
  createOrderMaterialsBatch,
  deleteOrderMaterialsByOrder,
} from '@/services/pcp-order-materials'
import type { PcpOrderMaterialSector } from '@/types'

const schema = z
  .object({
    order_number: z.string().min(1, 'Número do Pedido é obrigatório'),
    op_number: z.string().optional().default(''),
    client_id: z.string().min(1, 'Cliente é obrigatório'),
    op_type: z.enum(['Linha', 'Especial', 'Assistência']),
    product_id: z.string().optional().default(''),
    manual_product_name: z.string().optional().default(''),
    quantity: z.coerce.number().min(1, 'Quantidade deve ser maior que zero'),
    delivery_date: z.string().min(1, 'Data de entrega é obrigatória'),
    manual_priority: z.number().default(0),
    estimates: z.record(z.string(), z.any()).optional(),
    observations: z
      .array(
        z.object({
          sector: z.enum(['Fabricação', 'Acabamento', 'Montagem', 'Projetos']),
          content: z.string().min(1, 'Observação não pode ser vazia'),
        }),
      )
      .default([]),
  })
  .refine(
    (data) => {
      if (data.op_type === 'Linha' && !data.product_id) return false
      return true
    },
    { message: 'Preencha o produto corretamente', path: ['product_id'] },
  )
  .refine(
    (data) => {
      if (
        (data.op_type === 'Assistência' || data.op_type === 'Especial') &&
        !data.manual_product_name
      )
        return false
      return true
    },
    { message: 'Nome do produto é obrigatório', path: ['manual_product_name'] },
  )

const KANBAN_STAGES = [
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
  'Suprimentos',
  'Fabricação',
  'Acabamento',
  'Expedição',
  'Projetos',
]

function safeKey(name: string) {
  return name.replace(/[^a-zA-Z0-9]/g, '_')
}

const DEFAULT_FABRICACAO_PROCESSES = [
  'Corte',
  'Dobra',
  'Calandra',
  'Solda',
  'Acab. Solda',
  'Furação',
  'Rosca',
  'Concreto',
]

function getSectorGroups(fabricationProcesses: string[] = DEFAULT_FABRICACAO_PROCESSES) {
  return [
    {
      name: 'Engenharia/Projetos',
      color: 'bg-indigo-100/50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300',
      processes: ['Projetos'],
    },
    {
      name: 'Suprimentos',
      color: 'bg-blue-100/50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300',
      processes: ['Separação', 'Cotação', 'Compra', 'Retirada', 'Aguardando'],
    },
    {
      name: 'Fabricação',
      color: 'bg-orange-100/50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300',
      processes: fabricationProcesses,
    },
    {
      name: 'Terceirização',
      color: 'bg-rose-100/50 dark:bg-rose-900/20 text-rose-800 dark:text-rose-300',
      processes: ['Terceirização'],
    },
    {
      name: 'Acabamento',
      color: 'bg-purple-100/50 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300',
      processes: ['Preparação', 'Pintura', 'Verniz', 'Retoques'],
    },
    {
      name: 'Montagem',
      color: 'bg-green-100/50 dark:bg-green-900/20 text-green-800 dark:text-green-300',
      processes: ['Montagem'],
    },
    {
      name: 'Expedição',
      color: 'bg-teal-100/50 dark:bg-teal-900/20 text-teal-800 dark:text-teal-300',
      processes: ['Qualidade', 'Embalagem', 'Expedição'],
    },
  ]
}

export function PcpOrderForm({
  open,
  onOpenChange,
  onSuccess,
  editingOrder,
  editObservations,
}: any) {
  const [clients, setClients] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [processes, setProcesses] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [newClientOpen, setNewClientOpen] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientType, setNewClientType] = useState('B2B')
  const [productOpen, setProductOpen] = useState(false)
  const [missingTimeProduct, setMissingTimeProduct] = useState<{
    product: any
    processesToDefine: any[]
    isUpdate: boolean
    pendingFormData: z.infer<typeof schema>
    fabricationProcesses: string[]
  } | null>(null)
  const [checkingProcesses, setCheckingProcesses] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [parsingPdf, setParsingPdf] = useState(false)
  const [pdfReviewOpen, setPdfReviewOpen] = useState(false)
  const [extractedPdfHeader, setExtractedPdfHeader] = useState<ExtractedOpHeader>({})
  const [extractedPdfComponents, setExtractedPdfComponents] = useState<ExtractedOpComponent[]>([])
  const [comparisonRows, setComparisonRows] = useState<ComponentComparisonRow[]>([])
  const [pendingMaterialsToSave, setPendingMaterialsToSave] = useState<
    Array<{
      sector: PcpOrderMaterialSector
      code: string
      description: string
      quantity: number
      unit: string
      measurements?: string
    }>
  >([])
  const { toast } = useToast()

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      order_number: '',
      op_number: '',
      client_id: '',
      op_type: 'Linha',
      quantity: 1,
      delivery_date: format(new Date(), 'yyyy-MM-dd'),
      manual_priority: 0,
      estimates: {},
      observations: [],
    },
  })

  const {
    fields: obsFields,
    append: appendObs,
    remove: removeObs,
  } = useFieldArray({
    control: form.control,
    name: 'observations',
  })

  const opType = form.watch('op_type')

  const processKeyMap = useMemo(() => {
    const map: Record<string, string> = {}
    processes.forEach((p) => {
      map[safeKey(p.name)] = p.name
    })
    return map
  }, [processes])

  const reloadProducts = () => {
    pb.collection('products')
      .getFullList({ sort: 'name' })
      .then(setProducts)
      .catch(() => {})
  }

  useEffect(() => {
    const loadClients = () =>
      pb.collection('clients').getFullList({ sort: 'name' }).then(setClients)

    if (open) {
      setSubmitError(null)
      loadClients()
      reloadProducts()

      pb.collection('product_processes')
        .getFullList({ sort: 'name' })
        .then((res) => {
          const unique = Array.from(new Set(res.map((r) => r.name)))
            .map((name) => res.find((r) => r.name === name))
            .filter(Boolean)
          setProcesses(unique)
        })

      if (editingOrder) {
        const deliveryDate = editingOrder.delivery_date
          ? format(parseISO(editingOrder.delivery_date), 'yyyy-MM-dd')
          : format(new Date(), 'yyyy-MM-dd')

        const estimates: Record<string, any> = {}
        if (editingOrder.outsourcing_data) {
          const od = editingOrder.outsourcing_data
          const estData = od?.estimates || (Array.isArray(od) ? od[0]?.estimates : null)
          if (estData && typeof estData === 'object') {
            for (const [name, hours] of Object.entries(estData)) {
              estimates[safeKey(name)] = hours
            }
          }
        }

        const obs = (editObservations || []).map((o: any) => ({
          sector: o.sector,
          content: o.content,
        }))

        form.reset({
          order_number: editingOrder.order_number || '',
          op_number: editingOrder.op_number || '',
          client_id: editingOrder.client_id || '',
          op_type: editingOrder.op_type,
          product_id: editingOrder.product_id || '',
          manual_product_name: editingOrder.manual_product_name || '',
          quantity: Number(editingOrder.quantity) || 1,
          delivery_date: deliveryDate,
          manual_priority: editingOrder.manual_priority || 0,
          estimates,
          observations: obs,
        })
      } else {
        form.reset({
          order_number: '',
          op_number: '',
          client_id: '',
          op_type: 'Linha',
          quantity: 1,
          delivery_date: format(new Date(), 'yyyy-MM-dd'),
          manual_priority: 0,
          estimates: {},
          observations: [],
        })
      }
    }
  }, [open, form, editingOrder])

  useRealtime('product_processes', () => {
    if (open) reloadProducts()
  })

  const handlePdfImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setParsingPdf(true)
    try {
      const { pages, positionedPages } = await extractTextFromPdfFile(file)
      const allLines = pages.flat()
      const allPositionedLines = positionedPages ? positionedPages.flat() : undefined
      const parsed = parseOpPdfDeterministic(allLines, allPositionedLines)

      // Try to auto-detect matching product in catalog by code or name
      let matchedProduct = null
      if (parsed.header.product_code) {
        const cleanCode = parsed.header.product_code.trim().replace(/^0+/, '').toLowerCase()
        matchedProduct = products.find(
          (p) =>
            (p.code || '').trim().replace(/^0+/, '').toLowerCase() === cleanCode ||
            (p.name || '')
              .toLowerCase()
              .includes(parsed.header.product_name?.toLowerCase() || '___'),
        )
      } else if (parsed.header.product_name) {
        matchedProduct = products.find((p) =>
          (p.name || '').toLowerCase().includes(parsed.header.product_name!.toLowerCase()),
        )
      }

      // If form already had a selected product, prioritize that or the newly matched one
      const currentProductId = form.getValues('product_id')
      const targetProduct =
        (currentProductId ? products.find((p) => p.id === currentProductId) : null) ||
        matchedProduct

      const compRows = comparePdfWithCatalog(parsed.components, targetProduct)

      setExtractedPdfHeader(parsed.header)
      setExtractedPdfComponents(parsed.components)
      setComparisonRows(compRows)
      setPdfReviewOpen(true)
      toast({
        title: 'PDF lido com sucesso!',
        description: `${parsed.components.length} componentes extraídos do PDF.`,
      })
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao processar PDF',
        description: err.message || 'Não foi possível extrair os dados do arquivo.',
        variant: 'destructive',
      })
    } finally {
      setParsingPdf(false)
      if (e.target) e.target.value = ''
    }
  }

  const handleApplyPdfDecisions = async (decisions: {
    header: ExtractedOpHeader
    materialsForOp: Array<{
      sector: PcpOrderMaterialSector
      code: string
      description: string
      quantity: number
      unit: string
      measurements?: string
    }>
    catalogUpdates?: {
      productId: string
      newComposition: any[]
    }
  }) => {
    // 1. Fill editable header fields into form:
    // Número do Pedido, Número da OP, Data de entrega, Quantidade e Cliente
    if (decisions.header.order_number) {
      form.setValue('order_number', decisions.header.order_number)
    }
    if (decisions.header.op_number) {
      form.setValue('op_number', decisions.header.op_number)
    }
    if (decisions.header.delivery_date) {
      form.setValue('delivery_date', decisions.header.delivery_date)
    }
    if (decisions.header.quantity && decisions.header.quantity > 0) {
      form.setValue('quantity', decisions.header.quantity)
    }
    if (decisions.header.client_name) {
      const matchClient = clients.find(
        (c) =>
          c.name.toLowerCase().includes(decisions.header.client_name!.toLowerCase()) ||
          decisions.header.client_name!.toLowerCase().includes(c.name.toLowerCase()),
      )
      if (matchClient) {
        form.setValue('client_id', matchClient.id)
      }
    }

    // Auto select product if found and not yet set
    const currentProd = form.getValues('product_id')
    if (!currentProd && decisions.header.product_code) {
      const cleanCode = decisions.header.product_code.trim().replace(/^0+/, '').toLowerCase()
      const p = products.find(
        (prod) => (prod.code || '').trim().replace(/^0+/, '').toLowerCase() === cleanCode,
      )
      if (p) {
        form.setValue('product_id', p.id)
        form.setValue('op_type', 'Linha')
      }
    }

    // Save pending materials to be inserted into pcp_order_materials on submit
    setPendingMaterialsToSave(decisions.materialsForOp)

    // 2. If catalog update was requested by user, update the product data in database
    if (decisions.catalogUpdates) {
      try {
        const prod = products.find((p) => p.id === decisions.catalogUpdates!.productId)
        if (prod) {
          await pb.collection('products').update(prod.id, {
            data: {
              ...prod.data,
              composition: decisions.catalogUpdates.newComposition,
            },
          })
          toast({
            title: 'Catálogo Atualizado',
            description: 'A composição do produto foi atualizada conforme sua decisão.',
          })
          reloadProducts()
        }
      } catch (err: any) {
        toast({
          title: 'Erro ao atualizar catálogo',
          description: err.message,
          variant: 'destructive',
        })
      }
    }

    toast({
      title: 'Dados importados com sucesso',
      description: 'Campos preenchidos. Você pode editar qualquer informação antes de salvar.',
    })
  }

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClientName) return
    setLoading(true)
    try {
      const record = await pb.collection('clients').create({
        name: newClientName,
        type: newClientType,
      })
      await pb.collection('clients').getFullList({ sort: 'name' }).then(setClients)
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
    if (checkingProcesses) return
    setSubmitError(null)

    if (editingOrder) {
      await updateOrder(data)
      return
    }

    let processesToFill: any[] = []
    let fabricationProcesses: string[] = DEFAULT_FABRICACAO_PROCESSES

    if (data.op_type === 'Linha' && data.product_id) {
      setCheckingProcesses(true)
      try {
        const productProcesses = await pb
          .collection('product_processes')
          .getFullList({ filter: `product_id="${data.product_id}"` })

        if (productProcesses.length > 0) {
          fabricationProcesses = productProcesses.map((p) => p.name)
        }

        const sectorGroups = getSectorGroups(fabricationProcesses)
        const requiredProcessNames = Array.from(new Set(sectorGroups.flatMap((s) => s.processes)))

        const allComplete =
          productProcesses.length > 0 &&
          requiredProcessNames.every((reqName) => {
            const proc = productProcesses.find((p) => p.name === reqName)
            if (!proc) return false
            const hours = proc.estimated_hours || 0
            if (hours === 0) return true
            return proc.estimated_days && proc.estimated_days > 0 && proc.kanban_stage
          })

        if (!allComplete) {
          processesToFill = requiredProcessNames.map((reqName) => {
            const existing = productProcesses.find((p) => p.name === reqName)
            if (existing) {
              return {
                id: existing.id,
                name: existing.name,
                isNew: false,
                estimated_hours: existing.estimated_hours || 0,
                estimated_days: existing.estimated_days || 0,
                kanban_stage: existing.kanban_stage || '',
              }
            }
            return {
              id: `new_${reqName}`,
              name: reqName,
              isNew: true,
              estimated_hours: 0,
              estimated_days: 0,
              kanban_stage: reqName,
            }
          })
        }
      } catch (err) {
        console.error(err)
      } finally {
        setCheckingProcesses(false)
      }
    }

    if (processesToFill.length > 0) {
      const product = products.find((p) => p.id === data.product_id)
      setMissingTimeProduct({
        product,
        processesToDefine: processesToFill,
        isUpdate: !!editingOrder,
        pendingFormData: data,
        fabricationProcesses,
      })
      return
    }

    await createOrder(data)
  }

  const createOrder = async (data: z.infer<typeof schema>) => {
    setLoading(true)
    try {
      const client = clients.find((c) => c.id === data.client_id)

      const payload: any = {
        order_number: data.order_number,
        op_number: data.op_number || '',
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
        if (data.op_type === 'Assistência' || data.op_type === 'Especial') {
          payload.manual_product_name = data.manual_product_name
        }

        const validEstimates: Record<string, number> = {}
        if (data.estimates) {
          for (const [key, val] of Object.entries(data.estimates)) {
            const numVal = typeof val === 'number' ? val : parseFloat(String(val))
            if (!Number.isNaN(numVal) && numVal > 0) {
              const originalName = processKeyMap[key] || key
              validEstimates[originalName] = numVal
            }
          }
        }
        payload.outsourcing_data = {
          estimates: validEstimates,
        }
      }

      const record = await pb.collection('pcp_orders').create(payload)

      if (data.observations && data.observations.length > 0) {
        for (const obs of data.observations) {
          await pb.collection('pcp_order_observations').create({
            order_id: record.id,
            sector: obs.sector,
            content: obs.content,
          })
        }
      }

      // Save extracted/selected materials to pcp_order_materials for this OP
      if (pendingMaterialsToSave.length > 0) {
        const matsToCreate = pendingMaterialsToSave.map((m) => ({
          order_id: record.id,
          sector: m.sector,
          code: m.code,
          description: m.description,
          quantity: m.quantity,
          unit: m.unit,
          measurements: m.measurements,
          status: 'Pendente' as const,
        }))
        await createOrderMaterialsBatch(matsToCreate)
      }

      toast({ title: 'OP criada com sucesso!' })
      onSuccess?.()
      onOpenChange(false)
    } catch (err: any) {
      const errorMsg = getErrorMessage(err)
      setSubmitError(errorMsg)
      toast({
        title: 'Erro ao criar OP',
        description: errorMsg,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const updateOrder = async (data: z.infer<typeof schema>) => {
    setLoading(true)
    try {
      const client = clients.find((c) => c.id === data.client_id)

      const payload: any = {
        order_number: data.order_number,
        op_number: data.op_number || '',
        client_id: data.client_id,
        client_name: client?.name || '',
        op_type: data.op_type,
        quantity: data.quantity,
        delivery_date: new Date(data.delivery_date).toISOString(),
        manual_priority: data.manual_priority,
      }

      if (data.op_type === 'Linha') {
        payload.product_id = data.product_id
        payload.manual_product_name = ''
      } else {
        if (data.op_type === 'Assistência' || data.op_type === 'Especial') {
          payload.manual_product_name = data.manual_product_name
        }

        const validEstimates: Record<string, number> = {}
        if (data.estimates) {
          for (const [key, val] of Object.entries(data.estimates)) {
            const numVal = typeof val === 'number' ? val : parseFloat(String(val))
            if (!Number.isNaN(numVal) && numVal > 0) {
              const originalName = processKeyMap[key] || key
              validEstimates[originalName] = numVal
            }
          }
        }
        payload.outsourcing_data = {
          estimates: validEstimates,
        }
      }

      await pb.collection('pcp_orders').update(editingOrder.id, payload)

      const existingObs = await pb
        .collection('pcp_order_observations')
        .getFullList({ filter: `order_id="${editingOrder.id}"` })
      for (const obs of existingObs) {
        await pb.collection('pcp_order_observations').delete(obs.id)
      }

      if (data.observations && data.observations.length > 0) {
        for (const obs of data.observations) {
          await pb.collection('pcp_order_observations').create({
            order_id: editingOrder.id,
            sector: obs.sector,
            content: obs.content,
          })
        }
      }

      toast({ title: 'OP atualizada com sucesso!' })
      onSuccess?.()
      onOpenChange(false)
    } catch (err: any) {
      const errorMsg = getErrorMessage(err)
      setSubmitError(errorMsg)
      toast({
        title: 'Erro ao atualizar OP',
        description: errorMsg,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <DialogTitle>
                {editingOrder ? 'Editar Ordem de Produção' : 'Nova Ordem de Produção'}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Preencha os dados da OP manualmente ou importe diretamente o PDF do ERP.
              </DialogDescription>
            </div>
            {!editingOrder && (
              <div>
                <input
                  type="file"
                  id="pdf-op-upload"
                  accept=".pdf"
                  className="hidden"
                  onChange={handlePdfImport}
                  disabled={parsingPdf}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-primary text-primary hover:bg-primary/10 font-bold text-xs"
                  onClick={() => document.getElementById('pdf-op-upload')?.click()}
                  disabled={parsingPdf}
                >
                  {parsingPdf ? (
                    <>
                      <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Lendo PDF...
                    </>
                  ) : (
                    <>
                      <FileUp className="size-3.5 mr-1.5" /> Importar PDF da OP
                    </>
                  )}
                </Button>
              </div>
            )}
          </DialogHeader>
          <form
            onSubmit={form.handleSubmit(
              async (data: any) => {
                try {
                  setSubmitError(null)
                  await onSubmit(data)
                } catch (err: any) {
                  const errorMsg = err?.message || 'Erro inesperado ao salvar OP.'
                  setSubmitError(errorMsg)
                  toast({
                    title: 'Erro ao salvar OP',
                    description: errorMsg,
                    variant: 'destructive',
                  })
                } finally {
                  setLoading(false)
                  setCheckingProcesses(false)
                }
              },
              (errors) => {
                const messages: string[] = []
                Object.values(errors).forEach((err: any) => {
                  if (err?.message) {
                    messages.push(err.message)
                  } else if (err && typeof err === 'object') {
                    Object.values(err).forEach((nested: any) => {
                      if (nested?.message) messages.push(nested.message)
                    })
                  }
                })
                setSubmitError(
                  messages.length > 0
                    ? messages.join(' ')
                    : 'Verifique os campos obrigatórios do formulário.',
                )
                toast({
                  title: 'Erro de validação',
                  description: 'Verifique os campos obrigatórios do formulário.',
                  variant: 'destructive',
                })
              },
            )}
            className="space-y-4 py-4"
          >
            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Número do Pedido</Label>
                <Input {...form.register('order_number')} placeholder="Ex: PED-1234" />
              </div>
              <div className="space-y-2">
                <Label>Número da OP</Label>
                <Input {...form.register('op_number')} placeholder="Ex: OP-1234-01" />
              </div>
              <div className="space-y-2">
                <Label>Data de Entrega</Label>
                <Input type="date" {...form.register('delivery_date')} />
              </div>
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input type="number" min="1" {...form.register('quantity')} />
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

              {opType === 'Linha' && (
                <div className="space-y-2">
                  <Label>Produto</Label>
                  <Controller
                    control={form.control}
                    name="product_id"
                    render={({ field }) => (
                      <Popover open={productOpen} onOpenChange={setProductOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between font-normal"
                          >
                            {field.value
                              ? products.find((p) => p.id === field.value)?.name ||
                                'Selecione um produto'
                              : 'Selecione um produto'}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="p-0"
                          align="start"
                          style={{ width: 'var(--radix-popover-trigger-width)' }}
                        >
                          <Command>
                            <CommandInput placeholder="Buscar produto por nome..." />
                            <CommandList>
                              <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                              <CommandGroup>
                                {products.map((p) => (
                                  <CommandItem
                                    key={p.id}
                                    value={p.name}
                                    onSelect={() => {
                                      field.onChange(p.id)
                                      setProductOpen(false)
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        field.value === p.id ? 'opacity-100' : 'opacity-0',
                                      )}
                                    />
                                    {p.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    )}
                  />
                </div>
              )}

              {(opType === 'Assistência' || opType === 'Especial') && (
                <div className="space-y-2">
                  <Label>
                    {opType === 'Especial' ? 'Nome da Luminária' : 'Nome do Produto (Assistência)'}
                  </Label>
                  <Input
                    {...form.register('manual_product_name')}
                    placeholder="Descrição do produto"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 border rounded-lg bg-red-50/50 dark:bg-red-950/20">
                <div className="space-y-0.5">
                  <Label className="text-red-600 dark:text-red-400 font-bold">
                    Marcar como Emergência
                  </Label>
                  <p className="text-sm text-muted-foreground">Prioridade máxima no painel.</p>
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
              <div className="flex items-center justify-between p-4 border rounded-lg bg-lime-50/50 dark:bg-lime-950/20">
                <div className="space-y-0.5">
                  <Label className="text-lime-700 dark:text-lime-400 font-bold">
                    ⚡ Prazo Especial
                  </Label>
                  <p className="text-sm text-muted-foreground">Atenção de todos os setores.</p>
                </div>
                <Controller
                  control={form.control}
                  name="manual_priority"
                  render={({ field }) => (
                    <Switch
                      checked={field.value === 2}
                      onCheckedChange={(c) => field.onChange(c ? 2 : 0)}
                    />
                  )}
                />
              </div>
            </div>

            <div className="mt-6 border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold">Observações (Por Setor)</h3>
                  <p className="text-sm text-muted-foreground">
                    Adicione observações específicas para os setores.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendObs({ sector: 'Fabricação', content: '' })}
                >
                  <Plus className="size-4 mr-2" /> Nova Observação
                </Button>
              </div>

              {obsFields.length === 0 && (
                <div className="text-sm text-center text-muted-foreground py-4 bg-muted/20 rounded-md">
                  Nenhuma observação adicionada.
                </div>
              )}

              <div className="space-y-3">
                {obsFields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 items-start">
                    <div className="w-1/3 min-w-[140px]">
                      <Controller
                        control={form.control}
                        name={`observations.${index}.sector`}
                        render={({ field: selectField }) => (
                          <Select value={selectField.value} onValueChange={selectField.onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder="Setor" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Fabricação">Fabricação</SelectItem>
                              <SelectItem value="Acabamento">Acabamento</SelectItem>
                              <SelectItem value="Montagem">Montagem</SelectItem>
                              <SelectItem value="Projetos">Projetos</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        {...form.register(`observations.${index}.content`)}
                        placeholder="Descreva a observação..."
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeObs(index)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
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
                        {...form.register(`estimates.${safeKey(proc.name)}`)}
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
              <Button type="submit" disabled={loading || checkingProcesses}>
                {loading ? 'Salvando...' : editingOrder ? 'Salvar Alterações' : 'Criar OP'}
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

      <OpPdfReviewModal
        open={pdfReviewOpen}
        onOpenChange={setPdfReviewOpen}
        header={extractedPdfHeader}
        rawComponents={extractedPdfComponents}
        comparisonRows={comparisonRows}
        selectedProduct={products.find((p) => p.id === form.watch('product_id'))}
        onConfirm={handleApplyPdfDecisions}
      />

      <ProductProcessesModal
        missingData={missingTimeProduct}
        open={!!missingTimeProduct}
        onCancel={() => {
          setMissingTimeProduct(null)
        }}
        onSaved={async () => {
          const data = missingTimeProduct?.pendingFormData
          setMissingTimeProduct(null)
          if (data) {
            await createOrder(data)
          }
        }}
      />
    </>
  )
}

function ProductProcessesModal({ missingData, open, onCancel, onSaved }: any) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const [times, setTimes] = useState<
    Record<string, { hours?: number; days?: number; kanban_stage?: string }>
  >({})

  const sectorGroups = missingData
    ? getSectorGroups(missingData.fabricationProcesses || DEFAULT_FABRICACAO_PROCESSES)
    : getSectorGroups()

  useEffect(() => {
    if (open && missingData) {
      const initial: Record<string, { hours?: number; days?: number; kanban_stage?: string }> = {}
      missingData.processesToDefine.forEach((p: any) => {
        initial[p.id] = {
          hours: p.estimated_hours || undefined,
          days: p.estimated_days || undefined,
          kanban_stage: p.kanban_stage || undefined,
        }
      })
      setTimes(initial)
    }
  }, [open, missingData])

  const handleSave = async () => {
    const incomplete = missingData.processesToDefine.some((process: any) => {
      const data = times[process.id] || {}
      const h = data.hours !== undefined ? data.hours : process.estimated_hours || 0
      if (h === 0) return false
      const d = data.days !== undefined ? data.days : process.estimated_days || 0
      const ks = data.kanban_stage !== undefined ? data.kanban_stage : process.kanban_stage || ''
      return d < 0 || !ks
    })

    if (incomplete) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha dias e etapa Kanban para os processos com horas maiores que zero.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      let maxOrder = 0
      if (missingData.product) {
        const existing = await pb
          .collection('product_processes')
          .getFullList({ filter: `product_id="${missingData.product.id}"` })
        maxOrder = existing.length > 0 ? Math.max(...existing.map((p) => p.order)) : 0
      }

      for (const process of missingData.processesToDefine) {
        const data = times[process.id] || {}
        const h = data.hours !== undefined ? data.hours : process.estimated_hours || 0
        const d = data.days !== undefined ? data.days : process.estimated_days || 0
        const ks = data.kanban_stage !== undefined ? data.kanban_stage : process.kanban_stage || ''

        if (h > 0 || d > 0 || ks) {
          if (process.isNew) {
            maxOrder++
            await pb.collection('product_processes').create({
              product_id: missingData.product.id,
              name: process.name,
              description: '',
              order: maxOrder,
              color: '',
              estimated_hours: h,
              estimated_days: d,
              kanban_stage: ks,
              is_required: true,
            })
          } else {
            await pb.collection('product_processes').update(process.id, {
              estimated_hours: h,
              estimated_days: d,
              kanban_stage: ks,
            })
          }
        } else if (!process.isNew) {
          await pb.collection('product_processes').delete(process.id)
        }
      }

      toast({ title: 'Tempos salvos com sucesso!' })
      onSaved()
    } catch (err: any) {
      toast({ title: 'Erro ao salvar tempos', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  if (!missingData) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) onCancel()
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tempos de Produção Ausentes</DialogTitle>
          <DialogDescription>
            O produto <strong>{missingData.product?.name}</strong> possui processos com estimativas
            de tempo ausentes. Defina as horas e dias estimados para continuar com a criação da OP.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4 max-h-[60vh] overflow-y-auto pr-2">
          {sectorGroups.map((sector) => {
            const sectorProcs = missingData.processesToDefine.filter((proc: any) =>
              sector.processes.includes(proc.name),
            )
            if (sectorProcs.length === 0) return null
            return (
              <div key={sector.name} className="space-y-3">
                <div className={cn('text-sm font-bold rounded-md px-3 py-1.5', sector.color)}>
                  {sector.name}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sectorProcs.map((proc: any) => (
                    <div
                      key={proc.id}
                      className="space-y-3 border p-4 rounded-lg bg-card shadow-sm"
                    >
                      <Label className="text-sm font-semibold truncate block" title={proc.name}>
                        {proc.name}
                      </Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Horas</Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            placeholder="0"
                            value={times[proc.id]?.hours === undefined ? '' : times[proc.id].hours}
                            onChange={(e) => {
                              const val = e.target.value
                              setTimes((prev) => ({
                                ...prev,
                                [proc.id]: {
                                  ...prev[proc.id],
                                  hours: val === '' ? undefined : parseFloat(val),
                                },
                              }))
                            }}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Dias</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0"
                            value={times[proc.id]?.days === undefined ? '' : times[proc.id].days}
                            onChange={(e) => {
                              const val = e.target.value.replace(',', '.')
                              setTimes((prev) => ({
                                ...prev,
                                [proc.id]: {
                                  ...prev[proc.id],
                                  days: val === '' ? undefined : parseFloat(val),
                                },
                              }))
                            }}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Etapa Kanban</Label>
                        <Select
                          value={times[proc.id]?.kanban_stage || ''}
                          onValueChange={(val) => {
                            setTimes((prev) => ({
                              ...prev,
                              [proc.id]: {
                                ...prev[proc.id],
                                kanban_stage: val,
                              },
                            }))
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            {KANBAN_STAGES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar e Criar OP'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
