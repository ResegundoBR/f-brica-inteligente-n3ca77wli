import { useEffect, useState, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import {
  PcpOrder,
  Product,
  Client,
  PcpOrderObservation,
  PcpOrderMaterial,
  Inventory,
  MasterComponent,
} from '@/types'
import { useRealtime } from '@/hooks/use-realtime'
import { useToast } from '@/hooks/use-toast'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { format, parseISO, isBefore, startOfDay } from 'date-fns'
import {
  Clock,
  Search,
  CheckSquare,
  Square,
  CheckCircle,
  XCircle,
  Calendar,
  Sparkles,
  Filter,
  ChevronRight,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { PromisedDateBadge } from '@/components/PromisedDateBadge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import {
  formatDeadline,
  filterByDeadline,
  isStageDelayed,
  normalizeSearchText,
} from '@/lib/pcp-utils'
import { PcpFilters } from './components/PcpFilters'
import { CompiledMaterialsView } from './components/CompiledMaterialsView'
import { compileOrderMaterials } from '@/services/pcp-programacao'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface PcpProgramacaoProps {
  embeddedInOrdersTab?: boolean
}

export default function PcpProgramacao({ embeddedInOrdersTab = false }: PcpProgramacaoProps) {
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [observations, setObservations] = useState<Record<string, PcpOrderObservation[]>>({})
  const [inventoryItems, setInventoryItems] = useState<Inventory[]>([])
  const [masterComponents, setMasterComponents] = useState<MasterComponent[]>([])

  // Materiais das ordens selecionadas
  const [selectedOpIds, setSelectedOpIds] = useState<Set<string>>(new Set())
  const [selectedMaterials, setSelectedMaterials] = useState<PcpOrderMaterial[]>([])
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(false)

  // Filtros da lista de OPs
  const [opTypeFilter, setOpTypeFilter] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [clientTypeFilter, setClientTypeFilter] = useState('all')
  const [deadlineFilter, setDeadlineFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [prazoEspecialOnly, setPrazoEspecialOnly] = useState(false)
  const [promisedOnly, setPromisedOnly] = useState(false)
  const [filaOnlyFilter, setFilaOnlyFilter] = useState(false)

  const { toast } = useToast()

  // Carrega dados gerais de apoio (somente leitura)
  const loadData = async () => {
    Promise.allSettled([
      pb
        .collection('pcp_orders')
        .getFullList<PcpOrder>({
          sort: '-created',
          expand: 'product_id,client_id,promised_by',
        })
        .then(setOrders)
        .catch(() => {
          toast({
            title: 'Erro',
            description: 'Não foi possível carregar as ordens de produção.',
            variant: 'destructive',
          })
        }),
      pb
        .collection('products')
        .getFullList<Product>({ sort: 'name', expand: 'status' })
        .then(setProducts)
        .catch(() => {}),
      pb
        .collection('clients')
        .getFullList<Client>({ sort: 'name' })
        .then(setClients)
        .catch(() => {}),
      pb
        .collection('inventory')
        .getFullList<Inventory>({ sort: 'description' })
        .then(setInventoryItems)
        .catch(() => {}),
      pb
        .collection('components')
        .getFullList<MasterComponent>({ sort: 'description' })
        .then(setMasterComponents)
        .catch(() => {}),
      pb
        .collection('pcp_order_observations')
        .getFullList<PcpOrderObservation>({ sort: 'created' })
        .then((obs) => {
          const obsMap: Record<string, PcpOrderObservation[]> = {}
          obs.forEach((o) => {
            if (!obsMap[o.order_id]) obsMap[o.order_id] = []
            obsMap[o.order_id].push(o)
          })
          setObservations(obsMap)
        })
        .catch(() => {}),
    ])
  }

  useEffect(() => {
    loadData()
  }, [])

  useRealtime('pcp_orders', () => loadData())
  useRealtime('inventory', () => loadData())
  useRealtime('pcp_order_materials', () => {
    // Recarrega materiais selecionados se houver realtime
    if (selectedOpIds.size > 0) {
      loadSelectedMaterials(Array.from(selectedOpIds))
    }
  })

  // Carrega os materiais das OPs selecionadas (apenas leitura de pcp_order_materials)
  const loadSelectedMaterials = async (opIds: string[]) => {
    if (opIds.length === 0) {
      setSelectedMaterials([])
      return
    }

    setIsLoadingMaterials(true)
    try {
      // Chunking seguro se houver muitas OPs selecionadas
      const chunkSize = 25
      const chunks: string[][] = []
      for (let i = 0; i < opIds.length; i += chunkSize) {
        chunks.push(opIds.slice(i, i + chunkSize))
      }

      const allMaterials: PcpOrderMaterial[] = []

      for (const chunk of chunks) {
        const filterStr = chunk.map((id) => `order_id = "${id}"`).join(' || ')
        const batch = await pb.collection('pcp_order_materials').getFullList<PcpOrderMaterial>({
          filter: filterStr,
          sort: 'description',
        })
        allMaterials.push(...batch)
      }

      // Se algumas OPs não tiverem pcp_order_materials gravados ainda, verificar se há composição técnica de produto
      // MODO ADITIVO / READ-ONLY: apenas compõe em memória para o compilado, SEM alterar ou criar nada no banco
      const existingOrderIdsWithMaterials = new Set(allMaterials.map((m) => m.order_id))
      const missingMaterialOps = orders.filter(
        (o) => opIds.includes(o.id) && !existingOrderIdsWithMaterials.has(o.id),
      )

      for (const op of missingMaterialOps) {
        if (!op.product_id) continue
        const prod = products.find((p) => p.id === op.product_id)
        if (prod?.data?.composition && Array.isArray(prod.data.composition)) {
          prod.data.composition.forEach((comp, idx) => {
            const compQty = Number(comp.quantity) || 1
            const opQty = Number(op.quantity) || 1
            allMaterials.push({
              id: `virtual-${op.id}-${idx}`,
              order_id: op.id,
              code: comp.code || '',
              description: comp.description || '',
              quantity: compQty * opQty,
              unit: 'UN',
              sector: 'FABRICAÇÃO',
              status: 'Pendente',
              created: '',
              updated: '',
            })
          })
        }
      }

      setSelectedMaterials(allMaterials)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar materiais',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsLoadingMaterials(false)
    }
  }

  // Filtragem das OPs para exibição na lista corrida
  const filteredOrders = useMemo(() => {
    return orders.filter((op) => {
      // Regra de programação de produção: foca nas OPs ativas/em aberto (Fila, Em Andamento, Parado)
      // Se o usuário optar por ver apenas OPs com status "Fila":
      if (filaOnlyFilter && op.status !== 'Fila') return false

      if (opTypeFilter !== 'all' && op.op_type !== opTypeFilter) return false
      if (clientFilter !== 'all' && op.client_id !== clientFilter) return false
      if (clientTypeFilter !== 'all' && op.expand?.client_id?.type !== clientTypeFilter)
        return false
      if (statusFilter !== 'all' && op.status !== statusFilter) return false
      if (stageFilter !== 'all' && op.stage !== stageFilter) return false
      if (!filterByDeadline(op.delivery_date, deadlineFilter, op.status)) return false
      if (prazoEspecialOnly && op.manual_priority !== 2) return false
      if (promisedOnly && !op.promised_date) return false

      if (search.trim()) {
        const q = normalizeSearchText(search)
        const clientName = op.expand?.client_id?.name || op.client_name || ''
        const productName =
          op.op_type === 'Assistência'
            ? op.manual_product_name || ''
            : op.expand?.product_id?.name || ''
        const productCode = op.expand?.product_id?.code || ''
        const orderNum = op.order_number || ''
        const opNum = op.op_number || ''
        const obsSector = op.observation_sector || ''

        const fields = [clientName, productName, productCode, orderNum, opNum, obsSector]
        return fields.some((f) => normalizeSearchText(f).includes(q))
      }

      return true
    })
  }, [
    orders,
    search,
    opTypeFilter,
    clientFilter,
    clientTypeFilter,
    statusFilter,
    stageFilter,
    deadlineFilter,
    prazoEspecialOnly,
    promisedOnly,
    filaOnlyFilter,
  ])

  // --------------------------------------------------------------------------
  // DETECÇÃO DE DUPLICATAS DE OP (Salvaguarda para o Gestor)
  // Agrupa todas as OPs pelo op_number para alertar se houver mais de um registro
  // --------------------------------------------------------------------------
  const duplicateOpsMap = useMemo(() => {
    const map = new Map<string, PcpOrder[]>()
    orders.forEach((op) => {
      const rawOp = (op.op_number || '').trim()
      if (!rawOp) return
      const norm = rawOp.toUpperCase()
      if (!map.has(norm)) {
        map.set(norm, [])
      }
      map.get(norm)!.push(op)
    })

    // Filtra apenas as que têm mais de 1 registro
    const duplicates = new Map<string, PcpOrder[]>()
    map.forEach((list, key) => {
      if (list.length > 1) {
        duplicates.set(key, list)
      }
    })
    return duplicates
  }, [orders])

  // Map de order_id -> op_number para salvaguarda no compileOrderMaterials
  const orderIdToOpNumberMap = useMemo(() => {
    const map: Record<string, string> = {}
    orders.forEach((o) => {
      if (o.op_number) {
        map[o.id] = o.op_number
      }
    })
    return map
  }, [orders])

  // Agrupamento corrido de OPs idêntico ao de /pcp/ordens para familiaridade do gestor
  const groupedOrders = useMemo(() => {
    const groups: {
      normalized_key: string
      order_number: string
      client_name: string
      op_type: string
      items: PcpOrder[]
    }[] = []

    const map = new Map<string, PcpOrder[]>()
    filteredOrders.forEach((op) => {
      const normalized = (op.order_number || '').replace(/[.\-\s]/g, '').replace(/^0+/, '') || '0'
      if (!map.has(normalized)) {
        map.set(normalized, [])
        groups.push({
          normalized_key: normalized,
          order_number: op.order_number,
          client_name: op.expand?.client_id?.name || op.client_name,
          op_type: op.op_type || 'Linha',
          items: map.get(normalized)!,
        })
      }
      map.get(normalized)!.push(op)
    })

    // Ordenar por prioridade
    groups.sort((a, b) => {
      const prioOf = (items: PcpOrder[]) => {
        if (items.some((o) => o.manual_priority === 1)) return 0
        if (items.some((o) => o.manual_priority === 2)) return 1
        return 2
      }
      return prioOf(a.items) - prioOf(b.items)
    })

    return groups
  }, [filteredOrders])

  // Map de order_id -> número legível
  const orderNumbersMap = useMemo(() => {
    const map: Record<string, string> = {}
    orders.forEach((o) => {
      map[o.id] = o.op_number ? `OP ${o.op_number}` : `Ped ${o.order_number}`
    })
    return map
  }, [orders])

  // Compilado calculado dos materiais com base nas OPs selecionadas
  const compiledData = useMemo(() => {
    return compileOrderMaterials({
      materials: selectedMaterials,
      orderNumbersMap,
      masterComponents,
      inventoryItems,
      orderIdToOpNumberMap,
    })
  }, [selectedMaterials, orderNumbersMap, masterComponents, inventoryItems, orderIdToOpNumberMap])

  // Lista de objetos PcpOrder selecionados
  // SALVAGUARDA: desduplica por op_number na lista exibida no cabeçalho/resumo do compilado
  const selectedOrdersList = useMemo(() => {
    const seenOps = new Set<string>()
    const result: PcpOrder[] = []
    orders.forEach((o) => {
      if (selectedOpIds.has(o.id)) {
        const normOp = (o.op_number || '').trim().toUpperCase()
        if (normOp) {
          if (!seenOps.has(normOp)) {
            seenOps.add(normOp)
            result.push(o)
          }
        } else {
          result.push(o)
        }
      }
    })
    return result
  }, [orders, selectedOpIds])

  // --------------------------------------------------------------------------
  // AÇÕES DE SELEÇÃO DE CHECKBOXES
  // --------------------------------------------------------------------------
  const toggleOrderSelection = (opId: string) => {
    const next = new Set(selectedOpIds)
    if (next.has(opId)) {
      next.delete(opId)
    } else {
      next.add(opId)
    }
    setSelectedOpIds(next)
    loadSelectedMaterials(Array.from(next))
  }

  const toggleGroupSelection = (items: PcpOrder[]) => {
    const next = new Set(selectedOpIds)
    const allSelected = items.every((i) => next.has(i.id))

    items.forEach((i) => {
      if (allSelected) {
        next.delete(i.id)
      } else {
        next.add(i.id)
      }
    })

    setSelectedOpIds(next)
    loadSelectedMaterials(Array.from(next))
  }

  // Atalho 1: Selecionar todas da fila
  const handleSelectAllFila = () => {
    const filaOrders = orders.filter((o) => o.status === 'Fila')
    const next = new Set(selectedOpIds)
    filaOrders.forEach((o) => next.add(o.id))

    setSelectedOpIds(next)
    loadSelectedMaterials(Array.from(next))
    toast({
      title: 'Fila Selecionada',
      description: `${filaOrders.length} OP(s) com status "Fila" foram adicionadas à programação.`,
    })
  }

  // Atalho 1.1: Selecionar todas as OPs atualmente visíveis pelo filtro
  const handleSelectAllFiltered = () => {
    const next = new Set(selectedOpIds)
    filteredOrders.forEach((o) => next.add(o.id))
    setSelectedOpIds(next)
    loadSelectedMaterials(Array.from(next))
    toast({
      title: 'OPs Filtradas Selecionadas',
      description: `${filteredOrders.length} OP(s) filtradas foram adicionadas à programação.`,
    })
  }

  // Atalho 2: Limpar seleção
  const handleClearSelection = () => {
    setSelectedOpIds(new Set())
    setSelectedMaterials([])
    toast({
      title: 'Seleção Limpa',
      description: 'Nenhuma OP selecionada na programação.',
    })
  }

  // Cores de status e cabeçalhos idênticos a /pcp/ordens
  const today = startOfDay(new Date())
  const getOrderColor = (op: PcpOrder) => {
    if (op.manual_priority === 2) return 'lime'
    if (op.status === 'Parado' || (op.bottleneck_reason && op.bottleneck_reason !== 'Nenhum'))
      return 'neon-orange'
    if (op.status === 'Concluído' || !op.delivery_date) return 'blue'
    const date = parseISO(op.delivery_date)
    if (isNaN(date.getTime())) return 'blue'
    const isDelayed = isBefore(startOfDay(date), today)
    if (isDelayed) return 'purple'
    if (isStageDelayed(op)) return 'yellow'
    return 'blue'
  }

  const getHeaderColor = (opType: string) => {
    switch (opType) {
      case 'Especial':
        return 'bg-slate-900 text-white'
      case 'Assistência':
        return 'bg-fuchsia-600 text-white'
      default:
        return 'bg-blue-600 text-white'
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-[1600px] mx-auto w-full">
      {/* NAVEGAÇÃO ENTRE ABAS DO PCP SE NÃO EMBARCADO */}
      {!embeddedInOrdersTab && (
        <div className="flex items-center justify-between border-b pb-2">
          <Tabs
            value="programacao"
            className="w-auto"
            onValueChange={(val) => {
              if (val === 'ordens') window.location.assign('/pcp/ordens')
              if (val === 'vinculos') window.location.assign('/pcp/vinculos-pdf')
            }}
          >
            <TabsList className="bg-slate-100 dark:bg-slate-800 p-1">
              <TabsTrigger value="ordens" className="gap-2 text-sm font-semibold">
                <span>📋</span> Ordens de Produção
              </TabsTrigger>
              <TabsTrigger
                value="programacao"
                className="gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300"
              >
                <span>📅</span> Programação
              </TabsTrigger>
              <TabsTrigger
                value="vinculos"
                className="gap-2 text-sm font-semibold text-purple-700 dark:text-purple-300"
              >
                <span>🔗</span> Vínculos de PDF
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* CABEÇALHO DA ABA PROGRAMAÇÃO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="size-7 text-blue-600" />
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">
              Programação de Produção
            </h1>
            <Badge
              variant="outline"
              className="text-xs bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300"
            >
              Modo Gestor — Apenas Leitura & Consolidação
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Selecione as Ordens de Produção da semana/lote para consolidar a lista de corte de
            tubos/barras/perfis e a necessidade física de componentes.
          </p>
        </div>

        {/* STATUS DA SELEÇÃO E ATALHOS RÁPIDOS */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs font-semibold px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 border">
            {selectedOrdersList.length}{' '}
            {selectedOrdersList.length !== selectedOpIds.size
              ? `OP(s) consolidadas (${selectedOpIds.size} marcadas)`
              : 'OP(s) selecionada(s)'}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAllFila}
            className="gap-1.5 text-xs h-9 border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950"
            title="Seleciona todas as OPs com status Fila"
          >
            <Sparkles className="size-3.5 text-blue-600" />
            Selecionar todas da fila
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAllFiltered}
            className="gap-1.5 text-xs h-9"
            title="Selecionar todas as OPs visíveis na lista abaixo"
          >
            <CheckSquare className="size-3.5" />
            Selecionar filtradas ({filteredOrders.length})
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearSelection}
            disabled={selectedOpIds.size === 0}
            className="gap-1.5 text-xs h-9 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950"
            title="Desmarcar todas as OPs"
          >
            <XCircle className="size-3.5" />
            Limpar seleção
          </Button>
        </div>
      </div>

      {/* BANNER DE ALERTA DE OPS DUPLICADAS (SALVAGUARDA VISUAL PARA O GESTOR) */}
      {duplicateOpsMap.size > 0 && (
        <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5 text-xs">
              <div className="font-bold text-sm text-amber-900 dark:text-amber-100 flex items-center gap-2">
                <span>Atenção: Foram detectados registros duplicados do mesmo número de OP</span>
                <Badge
                  variant="outline"
                  className="border-amber-400 text-amber-800 dark:text-amber-300 text-[10px]"
                >
                  Salvaguarda Ativa: contam apenas 1x na consolidação
                </Badge>
              </div>
              <p className="text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                Para proteger os cálculos do compilado de materiais, a consolidação agrupa e
                contabiliza cada OP apenas uma vez. Verifique abaixo os registros duplicados e suas
                respectivas datas de criação:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                {Array.from(duplicateOpsMap.entries()).map(([opNum, dupList]) => (
                  <div
                    key={opNum}
                    className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-amber-200 dark:border-amber-900 space-y-1"
                  >
                    <div className="font-mono font-bold text-amber-950 dark:text-amber-100 flex items-center justify-between">
                      <span>OP {opNum}</span>
                      <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
                        {dupList.length} registros
                      </Badge>
                    </div>
                    <div className="space-y-0.5 text-[11px] text-muted-foreground">
                      {dupList.map((d, idx) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between font-mono text-[10px]"
                        >
                          <span>
                            #{idx + 1}:{' '}
                            {d.created
                              ? format(parseISO(d.created), 'dd/MM/yyyy HH:mm:ss')
                              : 'Sem data'}
                          </span>
                          <span className="text-[9px] text-slate-500">ID: {d.id.slice(0, 6)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SEÇÃO 1: COMPILADO CONSOLIDADO (EXIBIDO COM DESTAQUE QUANDO HÁ OPS SELECIONADAS) */}
      {selectedOpIds.size > 0 ? (
        <CompiledMaterialsView
          selectedOrders={selectedOrdersList}
          profileItems={compiledData.profileItems}
          otherItems={compiledData.otherItems}
          totals={compiledData.totals}
          isLoadingMaterials={isLoadingMaterials}
        />
      ) : (
        <div className="rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-800 p-8 text-center bg-slate-50/50 dark:bg-slate-900/30">
          <div className="max-w-md mx-auto space-y-3">
            <div className="size-12 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center">
              <CheckSquare className="size-6" />
            </div>
            <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">
              Nenhuma OP selecionada para a programação
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Marque os checkboxes das OPs na lista corrida abaixo (ou clique em{' '}
              <strong>"Selecionar todas da fila"</strong>) para gerar o compilado automático de
              tubos, barras e componentes com comparação de saldo de estoque.
            </p>
            <Button
              onClick={handleSelectAllFila}
              size="sm"
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Sparkles className="size-4" />
              Selecionar OPs da fila agora
            </Button>
          </div>
        </div>
      )}

      {/* SEÇÃO 2: LISTA CORRIDA DAS OPS COM CHECKBOXES E FILTROS */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Lista de Ordens de Produção</span>
              <Badge variant="secondary" className="text-xs">
                {filteredOrders.length} disponível(is)
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">
              Selecione as OPs individualmente pelos checkboxes ou pelo cabeçalho do pedido.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={filaOnlyFilter ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilaOnlyFilter(!filaOnlyFilter)}
              className={cn(
                'text-xs h-8 gap-1.5',
                filaOnlyFilter && 'bg-blue-600 hover:bg-blue-700 text-white',
              )}
            >
              <span>📋</span>
              Apenas Fila
            </Button>

            <Button
              variant={prazoEspecialOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPrazoEspecialOnly(!prazoEspecialOnly)}
              className={cn(
                'text-xs h-8 gap-1.5',
                prazoEspecialOnly && 'bg-lime-500 hover:bg-lime-600 text-black border-lime-600',
              )}
            >
              <span>⚡</span>
              Prazo Especial
            </Button>

            <Button
              variant={promisedOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPromisedOnly(!promisedOnly)}
              className={cn(
                'text-xs h-8 gap-1.5',
                promisedOnly && 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700',
              )}
            >
              <span>🎯</span>
              Datas Prometidas
            </Button>
          </div>
        </div>

        {/* BARRA DE BUSCA E FILTROS IDÊNTICA A /pcp/ordens */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 bg-muted/40 p-3 rounded-lg border">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, OP ou produto..."
              className="pl-8 text-xs h-9 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <PcpFilters
            opType={opTypeFilter}
            setOpType={setOpTypeFilter}
            client={clientFilter}
            setClient={setClientFilter}
            clientType={clientTypeFilter}
            setClientType={setClientTypeFilter}
            deadline={deadlineFilter}
            setDeadline={setDeadlineFilter}
            status={statusFilter}
            setStatus={setStatusFilter}
            stage={stageFilter}
            setStage={setStageFilter}
          />
        </div>

        {/* TABELA DE OPS CORRIDA COM CHECKBOX POR LINHA */}
        <div className="rounded-md border bg-card overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-100/70 dark:bg-slate-800/60 text-xs">
              <TableRow>
                <TableHead className="w-[50px] text-center">
                  <span className="sr-only">Seleção</span>
                  <CheckSquare className="size-4 text-muted-foreground mx-auto" />
                </TableHead>
                <TableHead className="w-[150px]">Nº da OP</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="w-[80px]">Qtd</TableHead>
                <TableHead className="w-[140px]">Data de Entrega</TableHead>
                <TableHead className="w-[140px]">Status / Etapa</TableHead>
                <TableHead className="w-[130px]">Prazo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedOrders.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-10 text-muted-foreground text-xs"
                  >
                    Nenhuma OP encontrada com os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                groupedOrders.flatMap((group) => {
                  const allGroupSelected = group.items.every((it) => selectedOpIds.has(it.id))
                  const someGroupSelected = group.items.some((it) => selectedOpIds.has(it.id))

                  return [
                    // CABEÇALHO DO PEDIDO COM CHECKBOX DO GRUPO
                    <TableRow
                      key={`header-${group.normalized_key}`}
                      className={cn(
                        'hover:opacity-95 border-y transition-colors select-none cursor-pointer',
                        getHeaderColor(group.op_type),
                      )}
                      onClick={() => toggleGroupSelection(group.items)}
                    >
                      <TableCell
                        className="py-1.5 text-center"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleGroupSelection(group.items)
                        }}
                      >
                        <Checkbox
                          checked={
                            allGroupSelected ? true : someGroupSelected ? 'indeterminate' : false
                          }
                          onCheckedChange={() => toggleGroupSelection(group.items)}
                          aria-label={`Selecionar pedido ${group.order_number}`}
                          className="border-white data-[state=checked]:bg-white data-[state=checked]:text-blue-900"
                        />
                      </TableCell>
                      <TableCell colSpan={6} className="font-semibold text-xs py-1.5">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span>Pedido: {group.order_number}</span>
                          <span className="opacity-50">|</span>
                          <span>Cliente: {group.client_name}</span>
                          <span className="opacity-50">|</span>
                          <span className="text-[11px] opacity-90">
                            {group.items.length} OP(s) no lote
                          </span>
                          <Badge className="bg-white/20 text-white border-none hover:bg-white/30 text-[10px]">
                            {group.op_type}
                          </Badge>
                          <span className="text-[10px] underline ml-auto opacity-80 hover:opacity-100">
                            {allGroupSelected ? 'Desmarcar lote' : 'Selecionar lote completo'}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>,

                    // LINHAS INDIVIDUAIS DE CADA OP COM CHECKBOX
                    ...group.items.map((op) => {
                      const isSelected = selectedOpIds.has(op.id)
                      const color = getOrderColor(op)
                      const normOp = (op.op_number || '').trim().toUpperCase()
                      const dupGroup = normOp ? duplicateOpsMap.get(normOp) : undefined
                      const isDuplicate = !!dupGroup && dupGroup.length > 1

                      return (
                        <TableRow
                          key={op.id}
                          className={cn(
                            'cursor-pointer transition-colors text-xs select-none',
                            isSelected && 'ring-2 ring-blue-500 font-medium',
                            isDuplicate && 'border-l-4 border-l-amber-500',
                            color === 'lime' && 'bg-lime-400 text-black hover:bg-lime-500',
                            color === 'neon-orange' &&
                              'bg-orange-500 text-white hover:bg-orange-600 dark:bg-orange-600 dark:hover:bg-orange-700',
                            color === 'yellow' &&
                              'bg-yellow-400 text-slate-900 hover:bg-yellow-500 dark:bg-yellow-500 dark:hover:bg-yellow-600',
                            (color === 'purple' || color === 'blue') &&
                              (isSelected
                                ? 'bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                                : 'bg-white dark:bg-slate-900 hover:bg-muted/40'),
                          )}
                          onClick={() => toggleOrderSelection(op.id)}
                        >
                          {/* CHECKBOX POR LINHA */}
                          <TableCell
                            className="py-1 text-center"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleOrderSelection(op.id)
                            }}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleOrderSelection(op.id)}
                              aria-label={`Selecionar OP ${op.op_number || op.order_number}`}
                              className={cn(
                                color === 'lime' || color === 'yellow'
                                  ? 'border-slate-900'
                                  : color === 'neon-orange'
                                    ? 'border-white'
                                    : 'border-slate-400',
                              )}
                            />
                          </TableCell>

                          {/* Nº DA OP COM AVISO DE DUPLICATA E DATAS */}
                          <TableCell className="py-1 pl-2 font-medium">
                            <div className="flex flex-col items-start gap-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {op.manual_priority === 2 && <span title="Prazo Especial">⚡</span>}
                                <span className="font-mono font-bold">
                                  {op.op_number ? `OP ${op.op_number}` : '-'}
                                </span>
                                {isDuplicate && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] px-1.5 py-0 border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 font-semibold gap-1 cursor-help"
                                      >
                                        <AlertTriangle className="size-3 text-amber-600" />
                                        Duplicada ({dupGroup!.length}x)
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs space-y-1">
                                      <p className="font-bold text-amber-600">
                                        OP duplicada no banco: mesmo número OP {op.op_number}
                                      </p>
                                      <p className="text-[11px]">
                                        Salvaguarda ativa: na consolidação de materiais conta apenas
                                        UMA vez.
                                      </p>
                                      <div className="pt-1 border-t space-y-0.5">
                                        <p className="font-semibold text-[10px]">
                                          Datas de criação dos registros:
                                        </p>
                                        {dupGroup!.map((d, i) => (
                                          <div
                                            key={d.id}
                                            className="text-[10px] font-mono flex justify-between gap-2"
                                          >
                                            <span>
                                              #{i + 1}:{' '}
                                              {d.created
                                                ? format(parseISO(d.created), 'dd/MM/yyyy HH:mm:ss')
                                                : '-'}
                                            </span>
                                            {d.id === op.id && (
                                              <span className="text-blue-500 font-bold">
                                                (este registro)
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                              {isDuplicate && (
                                <span className="text-[10px] text-amber-800 dark:text-amber-300 font-mono">
                                  Criado em:{' '}
                                  {op.created
                                    ? format(parseISO(op.created), 'dd/MM/yyyy HH:mm:ss')
                                    : '-'}
                                </span>
                              )}
                            </div>
                          </TableCell>

                          {/* PRODUTO & OBSERVAÇÕES */}
                          <TableCell className="py-1">
                            <div className="flex flex-col items-start gap-0.5">
                              <span className="font-medium">
                                {op.op_type === 'Assistência'
                                  ? op.manual_product_name
                                  : op.op_type === 'Especial'
                                    ? op.manual_product_name || 'Produto Especial'
                                    : op.expand?.product_id?.name || '-'}
                              </span>
                              {(observations[op.id] || []).length > 0 && (
                                <div className="flex flex-col gap-0.5 mt-0.5 w-full max-w-sm">
                                  {(observations[op.id] || []).map((obs) => (
                                    <span
                                      key={obs.id}
                                      className="text-[10px] whitespace-pre-wrap leading-tight text-muted-foreground border-l-2 pl-1 border-slate-300 dark:border-slate-700"
                                    >
                                      <strong>{obs.sector}:</strong> {obs.content}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>

                          {/* QUANTIDADE */}
                          <TableCell className="py-1 font-mono font-bold">{op.quantity}</TableCell>

                          {/* DATA DE ENTREGA & PROMETIDA */}
                          <TableCell className="py-1">
                            <div className="flex flex-col gap-0.5 items-start">
                              <span className="font-mono">
                                {op.delivery_date && !isNaN(parseISO(op.delivery_date).getTime())
                                  ? format(parseISO(op.delivery_date), 'dd/MM/yyyy')
                                  : '-'}
                              </span>
                              {op.promised_date && (
                                <PromisedDateBadge
                                  promisedDate={op.promised_date}
                                  status={op.status}
                                  size="sm"
                                />
                              )}
                            </div>
                          </TableCell>

                          {/* STATUS & ETAPA (SOMENTE LEITURA PARA O GESTOR) */}
                          <TableCell className="py-1">
                            <div className="flex flex-col gap-0.5">
                              <Badge
                                variant="secondary"
                                className="w-fit text-[10px] font-semibold py-0 px-1.5"
                              >
                                {op.status}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">{op.stage}</span>
                            </div>
                          </TableCell>

                          {/* PRAZO */}
                          <TableCell className="py-1 font-medium whitespace-nowrap">
                            {formatDeadline(op.delivery_date, op.status)}
                          </TableCell>
                        </TableRow>
                      )
                    }),
                  ]
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
