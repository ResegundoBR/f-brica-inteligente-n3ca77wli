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
import { format, parseISO, isBefore, startOfDay } from 'date-fns'
import { Paperclip, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PcpOrderForm } from './components/PcpOrderForm'
import { PcpOrderDetails } from './components/PcpOrderDetails'

export default function PcpOrders() {
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [observations, setObservations] = useState<Record<string, PcpOrderObservation[]>>({})
  const [isOpen, setIsOpen] = useState(false)
  const [selectedOp, setSelectedOp] = useState<PcpOrder | null>(null)
  const { toast } = useToast()

  const loadData = async () => {
    try {
      const ops = await pb
        .collection('pcp_orders')
        .getFullList<PcpOrder>({ sort: '-created', expand: 'product_id,client_id' })
      setOrders(ops)
    } catch (e: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as ordens de produção.',
        variant: 'destructive',
      })
    }

    try {
      const prods = await pb
        .collection('products')
        .getFullList<Product>({ sort: 'name', expand: 'status' })
      setProducts(prods)
    } catch (e: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os produtos.',
        variant: 'destructive',
      })
    }

    try {
      const clis = await pb.collection('clients').getFullList<Client>({ sort: 'name' })
      setClients(clis)
    } catch (e: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os clientes.',
        variant: 'destructive',
      })
    }

    try {
      const obs = await pb
        .collection('pcp_order_observations')
        .getFullList<PcpOrderObservation>({ sort: 'created' })
      const obsMap: Record<string, PcpOrderObservation[]> = {}
      obs.forEach((o) => {
        if (!obsMap[o.order_id]) obsMap[o.order_id] = []
        obsMap[o.order_id].push(o)
      })
      setObservations(obsMap)
    } catch (e: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as observações.',
        variant: 'destructive',
      })
    }
  }

  useEffect(() => {
    loadData()
  }, [])
  useRealtime('pcp_orders', () => loadData())
  useRealtime('pcp_order_observations', () => loadData())

  const groupedOrders = useMemo(() => {
    const groups: {
      order_number: string
      client_name: string
      op_type: string
      items: PcpOrder[]
    }[] = []
    const map = new Map<string, PcpOrder[]>()
    orders.forEach((op) => {
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
  const isOpDelayed = (op: PcpOrder) =>
    op.status !== 'Concluído' && isBefore(parseISO(op.delivery_date), today)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ordens de Produção</h1>
          <p className="text-muted-foreground">Gerencie as OPs e integre documentos externos.</p>
        </div>
        <PcpOrderForm
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          clients={clients}
          products={products}
          onSuccess={loadData}
        />
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
              <TableHead>Anexo</TableHead>
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
                      'bg-muted/50 hover:bg-muted/50 border-y',
                      group.op_type === 'Assistência'
                        ? 'bg-fuchsia-50/50 text-fuchsia-900 dark:bg-fuchsia-950/20 dark:text-fuchsia-200'
                        : group.op_type === 'Especial'
                          ? 'bg-slate-100 text-slate-900 dark:bg-slate-900/50 dark:text-slate-200'
                          : 'bg-blue-50/50 text-blue-900 dark:bg-blue-950/20 dark:text-blue-200',
                    )}
                  >
                    <TableCell colSpan={6} className="font-semibold text-sm py-3">
                      <div className="flex items-center gap-4">
                        <span>Pedido: {group.order_number}</span>
                        <span className="opacity-50">|</span>
                        <span>Cliente: {group.client_name}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'ml-auto border-transparent',
                            group.op_type === 'Assistência' && 'bg-fuchsia-500 text-white',
                            group.op_type === 'Especial' &&
                              'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900',
                            group.op_type === 'Linha' && 'bg-blue-500 text-white',
                          )}
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
                        isOpDelayed(op) &&
                          'bg-red-50/50 hover:bg-red-100/50 dark:bg-red-950/20 dark:hover:bg-red-900/30',
                      )}
                      onClick={() => setSelectedOp(op)}
                    >
                      <TableCell className="pl-6 font-medium">{op.op_number || '-'}</TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-sm">
                            {op.op_type === 'Assistência'
                              ? op.manual_product_name
                              : op.op_type === 'Especial'
                                ? 'Produto Especial'
                                : op.expand?.product_id?.name || '-'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{op.quantity}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {format(parseISO(op.delivery_date), 'dd/MM/yyyy')}
                          {isOpDelayed(op) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Clock className="size-4 text-red-500" />
                              </TooltipTrigger>
                              <TooltipContent>Entrega atrasada</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium">{op.status}</span>
                          <span className="text-xs text-muted-foreground">{op.stage}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {op.annex && (
                          <a
                            href={pb.files.getURL(op, op.annex)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-500 hover:underline flex items-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Paperclip className="mr-1 size-4" /> Ver
                          </a>
                        )}
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
