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
import { MaterialShortage, Quotation } from '@/types'
import { Tags } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { QuotationDialog } from './components/QuotationDialog'

export default function CotacoesPage() {
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [selectedItem, setSelectedItem] = useState<MaterialShortage | null>(null)

  const fetchData = async () => {
    try {
      const [shortRes, quotRes] = await Promise.all([
        pb.collection('material_shortages').getFullList<MaterialShortage>({
          sort: '-created',
          expand: 'order_id,requested_by',
        }),
        pb.collection('quotations').getFullList<Quotation>({ sort: '-created' }),
      ])
      setShortages(shortRes)
      setQuotations(quotRes)
    } catch (err) {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchData()
  }, [])
  useRealtime('material_shortages', fetchData)
  useRealtime('quotations', fetchData)

  const cotacaoItems = useMemo(() => shortages.filter((s) => s.status === 'Cotação'), [shortages])

  const quotationsByItem = useMemo(() => {
    const map: Record<string, Quotation[]> = {}
    quotations.forEach((q) => {
      if (!map[q.material_shortage_id]) map[q.material_shortage_id] = []
      map[q.material_shortage_id].push(q)
    })
    return map
  }, [quotations])

  const bestPrice = useMemo(() => {
    const map: Record<string, number> = {}
    Object.entries(quotationsByItem).forEach(([id, quots]) => {
      if (quots.length > 0) map[id] = Math.min(...quots.map((q) => q.price))
    })
    return map
  }, [quotationsByItem])

  const selectedSupplier = useMemo(() => {
    const map: Record<string, string> = {}
    Object.entries(quotationsByItem).forEach(([id, quots]) => {
      const sel = quots.find((q) => q.selected)
      if (sel) map[id] = sel.supplier
    })
    return map
  }, [quotationsByItem])

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <SuprimentosHeader
        title="Cotacoes"
        description="Registre e compare cotacoes de fornecedores para cada solicitacao."
        icon={Tags}
      />

      {cotacaoItems.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          Nenhum item em cotacao no momento.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
              <TableRow>
                <TableHead className="w-[100px]">Data</TableHead>
                <TableHead className="w-[100px]">Codigo</TableHead>
                <TableHead>Descricao</TableHead>
                <TableHead className="text-right w-[70px]">Qtde</TableHead>
                <TableHead className="text-center w-[90px]">Cotacoes</TableHead>
                <TableHead className="text-right w-[110px]">Melhor Preco</TableHead>
                <TableHead className="w-[160px]">Fornecedor Sel.</TableHead>
                <TableHead className="text-center w-[100px]">Acao</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cotacaoItems.map((item) => {
                const quots = quotationsByItem[item.id] || []
                return (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => setSelectedItem(item)}
                  >
                    <TableCell className="text-xs text-muted-foreground">
                      {format(parseISO(item.created), 'dd/MM/yy')}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.code || '-'}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{item.description}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={quots.length > 0 ? 'secondary' : 'outline'}
                        className="text-[10px]"
                      >
                        {quots.length}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold text-blue-600">
                      {bestPrice[item.id] ? `R$ ${bestPrice[item.id].toFixed(2)}` : '-'}
                    </TableCell>
                    <TableCell className="text-xs">{selectedSupplier[item.id] || '-'}</TableCell>
                    <TableCell className="text-center">
                      <Button size="sm" variant="outline" className="h-7 text-xs">
                        Gerenciar
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <QuotationDialog
        item={selectedItem}
        open={!!selectedItem}
        onOpenChange={(o) => !o && setSelectedItem(null)}
        onUpdate={fetchData}
      />
    </div>
  )
}
