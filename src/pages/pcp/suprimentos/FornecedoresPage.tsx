import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Users, Plus } from 'lucide-react'
import { differenceInDays, parseISO } from 'date-fns'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { SupplierFormDialog } from './components/SupplierFormDialog'
import { SupplierMetrics } from './components/SupplierMetrics'
import type { Supplier, Quotation, MaterialShortage, OrdemCompra } from '@/types'
import { getOrdensCompra } from '@/services/ordens-compra'

export default function FornecedoresPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [ocs, setOcs] = useState<OrdemCompra[]>([])

  const fetchData = async () => {
    try {
      const [suppRes, quotRes, shortRes, ocRes] = await Promise.all([
        pb.collection('suppliers').getFullList<Supplier>({ sort: 'name' }),
        pb.collection('quotations').getFullList<Quotation>({ sort: '-created' }),
        pb.collection('material_shortages').getFullList<MaterialShortage>({ sort: '-created' }),
        getOrdensCompra(),
      ])
      setSuppliers(suppRes)
      setQuotations(quotRes)
      setShortages(shortRes)
      setOcs(ocRes)
    } catch {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchData()
  }, [])
  useRealtime('suppliers', fetchData)
  useRealtime('quotations', fetchData)
  useRealtime('material_shortages', fetchData)
  useRealtime('ordens_de_compra', fetchData)

  const supplierData = useMemo(() => {
    return suppliers.map((s) => {
      const supplierQuots = quotations.filter((q) => q.supplier === s.name)
      const supplierPurchases = shortages.filter(
        (ms) =>
          ms.supplier === s.name &&
          (ms.status === 'Recebido' || ms.status === 'Recebido_Parcial' || ms.status === 'Compra'),
      )
      const deliveredItems = shortages.filter(
        (ms) =>
          ms.supplier === s.name && (ms.status === 'Recebido' || ms.status === 'Recebido_Parcial'),
      )
      const leadTimes = deliveredItems
        .filter((ms) => ms.purchase_date && ms.expected_date)
        .map((ms) => differenceInDays(parseISO(ms.expected_date!), parseISO(ms.purchase_date!)))
      const avgDelivery =
        leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : null
      return {
        supplier: s,
        quotations: supplierQuots,
        purchases: supplierPurchases,
        delivered: deliveredItems,
        avgDelivery,
      }
    })
  }, [suppliers, quotations, shortages])

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <div className="flex items-center justify-between">
        <SuprimentosHeader
          title="Fornecedores"
          description="Gerencie fornecedores e acompanhe métricas de desempenho."
          icon={Users}
        />
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus className="w-4 h-4" /> Novo Fornecedor
        </Button>
      </div>

      {suppliers.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          Nenhum fornecedor cadastrado.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead className="text-center w-[100px]">Cotações</TableHead>
                <TableHead className="text-center w-[100px]">Compras</TableHead>
                <TableHead className="text-center w-[120px]">Prazo Médio</TableHead>
                <TableHead className="text-center w-[80px]">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supplierData.map(({ supplier, quotations: quots, purchases, avgDelivery }) => (
                <TableRow
                  key={supplier.id}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => setSelected(supplier)}
                >
                  <TableCell className="font-medium text-sm">{supplier.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {supplier.contact_name || supplier.phone || '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-[10px]">
                      {quots.length}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-[10px]">
                      {purchases.length}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm font-semibold text-blue-600">
                    {avgDelivery !== null ? `${avgDelivery.toFixed(0)} dias` : '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button size="sm" variant="outline" className="h-7 text-xs">
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <SupplierMetrics
        supplier={selected}
        quotations={quotations.filter((q) => q.supplier === selected?.name)}
        shortages={shortages.filter((ms) => ms.supplier === selected?.name)}
        ocs={ocs}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      />

      <SupplierFormDialog open={showForm} onOpenChange={setShowForm} />
    </div>
  )
}
