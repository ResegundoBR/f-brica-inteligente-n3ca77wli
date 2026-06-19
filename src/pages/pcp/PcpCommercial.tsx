import { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { PcpOrder } from '@/types'
import { useRealtime } from '@/hooks/use-realtime'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { format, parseISO, isAfter, startOfDay } from 'date-fns'
import { Search } from 'lucide-react'

const STAGES = ['Corte', 'Montagem', 'Acabamento', 'Expedição']

export default function PcpCommercial() {
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [search, setSearch] = useState('')

  const loadData = async () => {
    try {
      const records = await pb.collection('pcp_orders').getFullList<PcpOrder>({
        sort: 'delivery_date',
        expand: 'product_id',
      })
      setOrders(records)
    } catch {
      /* intentionally ignored */
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useRealtime('pcp_orders', () => {
    loadData()
  })

  const filteredOrders = orders.filter(
    (op) =>
      op.client_name.toLowerCase().includes(search.toLowerCase()) ||
      op.order_number.toLowerCase().includes(search.toLowerCase()),
  )

  const getStatusInfo = (op: PcpOrder) => {
    if (op.bottleneck_reason !== 'Nenhum') {
      return {
        label: 'Travado (Gargalo)',
        variant: 'destructive' as const,
        className: 'bg-red-500',
      }
    }
    if (op.status === 'Concluído') {
      return { label: 'Finalizado', variant: 'default' as const, className: 'bg-green-500' }
    }

    const delivery = startOfDay(parseISO(op.delivery_date))
    const today = startOfDay(new Date())

    if (isAfter(today, delivery)) {
      return { label: 'Atrasado', variant: 'destructive' as const, className: 'bg-orange-500' }
    }

    return { label: 'No Prazo', variant: 'secondary' as const, className: 'bg-blue-500' }
  }

  const getProgress = (op: PcpOrder) => {
    if (op.status === 'Concluído') return 100
    const idx = STAGES.indexOf(op.stage)
    return (idx / STAGES.length) * 100
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Visão Comercial</h1>
        <p className="text-muted-foreground">
          Acompanhe o status e previsão das ordens de produção de seus clientes.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por cliente ou OP..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ordem</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Previsão</TableHead>
              <TableHead className="w-[200px]">Progresso</TableHead>
              <TableHead>Etapa Atual</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-24">
                  Nenhuma OP encontrada.
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((op) => {
                const statusInfo = getStatusInfo(op)
                return (
                  <TableRow key={op.id}>
                    <TableCell className="font-semibold">{op.order_number}</TableCell>
                    <TableCell>{op.client_name}</TableCell>
                    <TableCell>
                      {op.is_special ? 'Produto Especial' : op.expand?.product_id?.name}
                    </TableCell>
                    <TableCell>{format(parseISO(op.delivery_date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        <Progress value={getProgress(op)} className="h-2" />
                        <span className="text-xs text-muted-foreground text-right">
                          {Math.round(getProgress(op))}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {op.status === 'Concluído' ? '-' : op.stage}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusInfo.variant} className={statusInfo.className}>
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
