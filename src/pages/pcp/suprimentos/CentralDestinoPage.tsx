import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MaterialShortage } from '@/types'
import { MapPin, Layers } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { SupplierGroupSection } from './components/SupplierGroupSection'
import { useSupplierGroups } from '@/hooks/use-supplier-groups'
import { cn } from '@/lib/utils'

export default function CentralDestinoPage() {
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [grouped, setGrouped] = useState(false)

  const fetchData = async () => {
    try {
      const res = await pb.collection('material_shortages').getFullList<MaterialShortage>({
        sort: '-created',
        expand: 'order_id,order_id.product_id,requested_by',
      })
      const destinoItems = res.filter(
        (s) => s.status === 'Recebido' || s.status === 'Recebido_Parcial',
      )
      setShortages(destinoItems)
    } catch {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  useRealtime('material_shortages', fetchData)

  const groups = useSupplierGroups(shortages)

  const summary = {
    total: shortages.length,
    received: shortages.filter((s) => s.status === 'Recebido').length,
    partial: shortages.filter((s) => s.status === 'Recebido_Parcial').length,
  }

  const renderRow = (item: MaterialShortage) => {
    const received = Number(item.received_quantity) || 0
    const total = Number(item.quantity) || 0
    const order = item.expand?.order_id
    return (
      <TableRow
        key={item.id}
        className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        <TableCell className="text-xs text-muted-foreground">{item.code || '-'}</TableCell>
        <TableCell className="font-medium text-sm">{item.description}</TableCell>
        <TableCell className="text-right text-sm font-semibold">
          {received}/{total}
        </TableCell>
        <TableCell className="text-xs">{item.supplier || '-'}</TableCell>
        <TableCell className="text-xs">{order?.op_number || order?.order_number || '-'}</TableCell>
        <TableCell className="text-xs">
          {order?.expand?.product_id?.name || order?.manual_product_name || '-'}
        </TableCell>
        <TableCell className="text-xs">{item.sector || '-'}</TableCell>
        <TableCell className="text-xs">
          {item.expected_date ? format(parseISO(item.expected_date), 'dd/MM/yyyy') : '-'}
        </TableCell>
        <TableCell>
          <Badge
            variant="outline"
            className={cn(
              'whitespace-nowrap',
              item.status === 'Recebido' &&
                'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
              item.status === 'Recebido_Parcial' &&
                'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
            )}
          >
            {item.status.replace('_', ' ')}
          </Badge>
        </TableCell>
      </TableRow>
    )
  }

  const renderTableHeader = () => (
    <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
      <TableRow>
        <TableHead className="w-[100px]">Código</TableHead>
        <TableHead>Descrição</TableHead>
        <TableHead className="text-right w-[100px]">Recebido/Total</TableHead>
        <TableHead className="w-[140px]">Fornecedor</TableHead>
        <TableHead className="w-[100px]">OP/Pedido</TableHead>
        <TableHead>Produto</TableHead>
        <TableHead className="w-[100px]">Setor</TableHead>
        <TableHead className="w-[100px]">Previsão</TableHead>
        <TableHead className="w-[100px]">Status</TableHead>
      </TableRow>
    </TableHeader>
  )

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <div className="flex items-center justify-between">
        <SuprimentosHeader
          title="Destino de Materiais"
          description="Acompanhe o destino dos materiais recebidos por fornecedor."
          icon={MapPin}
        />
        <Button variant="outline" size="sm" onClick={() => setGrouped((g) => !g)}>
          <Layers className="w-4 h-4" />
          {grouped ? 'Lista' : 'Agrupar por fornecedor'}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total de Materiais</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Recebidos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{summary.received}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Parcialmente Recebidos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{summary.partial}</p>
          </CardContent>
        </Card>
      </div>

      {shortages.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          Nenhum material recebido para distribuição no momento.
        </div>
      ) : !grouped ? (
        <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
          <Table>
            {renderTableHeader()}
            <TableBody>{shortages.map((item) => renderRow(item))}</TableBody>
          </Table>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <SupplierGroupSection
              key={group.supplier || '__no_supplier__'}
              supplier={group.supplier}
              itemCount={group.items.length}
              totalValue={group.totalValue}
              allSelected={false}
              onSelectAll={() => {}}
            >
              <Table>
                {renderTableHeader()}
                <TableBody>{group.items.map((item) => renderRow(item))}</TableBody>
              </Table>
            </SupplierGroupSection>
          ))}
        </div>
      )}
    </div>
  )
}
