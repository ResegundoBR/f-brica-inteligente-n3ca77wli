import { Fragment, useEffect, useState, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { PcpOrder, Product, Client, PcpOrderObservation } from '@/types'
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
import { format, parseISO, isBefore, startOfDay, differenceInDays } from 'date-fns'
import { Paperclip, Clock, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatDeadline, filterByDeadline } from '@/lib/pcp-utils'
import { PcpOrderForm } from './components/PcpOrderForm'
import { PcpOrderDetails } from './components/PcpOrderDetails'
import { PcpFilters } from './components/PcpFilters'

export default function PcpOrders() {
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [observations, setObservations] = useState<Record<string, PcpOrderObservation[]>>({})
  const [isOpen, setIsOpen] = useState(false)
  const [opTypeFilter, setOpTypeFilter] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [deadlineFilter, setDeadlineFilter] = useState('all')
  const [selectedOp, setSelectedOp] = useState<PcpOrder | null>(null)
  const [search, setSearch] = useState('')
  const { toast } = useToast()

  const loadData = async () => {
    Promise.allSettled([
      pb
        .collection('pcp_orders')
        .getFullList<PcpOrder>({ sort: '-created', expand: 'product_id,client_id' })
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
        .catch(() => {
          toast({
            title: 'Erro',
            description: 'Não foi possível carregar os produtos.',
            variant: 'destructive',
          })
        }),
      pb
        .collection('clients')
        .getFullList<Client>({ sort: 'name' })
        .then(setClients)
        .catch(() => {
          toast({
            title: 'Erro',
            description: 'Não foi possível carregar os clientes.',
            variant: 'destructive',
          })
        }),
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
        .catch(() => {
          toast({
            title: 'Erro',
            description: 'Não foi possível carregar as observações.',
            variant: 'destructive',
          })
        }),
    ])
  }

  useEffect(() => {
    loadData()
  }, [])
  useRealtime('pcp_orders', () => loadData())
  useRealtime('pcp_order_observations', () => loadData())

  const filteredOrders = useMemo(() => {
    if (!search) return orders
    const q = search.toLowerCase()
    return orders.filter((op) => {
      const clientName = (op.expand?.client_id?.name || op.client_name || '').toLowerCase()
      const productName = (
        op.op_type === 'Assistência'
          ? op.manual_product_name || ''
          : op.expand?.product_id?.name || ''
      ).toLowerCase()
      const orderNum = (op.order_number || '').toLowerCase()
      const opNum = (op.op_number || '').toLowerCase()
      const obsSector = (op.observation_sector || '').toLowerCase()

      return (
        clientName.includes(q) ||
        productName.includes(q) ||
        orderNum.includes(q) ||
        opNum.includes(q) ||
        obsSector.includes(q)
      )
    })
  }, [orders, search])

  const groupedOrders = useMemo(() => {
    const filteredByCustom = filteredOrders.filter((op) => {
      if (opTypeFilter !== 'all' && op.op_type !== opTypeFilter) return false
      if (clientFilter !== 'all' && op.client_id !== clientFilter) return false
      if (!filterByDeadline(op.delivery_date, deadlineFilter)) return false
      return true
    })

    const groups: {
      order_number: string
      client_name: string
      op_type: string
      items: PcpOrder[]
    }[] = []
    const map = new Map<string, PcpOrder[]>()
    filteredByCustom.forEach((op) => {
      if (!map.has(op.order_number)) {
        map.set(op.order_number, [])
        groups.push({
          order_number: op.order_number,
          client_name: op.expand?.client_id?.name || op.client_name,
          op_type: op.op_type,
          items: map.get(op.order_number)!,
        })
      }
      map.get(op.order_number)!.push(op)
    })
    return groups
  }, [orders])

  const today = startOfDay(new Date())
  const getOrderColor = (op: PcpOrder) => {
    if (op.status === 'Parado' || (op.bottleneck_reason && op.bottleneck_reason !== 'Nenhum'))
      return 'red'

    if (op.status === 'Concluído' || !op.delivery_date) return 'blue'

    const date = parseISO(op.delivery_date)
    if (isNaN(date.getTime())) return 'blue'

    const isDelayed = isBefore(startOfDay(date), today)
    if (isDelayed) return 'purple'

    return 'blue'
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ordens de Produção</h1>
          <p className="text-muted-foreground">Gerencie as OPs e integre documentos externos.</p>
        </div>
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente ou OP..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <PcpFilters
            opType={opTypeFilter}
            setOpType={setOpTypeFilter}
            client={clientFilter}
            setClient={setClientFilter}
            deadline={deadlineFilter}
            setDeadline={setDeadlineFilter}
          />
          <PcpOrderForm
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            clients={clients}
            products={products}
            onSuccess={loadData}
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº da OP</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Qtd</TableHead>
              <TableHead>Data de Entrega</TableHead>
              <TableHead>Status / Etapa</TableHead>
              <TableHead>Prazo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Nenhuma OP encontrada.
                </TableCell>
              </TableRow>
            ) : (
              groupedOrders.map((group) => (
                <Fragment key={group.order_number}>
                  <TableRow
                    className={cn(
                      'hover:opacity-90 border-y transition-colors',
                      group.op_type === 'Assistência'
                        ? 'bg-fuchsia-600 text-white'
                        : group.op_type === 'Especial'
                          ? 'bg-slate-900 text-white'
                          : 'bg-blue-600 text-white',
                    )}
                  >
                    <TableCell colSpan={6} className="font-semibold text-sm py-1">
                      <div className="flex items-center gap-4">
                        <span>Pedido: {group.order_number}</span>
                        <span className="opacity-50">|</span>
                        <span>Cliente: {group.client_name}</span>
                        <Badge
                          variant="outline"
                          className="ml-auto border-white/40 text-white hover:bg-white/20 bg-white/10"
                        >
                          {group.op_type}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                  {group.items.map((op) => (
                    <TableRow
                      key={op.id}
                      className={cn(
                        'cursor-pointer hover:bg-muted/30 transition-colors',
                        getOrderColor(op) === 'red' &&
                          'bg-red-50/50 hover:bg-red-100/50 dark:bg-red-950/20 dark:hover:bg-red-900/30',
                        getOrderColor(op) === 'purple' &&
                          'bg-purple-50/50 hover:bg-purple-100/50 dark:bg-purple-950/20 dark:hover:bg-purple-900/30',
                        getOrderColor(op) === 'blue' &&
                          'bg-blue-50/50 hover:bg-blue-100/50 dark:bg-blue-950/20 dark:hover:bg-blue-900/30',
                      )}
                      onClick={() => setSelectedOp(op)}
                    >
                      <TableCell className="py-1 pl-6 font-medium">{op.op_number || '-'}</TableCell>
                      <TableCell className="py-1">
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-sm">
                            {op.op_type === 'Assistência'
                              ? op.manual_product_name
                              : op.op_type === 'Especial'
                                ? 'Produto Especial'
                                : op.expand?.product_id?.name || '-'}
                          </span>
                          {(observations[op.id] || []).length > 0 && (
                            <div className="flex flex-col gap-1 mt-1 w-full max-w-sm">
                              {(observations[op.id] || []).map((obs) => (
                                <span
                                  key={obs.id}
                                  className="text-[10px] text-muted-foreground whitespace-pre-wrap leading-tight border-l-2 pl-2 border-slate-200 dark:border-slate-800"
                                >
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    {' '}
                                    {obs.sector}:
                                  </span>{' '}
                                  {obs.content}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-1">{op.quantity}</TableCell>
                      <TableCell className="py-1">
                        <div className="flex items-center gap-2">
                          {op.delivery_date && !isNaN(parseISO(op.delivery_date).getTime())
                            ? format(parseISO(op.delivery_date), 'dd/MM/yyyy')
                            : '-'}
                          {getOrderColor(op) === 'purple' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Clock className="size-4 text-purple-500" />
                              </TooltipTrigger>
                              <TooltipContent>Entrega atrasada</TooltipContent>
                            </Tooltip>
                          )}
                          {getOrderColor(op) === 'red' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Clock className="size-4 text-red-500" />
                              </TooltipTrigger>
                              <TooltipContent>Ordem Parada / Gargalo</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-1">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium">{op.status}</span>
                          <span className="text-xs text-muted-foreground">{op.stage}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1">
                        <span
                          className={cn(
                            'text-sm font-medium whitespace-nowrap',
                            getOrderColor(op) === 'purple'
                              ? 'text-purple-500'
                              : 'text-slate-600 dark:text-slate-400',
                          )}
                        >
                          {formatDeadline(op.delivery_date, op.status)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PcpOrderDetails
        op={selectedOp}
        observations={selectedOp ? observations[selectedOp.id] || [] : []}
        onClose={() => setSelectedOp(null)}
      />
    </div>
  )
}
