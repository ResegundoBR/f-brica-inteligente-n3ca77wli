import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import { MaterialShortage, PcpOrder, OrdemCompra, Supplier } from '@/types'
import { MapPin, Search } from 'lucide-react'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { cn } from '@/lib/utils'
import { format, parseISO } from 'date-fns'

export default function CentralDestinoPage() {
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [ocItems, setOcItems] = useState<any[]>([])
  const [orders, setOrders] = useState<PcpOrder[]>([])
  const [ocs, setOcs] = useState<OrdemCompra[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [opFilter, setOpFilter] = useState('all')
  const [productSearch, setProductSearch] = useState('')
  const [ocFilter, setOcFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')

  const fetchData = async () => {
    try {
      const [sRes, ociRes, oRes, ocRes, supRes] = await Promise.all([
        pb.collection('material_shortages').getFullList<MaterialShortage>({
          filter: 'status = "Recebido" || status = "Recebido_Parcial"',
          sort: '-updated',
          expand: 'order_id,order_id.product_id,requested_by',
        }),
        pb.collection('ordem_compra_itens').getFullList({ expand: 'oc_id,oc_id.supplier_id' }),
        pb.collection('pcp_orders').getFullList<PcpOrder>({ sort: '-created' }),
        pb.collection('ordens_de_compra').getFullList<OrdemCompra>({ sort: '-created' }),
        pb.collection('suppliers').getFullList<Supplier>({ sort: 'name' }),
      ])
      setShortages(sRes)
      setOcItems(ociRes)
      setOrders(oRes)
      setOcs(ocRes)
      setSuppliers(supRes)
    } catch {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  useRealtime('material_shortages', fetchData)

  const ocItemMap = useMemo(() => {
    const m = new Map<string, any>()
    ocItems.forEach((item: any) => {
      if (item.material_shortage_id) m.set(item.material_shortage_id, item)
    })
    return m
  }, [ocItems])

  const rows = useMemo(() => {
    return shortages.map((s) => {
      const oci = ocItemMap.get(s.id)
      const order = s.expand?.order_id
      const product = order?.expand?.product_id
      return {
        id: s.id,
        code: s.code || '-',
        description: s.description,
        receivedQty: Number(s.received_quantity) || 0,
        opNumber: order?.op_number || order?.order_number || '-',
        opId: order?.id || '',
        productCode: product?.code || '',
        productName: product?.name || '-',
        ocNumber: oci?.expand?.oc_id?.oc_number || '-',
        supplierName: oci?.expand?.oc_id?.expand?.supplier_id?.name || s.supplier || '-',
        receiptDate: s.updated,
        status: s.status,
      }
    })
  }, [shortages, ocItemMap])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (opFilter !== 'all' && r.opId !== opFilter) return false
      if (productSearch) {
        const q = productSearch.toLowerCase()
        if (!r.productCode.toLowerCase().includes(q) && !r.productName.toLowerCase().includes(q))
          return false
      }
      if (ocFilter !== 'all' && r.ocNumber !== ocs.find((o) => o.id === ocFilter)?.oc_number)
        return false
      if (supplierFilter !== 'all') {
        const supName = suppliers.find((s) => s.id === supplierFilter)?.name
        if (r.supplierName !== supName) return false
      }
      return true
    })
  }, [rows, opFilter, productSearch, ocFilter, supplierFilter, ocs, suppliers])

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <SuprimentosHeader
        title="Destino de Materiais"
        description="Consulte onde cada material recebido deve ser destinado."
        icon={MapPin}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Materiais Recebidos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{shortages.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Recebidos Totalmente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {shortages.filter((s) => s.status === 'Recebido').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Recebidos Parcialmente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">
              {shortages.filter((s) => s.status === 'Recebido_Parcial').length}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={opFilter} onValueChange={setOpFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todas as OPs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as OPs</SelectItem>
            {orders.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.op_number || o.order_number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto (código ou nome)..."
            className="pl-8"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />
        </div>
        <Select value={ocFilter} onValueChange={setOcFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todas as OCs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as OCs</SelectItem>
            {ocs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.oc_number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todos os Fornecedores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Fornecedores</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredRows.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          Nenhum material recebido encontrado.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
              <TableRow>
                <TableHead className="w-[100px]">Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right w-[80px]">Qtde Recebida</TableHead>
                <TableHead className="w-[100px]">OP</TableHead>
                <TableHead className="w-[160px]">Produto</TableHead>
                <TableHead className="w-[100px]">OC</TableHead>
                <TableHead className="w-[140px]">Fornecedor</TableHead>
                <TableHead className="w-[100px]">Data Receb.</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-medium text-slate-500">{r.code}</TableCell>
                  <TableCell className="font-medium text-sm">{r.description}</TableCell>
                  <TableCell className="text-right text-sm font-bold">{r.receivedQty}</TableCell>
                  <TableCell className="text-xs font-medium">{r.opNumber}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.productCode && (
                      <span className="font-medium text-foreground">{r.productCode}</span>
                    )}
                    {r.productCode && ' - '}
                    {r.productName}
                  </TableCell>
                  <TableCell className="text-xs">{r.ocNumber}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.supplierName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.receiptDate ? format(parseISO(r.receiptDate), 'dd/MM/yy') : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px]',
                        r.status === 'Recebido' &&
                          'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
                        r.status === 'Recebido_Parcial' &&
                          'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
                      )}
                    >
                      {r.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
