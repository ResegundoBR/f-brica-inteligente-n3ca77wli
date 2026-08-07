import { useState, useEffect, useMemo } from 'react'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FileText, Layers } from 'lucide-react'
import { parseISO, isBefore, startOfDay } from 'date-fns'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { OrdemCompraDocument } from './components/OrdemCompraDocument'
import {
  getOrdensCompra,
  getOrdemCompraItens,
  updateOrdemCompraStatus,
} from '@/services/ordens-compra'
import { getMaterialShortages } from '@/services/material-shortages'
import { useToast } from '@/hooks/use-toast'
import type { OrdemCompra, OrdemCompraItem, MaterialShortage } from '@/types'
import { MaterialShortageBySectorPanel } from './components/MaterialShortageBySectorPanel'
import { MaterialShortageBySectorModal } from './components/MaterialShortageBySectorModal'
import { OrdemCompraGroupedView } from './components/OrdemCompraGroupedView'
import { OrdemCompraRow } from './components/OrdemCompraRow'

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function OrdensCompraPage() {
  const [ocs, setOcs] = useState<OrdemCompra[]>([])
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [docOc, setDocOc] = useState<OrdemCompra | null>(null)
  const [docItems, setDocItems] = useState<OrdemCompraItem[]>([])
  const [docOpen, setDocOpen] = useState(false)
  const [grouped, setGrouped] = useState(false)
  const [selectedSector, setSelectedSector] = useState<string | null>(null)
  const [sectorModalOpen, setSectorModalOpen] = useState(false)
  const { toast } = useToast()

  const fetchOCs = async () => {
    try {
      const res = await getOrdensCompra()
      setOcs(res)
    } catch {
      /* ignored */
    }
  }

  const fetchShortages = async () => {
    try {
      const res = await getMaterialShortages()
      setShortages(res)
    } catch {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchOCs()
    fetchShortages()
  }, [])

  useRealtime('ordens_de_compra', fetchOCs)
  useRealtime('ordem_compra_itens', fetchOCs)
  useRealtime('material_shortages', fetchShortages)

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

  const handleSectorClick = (sector: string) => {
    setSelectedSector(sector)
    setSectorModalOpen(true)
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
      <div className="flex items-center justify-between">
        <SuprimentosHeader
          title="Ordens de Compra"
          description="Gestão central de todas as OCs com status e acompanhamento de entrega."
          icon={FileText}
        />
        <Button variant="outline" size="sm" onClick={() => setGrouped((g) => !g)}>
          <Layers className="w-4 h-4" />
          {grouped ? 'Lista' : 'Agrupar por fornecedor'}
        </Button>
      </div>

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

      <MaterialShortageBySectorPanel shortages={shortages} onSectorClick={handleSectorClick} />

      {ocs.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          Nenhuma ordem de compra encontrada.
        </div>
      ) : grouped ? (
        <OrdemCompraGroupedView
          ocs={ocs}
          onStatusChange={handleStatusChange}
          onViewDoc={handleViewDoc}
        />
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
              {ocs.map((oc) => (
                <OrdemCompraRow
                  key={oc.id}
                  oc={oc}
                  onStatusChange={handleStatusChange}
                  onViewDoc={handleViewDoc}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <OrdemCompraDocument oc={docOc} items={docItems} open={docOpen} onOpenChange={setDocOpen} />

      <MaterialShortageBySectorModal
        sector={selectedSector}
        shortages={shortages}
        open={sectorModalOpen}
        onOpenChange={setSectorModalOpen}
      />
    </div>
  )
}
