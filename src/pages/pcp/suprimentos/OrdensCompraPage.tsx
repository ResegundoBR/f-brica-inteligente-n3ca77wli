import { useState, useEffect, useMemo } from 'react'
import { useRealtime } from '@/hooks/use-realtime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { OrdemCompra, OrdemCompraItem } from '@/types'
import { FileText, Eye } from 'lucide-react'
import { format, parseISO, isBefore, startOfDay } from 'date-fns'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { OrdemCompraDocument } from './components/OrdemCompraDocument'
import {
  getOrdensCompra,
  getOrdemCompraItens,
  updateOrdemCompraStatus,
} from '@/services/ordens-compra'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = {
  Pendente:
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  Enviada:
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  Recebida:
    'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
  Cancelada:
    'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
}

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function OrdensCompraPage() {
  const [ocs, setOcs] = useState<OrdemCompra[]>([])
  const [docOc, setDocOc] = useState<OrdemCompra | null>(null)
  const [docItems, setDocItems] = useState<OrdemCompraItem[]>([])
  const [docOpen, setDocOpen] = useState(false)
  const { toast } = useToast()

  const fetchOCs = async () => {
    try {
      const res = await getOrdensCompra()
      setOcs(res)
    } catch {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchOCs()
  }, [])

  useRealtime('ordens_de_compra', fetchOCs)
  useRealtime('ordem_compra_itens', fetchOCs)

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateOrdemCompraStatus(id, status)
      toast({ title: 'Status atualizado' })
      fetchOCs()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleViewDoc = async (oc: OrdemCompra) => {
    try {
      const items = await getOrdemCompraItens(oc.id)
      setDocOc(oc)
      setDocItems(items)
      setDocOpen(true)
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const summary = useMemo(() => {
    const today = startOfDay(new Date())
    return {
      total: ocs.length,
      pending: ocs.filter((o) => o.status === 'Pendente').length,
      received: ocs.filter((o) => o.status === 'Recebida').length,
      overdue: ocs.filter((o) => {
        if (o.status === 'Recebida' || o.status === 'Cancelada' || !o.expected_date) return false
        return isBefore(parseISO(o.expected_date), today)
      }).length,
      totalValue: ocs.reduce((s, o) => s + (Number(o.total) || 0), 0),
    }
  }, [ocs])

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <SuprimentosHeader
        title="Ordens de Compra"
        description="Gestão central de todas as OCs com status e acompanhamento de entrega."
        icon={FileText}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total de OCs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{summary.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Recebidas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{summary.received}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Valor Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(summary.totalValue)}</p>
          </CardContent>
        </Card>
      </div>

      {ocs.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          Nenhuma ordem de compra encontrada.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
              <TableRow>
                <TableHead className="w-[100px]">OC Nº</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="w-[140px]">Status</TableHead>
                <TableHead className="w-[120px]">Previsão</TableHead>
                <TableHead className="w-[110px]">Acompanhamento</TableHead>
                <TableHead className="text-right w-[120px]">Total</TableHead>
                <TableHead className="w-[100px]">Entrega</TableHead>
                <TableHead className="w-[120px]">Pagamento</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ocs.map((oc) => {
                const overdue =
                  oc.expected_date &&
                  oc.status !== 'Recebida' &&
                  oc.status !== 'Cancelada' &&
                  isBefore(parseISO(oc.expected_date), startOfDay(new Date()))
                return (
                  <TableRow
                    key={oc.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <TableCell className="font-bold text-sm">{oc.oc_number}</TableCell>
                    <TableCell className="text-sm font-medium">{oc.supplier}</TableCell>
                    <TableCell>
                      <Select
                        value={oc.status || 'Pendente'}
                        onValueChange={(v) => handleStatusChange(oc.id, v)}
                      >
                        <SelectTrigger className="h-8 w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pendente">Pendente</SelectItem>
                          <SelectItem value="Enviada">Enviada</SelectItem>
                          <SelectItem value="Recebida">Recebida</SelectItem>
                          <SelectItem value="Cancelada">Cancelada</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {oc.expected_date ? format(parseISO(oc.expected_date), 'dd/MM/yy') : '-'}
                    </TableCell>
                    <TableCell>
                      {overdue ? (
                        <Badge variant="destructive" className="text-[10px]">
                          Atrasada
                        </Badge>
                      ) : oc.status === 'Recebida' ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400"
                        >
                          Recebida
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          No prazo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      {oc.total ? formatCurrency(Number(oc.total)) : '-'}
                    </TableCell>
                    <TableCell className="text-xs">{oc.delivery_type || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {oc.payment_terms || '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => handleViewDoc(oc)}
                      >
                        <Eye className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <OrdemCompraDocument oc={docOc} items={docItems} open={docOpen} onOpenChange={setDocOpen} />
    </div>
  )
}
