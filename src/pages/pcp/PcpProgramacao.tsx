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
  Lock,
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
import { SendToSeparationModal } from './components/SendToSeparationModal'
import { SeparationRoundsManager } from './components/SeparationRoundsManager'
import { compileOrderMaterials } from '@/services/pcp-programacao'
import {
  PcpProgramacaoRecord,
  getProgramacoes,
  closeProgramacao,
} from '@/services/pcp-programacoes'
import { ProgramacaoVigenteCard } from './components/ProgramacaoVigenteCard'
import { ProgramacaoDetailModal } from './components/ProgramacaoDetailModal'
import { ProgramacaoHistorySection } from './components/ProgramacaoHistorySection'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
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

  // Controle de logs para regras de OPs programáveis (apenas Fila + Separação + sem logs)
  const [orderIdsWithLogs, setOrderIdsWithLogs] = useState<Set<string>>(new Set())
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)
  const [showInExecutionConsultation, setShowInExecutionConsultation] = useState(false)

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
  const [sendSeparationOpen, setSendSeparationOpen] = useState(false)

  // Estados do conceito de Programação oficial
  const [programacoes, setProgramacoes] = useState<PcpProgramacaoRecord[]>([])
  const [selectedProgramacaoDetail, setSelectedProgramacaoDetail] =
    useState<PcpProgramacaoRecord | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [programacaoToClose, setProgramacaoToClose] = useState<PcpProgramacaoRecord | null>(null)
  const [isClosingProgramacao, setIsClosingProgramacao] = useState(false)

  const { toast } = useToast()

  const scrollToCompiled = () => {
    const el = document.getElementById('secao-compilado-materiais')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Carrega lista oficial de programações
  const loadProgramacoes = async () => {
    try {
      const list = await getProgramacoes()
      setProgramacoes(list)
    } catch (err) {
      console.error('Erro ao listar programações:', err)
    }
  }

  // Carrega dados gerais de apoio (somente leitura)
  const loadData = async () => {
    loadProgramacoes()
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

  // Carrega batch de pcp_order_logs para verificar se as OPs já tiveram qualquer atividade
  useEffect(() => {
    if (orders.length === 0) {
      setOrderIdsWithLogs(new Set())
      return
    }

    let isMounted = true
    const fetchOrderLogs = async () => {
      setIsLoadingLogs(true)
      try {
        const orderIds = orders.map((o) => o.id)
        const chunkSize = 25
        const idsWithLogs = new Set<string>()

        for (let i = 0; i < orderIds.length; i += chunkSize) {
          const chunk = orderIds.slice(i, i + chunkSize)
          const filterStr = chunk.map((id) => `order_id = "${id}"`).join(' || ')
          const batch = await pb.collection('pcp_order_logs').getFullList<{ order_id: string }>({
            filter: filterStr,
            fields: 'order_id',
          })
          batch.forEach((log) => {
            if (log.order_id) idsWithLogs.add(log.order_id)
          })
        }

        if (isMounted) {
          setOrderIdsWithLogs(idsWithLogs)
        }
      } catch (err) {
        console.error('Erro ao verificar logs das OPs:', err)
      } finally {
        if (isMounted) {
          setIsLoadingLogs(false)
        }
      }
    }

    fetchOrderLogs()
    return () => {
      isMounted = false
    }
  }, [orders])

  useRealtime('pcp_orders', () => loadData())
  useRealtime('inventory', () => loadData())
  useRealtime('pcp_order_logs', () => {
    loadData()
  })
  useRealtime('pcp_order_materials', () => {
    if (selectedOpIds.size > 0) {
      loadSelectedMaterials(Array.from(selectedOpIds))
    }
  })
  useRealtime('pcp_programacoes', () => {
    loadProgramacoes()
  })
  useRealtime('material_separations', () => {
    loadProgramacoes()
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

  // Regra de elegibilidade para programação:
  // "apenas aquelas que estão na fila da Separação, que não tiveram nenhuma atividade feita ainda"
  // status === 'Fila' && stage === 'Separação' && sem registro em pcp_order_logs
  const isOrderSelectable = (op: PcpOrder) => {
    return op.status === 'Fila' && op.stage === 'Separação' && !orderIdsWithLogs.has(op.id)
  }

  // Divisão entre OPs selecionáveis (programáveis) e em execução / com atividade
  const { selectableOrders, inExecutionOrders } = useMemo(() => {
    const selectable: PcpOrder[] = []
    const inExecution: PcpOrder[] = []

    orders.forEach((op) => {
      if (isOrderSelectable(op)) {
        selectable.push(op)
      } else {
        inExecution.push(op)
      }
    })

    return { selectableOrders: selectable, inExecutionOrders: inExecution }
  }, [orders, orderIdsWithLogs])

  // Conjunto de OPs a serem listadas na tabela:
  // Se showInExecutionConsultation for falso (padrão): lista apenas as OPs selecionáveis/programáveis.
  // Se o usuário ativar a visualização de consulta de OPs em execução: inclui ambas (ou apenas consulta).
  const displayedOrdersSource = useMemo(() => {
    if (showInExecutionConsultation) {
      return orders
    }
    return selectableOrders
  }, [orders, selectableOrders, showInExecutionConsultation])

  // Filtragem das OPs para exibição na lista corrida (aplica os filtros existentes sobre a lista)
  const filteredOrders = useMemo(() => {
    return displayedOrdersSource.filter((op) => {
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
    displayedOrdersSource,
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
      products,
      orders,
    })
  }, [
    selectedMaterials,
    orderNumbersMap,
    masterComponents,
    inventoryItems,
    orderIdToOpNumberMap,
    products,
    orders,
  ])

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
  // Apenas OPs elegíveis (isOrderSelectable) podem ser marcadas/programadas
  // --------------------------------------------------------------------------
  const toggleOrderSelection = (op: PcpOrder) => {
    if (!isOrderSelectable(op)) {
      toast({
        title: 'OP não programável',
        description: 'Esta OP já está em execução ou possui atividade anterior registrada.',
        variant: 'destructive',
      })
      return
    }

    const next = new Set(selectedOpIds)
    if (next.has(op.id)) {
      next.delete(op.id)
    } else {
      next.add(op.id)
    }
    setSelectedOpIds(next)
    loadSelectedMaterials(Array.from(next))
  }

  const toggleGroupSelection = (items: PcpOrder[]) => {
    // Considera apenas as OPs que são selecionáveis no lote
    const selectableInGroup = items.filter(isOrderSelectable)
    if (selectableInGroup.length === 0) {
      toast({
        title: 'Nenhuma OP programável no lote',
        description: 'Todas as OPs deste lote já estão em execução ou possuem atividades.',
      })
      return
    }

    const next = new Set(selectedOpIds)
    const allSelected = selectableInGroup.every((i) => next.has(i.id))

    selectableInGroup.forEach((i) => {
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
  // Requisito: deve considerar apenas a fila filtrada pela regra (Separação + sem logs)
  const handleSelectAllFila = () => {
    const eligibleFilaOrders = selectableOrders
    if (eligibleFilaOrders.length === 0) {
      toast({
        title: 'Fila vazia',
        description: 'Não há OPs na fila de Separação sem atividades no momento.',
      })
      return
    }

    const next = new Set(selectedOpIds)
    eligibleFilaOrders.forEach((o) => next.add(o.id))

    setSelectedOpIds(next)
    loadSelectedMaterials(Array.from(next))
    toast({
      title: 'Fila de Separação Selecionada',
      description: `${eligibleFilaOrders.length} OP(s) aptas para programação foram adicionadas.`,
    })
  }

  // Atalho 1.1: Selecionar todas as OPs atualmente visíveis pelo filtro (apenas as programáveis)
  const handleSelectAllFiltered = () => {
    const eligibleFiltered = filteredOrders.filter(isOrderSelectable)
    if (eligibleFiltered.length === 0) {
      toast({
        title: 'Nenhuma OP programável visível',
        description:
          'As OPs visíveis já estão em execução ou não atendem aos critérios de seleção.',
      })
      return
    }

    const next = new Set(selectedOpIds)
    eligibleFiltered.forEach((o) => next.add(o.id))
    setSelectedOpIds(next)
    loadSelectedMaterials(Array.from(next))
    toast({
      title: 'OPs Filtradas Selecionadas',
      description: `${eligibleFiltered.length} OP(s) programáveis foram adicionadas.`,
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

  // Separação entre Programações em produção e encerradas
  const programacoesEmProducao = useMemo(() => {
    return programacoes.filter((p) => p.status === 'Em produção')
  }, [programacoes])

  const programacoesEncerradas = useMemo(() => {
    return programacoes.filter((p) => p.status === 'Encerrada')
  }, [programacoes])

  const handleOpenDetailModal = (prog: PcpProgramacaoRecord) => {
    setSelectedProgramacaoDetail(prog)
    setDetailModalOpen(true)
  }

  // Confirmação explícita para encerramento de programação (Requisito 2 & 7)
  const handleConfirmCloseProgramacao = async () => {
    if (!programacaoToClose) return
    try {
      setIsClosingProgramacao(true)
      const updated = await closeProgramacao(programacaoToClose.id)
      toast({
        title: 'Programação Encerrada',
        description: `${updated.name} foi arquivada no Histórico de Programações.`,
      })
      setProgramacaoToClose(null)
      if (selectedProgramacaoDetail?.id === programacaoToClose.id) {
        setDetailModalOpen(false)
        setSelectedProgramacaoDetail(null)
      }
      loadProgramacoes()
    } catch (err) {
      console.error('Erro ao encerrar programação:', err)
      toast({
        title: 'Erro ao encerrar',
        description: 'Não foi possível encerrar a programação.',
        variant: 'destructive',
      })
    } finally {
      setIsClosingProgramacao(false)
    }
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

      {/* (3) SEÇÃO CARTÃO FIXO NO TOPO: PROGRAMAÇÃO VIGENTE E DEMAIS EM PRODUÇÃO */}
      <ProgramacaoVigenteCard
        programacoesEmProducao={programacoesEmProducao}
        onOpenDetails={handleOpenDetailModal}
        onCloseProgramacao={(prog) => setProgramacaoToClose(prog)}
      />

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
            title="Selecionar todas as OPs aptas da fila de Separação (sem atividades anteriores)"
          >
            <Sparkles className="size-3.5 text-blue-600" />
            Selecionar fila de Separação ({selectableOrders.length})
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAllFiltered}
            className="gap-1.5 text-xs h-9"
            title="Selecionar todas as OPs programáveis visíveis na lista abaixo"
          >
            <CheckSquare className="size-3.5" />
            Selecionar filtradas ({filteredOrders.filter(isOrderSelectable).length})
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

      {/* AVISO DISCRETO DE OPS JÁ EM EXECUÇÃO / COM ATIVIDADE */}
      {inExecutionOrders.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 border text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Info className="size-4 text-slate-500 shrink-0" />
            <span>
              <strong className="text-foreground">{inExecutionOrders.length} OP(s)</strong> já em
              execução ou com atividade registrada — não programáveis.
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowInExecutionConsultation(!showInExecutionConsultation)}
            className="h-7 text-xs px-2.5 hover:bg-background text-slate-700 dark:text-slate-300 font-medium"
          >
            {showInExecutionConsultation
              ? 'Ocultar OPs em execução (apenas programáveis)'
              : 'Visualizar OPs em execução (apenas consulta)'}
          </Button>
        </div>
      )}

      {/* (1) LISTA DE ORDENS DE PRODUÇÃO (ACIMA) COM FILTROS E CHECKBOXES */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Lista de Ordens de Produção</span>
              <Badge variant="secondary" className="text-xs">
                {filteredOrders.length}{' '}
                {showInExecutionConsultation ? 'exibida(s)' : 'programável(is)'}
              </Badge>
              {isLoadingLogs && (
                <span className="text-[11px] text-muted-foreground animate-pulse font-normal">
                  (verificando logs...)
                </span>
              )}
            </h2>
            <p className="text-xs text-muted-foreground">
              {showInExecutionConsultation
                ? 'Exibindo OPs da fábrica. Apenas OPs na fila de Separação sem atividades possuem checkbox para seleção/programação.'
                : 'Apenas OPs na fila de Separação que ainda não tiveram nenhuma atividade podem ser selecionadas e programadas.'}
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
                  const selectableItems = group.items.filter(isOrderSelectable)
                  const hasSelectable = selectableItems.length > 0
                  const allSelectableChosen =
                    hasSelectable && selectableItems.every((it) => selectedOpIds.has(it.id))
                  const someSelectableChosen =
                    hasSelectable && selectableItems.some((it) => selectedOpIds.has(it.id))

                  return [
                    // CABEÇALHO DO PEDIDO COM CHECKBOX DO GRUPO (APENAS SE HOUVER OPS SELECIONÁVEIS)
                    <TableRow
                      key={`header-${group.normalized_key}`}
                      className={cn(
                        'border-y transition-colors select-none',
                        hasSelectable ? 'hover:opacity-95 cursor-pointer' : 'opacity-90',
                        getHeaderColor(group.op_type),
                      )}
                      onClick={() => {
                        if (hasSelectable) toggleGroupSelection(group.items)
                      }}
                    >
                      <TableCell
                        className="py-1.5 text-center"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (hasSelectable) toggleGroupSelection(group.items)
                        }}
                      >
                        {hasSelectable ? (
                          <Checkbox
                            checked={
                              allSelectableChosen
                                ? true
                                : someSelectableChosen
                                  ? 'indeterminate'
                                  : false
                            }
                            onCheckedChange={() => toggleGroupSelection(group.items)}
                            aria-label={`Selecionar OPs programáveis do pedido ${group.order_number}`}
                            className="border-white data-[state=checked]:bg-white data-[state=checked]:text-blue-900"
                          />
                        ) : (
                          <span
                            className="text-[10px] text-white/60 font-mono"
                            title="Apenas consulta"
                          >
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell colSpan={6} className="font-semibold text-xs py-1.5">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span>Pedido: {group.order_number}</span>
                          <span className="opacity-50">|</span>
                          <span>Cliente: {group.client_name}</span>
                          <span className="opacity-50">|</span>
                          <span className="text-[11px] opacity-90">
                            {group.items.length} OP(s) no lote
                            {hasSelectable && selectableItems.length !== group.items.length && (
                              <span className="ml-1 opacity-75">
                                ({selectableItems.length} programável)
                              </span>
                            )}
                          </span>
                          <Badge className="bg-white/20 text-white border-none hover:bg-white/30 text-[10px]">
                            {group.op_type}
                          </Badge>
                          {hasSelectable ? (
                            <span className="text-[10px] underline ml-auto opacity-80 hover:opacity-100">
                              {allSelectableChosen
                                ? 'Desmarcar lote'
                                : `Selecionar programáveis (${selectableItems.length})`}
                            </span>
                          ) : (
                            <span className="text-[10px] ml-auto opacity-75 italic">
                              Em execução / apenas consulta
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>,

                    // LINHAS INDIVIDUAIS DE CADA OP
                    ...group.items.map((op) => {
                      const selectable = isOrderSelectable(op)
                      const isSelected = selectedOpIds.has(op.id)
                      const color = getOrderColor(op)
                      const normOp = (op.op_number || '').trim().toUpperCase()
                      const dupGroup = normOp ? duplicateOpsMap.get(normOp) : undefined
                      const isDuplicate = !!dupGroup && dupGroup.length > 1

                      return (
                        <TableRow
                          key={op.id}
                          className={cn(
                            'transition-colors text-xs select-none',
                            selectable ? 'cursor-pointer' : 'cursor-default opacity-85',
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
                          onClick={() => {
                            if (selectable) toggleOrderSelection(op)
                          }}
                        >
                          {/* CHECKBOX POR LINHA (OU TRAÇO/AVISO SE NÃO SELECIONÁVEL) */}
                          <TableCell
                            className="py-1 text-center"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (selectable) toggleOrderSelection(op)
                            }}
                          >
                            {selectable ? (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleOrderSelection(op)}
                                aria-label={`Selecionar OP ${op.op_number || op.order_number}`}
                                className={cn(
                                  color === 'lime' || color === 'yellow'
                                    ? 'border-slate-900'
                                    : color === 'neon-orange'
                                      ? 'border-white'
                                      : 'border-slate-400',
                                )}
                              />
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground cursor-help">
                                    <span className="text-xs font-mono font-bold text-slate-400">
                                      —
                                    </span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs max-w-xs">
                                  <p className="font-semibold">Não programável</p>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {op.status !== 'Fila'
                                      ? `Status atual: ${op.status} (já em execução)`
                                      : op.stage !== 'Separação'
                                        ? `Etapa atual: ${op.stage} (fora da Separação)`
                                        : 'Esta OP já possui atividades anteriores registradas em log.'}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            )}
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

      {/* (1) SEÇÃO DO COMPILADO CONSOLIDADO (ABAIXO DA LISTA DE OPS) */}
      <div id="secao-compilado-materiais" className="scroll-mt-20 pt-2">
        {selectedOpIds.size > 0 ? (
          <div className="space-y-6">
            <CompiledMaterialsView
              selectedOrders={selectedOrdersList}
              profileItems={compiledData.profileItems}
              otherItems={compiledData.otherItems}
              totals={compiledData.totals}
              isLoadingMaterials={isLoadingMaterials}
              onSendToSeparation={() => setSendSeparationOpen(true)}
            />
          </div>
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
                Marque os checkboxes das OPs na lista acima (ou clique em{' '}
                <strong>"Selecionar fila de Separação"</strong>) para gerar o compilado automático
                de tubos, barras e componentes com comparação de saldo de estoque.
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
      </div>

      {/* (5) HISTÓRICO DE PROGRAMAÇÕES ENCERRADAS (SOMENTE LEITURA COM PEDIDOS, OPS E SEPARAÇÃO) */}
      <div className="pt-4 border-t">
        <ProgramacaoHistorySection
          programacoesEncerradas={programacoesEncerradas}
          onOpenDetails={handleOpenDetailModal}
          onRefresh={loadProgramacoes}
        />
      </div>

      {/* SEÇÃO DE ACOMPANHAMENTO DE RODADAS DE SEPARAÇÃO (STATUS PARA O GESTOR) */}
      <div className="pt-4 border-t">
        <SeparationRoundsManager />
      </div>

      {/* (4) MODAL DE DETALHES DA PROGRAMAÇÃO COM COMPONENTES RECOLHIDOS POR PADRÃO */}
      <ProgramacaoDetailModal
        programacao={selectedProgramacaoDetail}
        open={detailModalOpen}
        onOpenChange={(open) => {
          setDetailModalOpen(open)
          if (!open) setSelectedProgramacaoDetail(null)
        }}
        onCloseProgramacao={(prog) => {
          setProgramacaoToClose(prog)
        }}
      />

      {/* MODAL DE CONFIRMAÇÃO EXPLÍCITA PARA ENCERRAR PROGRAMAÇÃO (REQUISITOS 2 & 7) */}
      {programacaoToClose && (
        <Dialog
          open={!!programacaoToClose}
          onOpenChange={(open) => !open && setProgramacaoToClose(null)}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg flex items-center gap-2 text-rose-600">
                <Lock className="size-5" />
                Confirmar Encerramento de Programação
              </DialogTitle>
              <DialogDescription className="text-xs">
                Ação manual e explícita do gestor. Nenhuma programação é encerrada automaticamente.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-muted/50 rounded-lg border space-y-1">
                <span className="font-bold text-foreground block text-sm">
                  {programacaoToClose.name}
                </span>
                <span className="text-muted-foreground block">
                  Contém {programacaoToClose.orders_count || 0} pedidos,{' '}
                  {programacaoToClose.ops_count || 0} OPs e {programacaoToClose.items_count || 0}{' '}
                  itens consolidados.
                </span>
              </div>

              <p className="text-muted-foreground">
                Ao encerrar, a programação mudará o status para <strong>Encerrada</strong> e será
                movida para o <strong>Histórico de Programações</strong> em modo de consulta somente
                leitura.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setProgramacaoToClose(null)}
                disabled={isClosingProgramacao}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirmCloseProgramacao}
                disabled={isClosingProgramacao}
                className="gap-1.5 font-bold"
              >
                {isClosingProgramacao ? 'Encerrando...' : 'Confirmar Encerramento'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL DE ENVIO PARA SEPARAÇÃO (GRAVA TAMBÉM A PROGRAMAÇÃO OFICIAL) */}
      <SendToSeparationModal
        open={sendSeparationOpen}
        onOpenChange={setSendSeparationOpen}
        compiledItems={[...compiledData.profileItems, ...compiledData.otherItems]}
        selectedOps={selectedOrdersList.map((o) => o.op_number || o.order_number).filter(Boolean)}
        selectedOrderIds={Array.from(selectedOpIds)}
        selectedOrders={selectedOrdersList}
        onSuccess={() => {
          loadProgramacoes()
          toast({
            title: 'Programação Oficial Criada',
            description:
              'Programação destacada no topo como Vigente e rodada enviada para o Operador.',
          })
        }}
      />

      {/* BARRA FIXA DISCRETA TIPO 'X OP(s) selecionada(s) — ver compilado' */}
      {selectedOpIds.size > 0 && (
        <aside
          role="region"
          aria-label="Atalho para o compilado consolidado"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 print:hidden transition-all duration-300 ease-out animate-in fade-in slide-in-from-bottom-4"
        >
          <div className="flex items-center gap-3 bg-slate-900/95 text-white shadow-2xl backdrop-blur-md px-4 py-2.5 rounded-full border border-slate-700/80 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-medium">
                <strong className="font-bold text-emerald-400">{selectedOrdersList.length}</strong>{' '}
                OP{selectedOrdersList.length !== 1 ? 's' : ''} selecionada
                {selectedOrdersList.length !== 1 ? 's' : ''}
              </span>
            </div>

            <span className="text-slate-500">|</span>

            <Button
              size="sm"
              onClick={scrollToCompiled}
              className="h-7 px-3 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-full gap-1.5 shadow font-semibold"
            >
              <span>Ver compilado</span>
              <ChevronRight className="size-3.5 rotate-90" />
            </Button>

            <button
              type="button"
              onClick={handleClearSelection}
              className="text-[11px] text-slate-400 hover:text-rose-400 underline ml-1 cursor-pointer transition-colors"
              title="Desmarcar todas"
            >
              Limpar
            </button>
          </div>
        </aside>
      )}
    </div>
  )
}
