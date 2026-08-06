import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
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
import { format, parseISO } from 'date-fns'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { OrdemCompraDocument } from './components/OrdemCompraDocument'
import { getOrdemCompraItens } from '@/services/ordens-compra'
import { Eye, FileText } from 'lucide-react'
import { toast } from 'sonner'

function formatOcNumber(num: string) {
  if (/^\d+$/.test(num)) return Number(num).toLocaleString('pt-BR')
  return num
}

const formatCurrency = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const statusVariant: Record<string, string> = {
  Pendente: 'bg-yellow-100 text-yellow-800',
  Enviada: 'bg-blue-100 text-blue-800',
  Recebida: 'bg-green-100 text-green-800',
  Cancelada: 'bg-red-100 text-red-800',
}

export default function OrdensCompraPage() {
  const [ordens, setOrdens] = useState<OrdemCompra[]>([])
  const [docOc, setDocOc] = useState<OrdemCompra | null>(null)
  const [docItems, setDocItems] = useState<OrdemCompraItem[]>([])
  const [docOpen, setDocOpen] = useState(false)

  const fetchOrdens = async () => {
    try {
      const res = await pb.collection('ordens_de_compra').getFullList<OrdemCompra>({
        sort: '-created',
        expand: 'supplier_id,user_id',
      })
      setOrdens(res)
    } catch {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchOrdens()
  }, [])
  useRealtime('ordens_de_compra', fetchOrdens)

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await pb.collection('ordens_de_compra').update(id, { status })
      toast.success('Status atualizado')
    } catch {
      toast.error('Erro ao atualizar status')
    }
  }

  const handleView = async (oc: OrdemCompra) => {
    try {
      const items = await getOrdemCompraItens(oc.id)
      setDocOc(oc)
      setDocItems(items)
      setDocOpen(true)
    } catch {
      toast.error('Erro ao carregar itens da OC')
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <SuprimentosHeader
        title="Ordens de Compra"
        description="Gestão central de ordens de compra, status e entregas."
        icon={FileText}
      />

      {ordens.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          Nenhuma ordem de compra encontrada.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
              <TableRow>
                <TableHead>Nº OC</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Prev. Entrega</TableHead>
                <TableHead>Entrega / Retira</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordens.map((oc) => (
                <TableRow
                  key={oc.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <TableCell className="font-bold text-sm">
                    {formatOcNumber(oc.oc_number)}
                  </TableCell>
                  <TableCell className="text-sm">{oc.supplier}</TableCell>
                  <TableCell className="text-right text-sm font-semibold">
                    {formatCurrency(oc.total || 0)}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={oc.status || 'Pendente'}
                      onValueChange={(val) => handleStatusChange(oc.id, val)}
                    >
                      <SelectTrigger className="h-8 w-32">
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
                  <TableCell className="text-sm text-muted-foreground">
                    {oc.expected_date ? format(parseISO(oc.expected_date), 'dd/MM/yyyy') : '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {oc.delivery_type ? (
                      <span
                        className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${statusVariant[oc.delivery_type] || 'bg-slate-100 text-slate-800'}`}
                      >
                        {oc.delivery_type}
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => handleView(oc)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <OrdemCompraDocument oc={docOc} items={docItems} open={docOpen} onOpenChange={setDocOpen} />
    </div>
  )
}
