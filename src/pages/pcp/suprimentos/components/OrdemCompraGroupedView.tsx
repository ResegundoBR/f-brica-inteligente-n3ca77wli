import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { ChevronDown } from 'lucide-react'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { OrdemCompra } from '@/types'
import { cn } from '@/lib/utils'
import { OrdemCompraRow } from './OrdemCompraRow'

interface OrdemCompraGroupedViewProps {
  ocs: OrdemCompra[]
  onStatusChange: (id: string, status: string) => void
  onViewDoc: (oc: OrdemCompra) => void
}

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function OrdemCompraGroupedView({
  ocs,
  onStatusChange,
  onViewDoc,
}: OrdemCompraGroupedViewProps) {
  const groups = (() => {
    const map = new Map<string, OrdemCompra[]>()
    for (const oc of ocs) {
      const key = oc.supplier || 'Sem fornecedor'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(oc)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
  })()

  return (
    <div className="space-y-3">
      {groups.map(([supplier, items]) => {
        const total = items.reduce((s, o) => s + (Number(o.total) || 0), 0)
        return (
          <GroupSection
            key={supplier}
            supplier={supplier}
            itemCount={items.length}
            totalValue={total}
            ocs={items}
            onStatusChange={onStatusChange}
            onViewDoc={onViewDoc}
          />
        )
      })}
    </div>
  )
}

function GroupSection({
  supplier,
  itemCount,
  totalValue,
  ocs,
  onStatusChange,
  onViewDoc,
}: {
  supplier: string
  itemCount: number
  totalValue: number
  ocs: OrdemCompra[]
  onStatusChange: (id: string, status: string) => void
  onViewDoc: (oc: OrdemCompra) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
      <div
        className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        onClick={() => setCollapsed((c) => !c)}
      >
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform',
            collapsed && '-rotate-90',
          )}
        />
        <span className="font-semibold text-sm">{supplier}</span>
        <Badge variant="secondary" className="text-xs">
          {itemCount} {itemCount === 1 ? 'OC' : 'OCs'}
        </Badge>
        {totalValue > 0 && (
          <span className="ml-auto text-sm font-semibold text-blue-600 dark:text-blue-400">
            {formatCurrency(totalValue)}
          </span>
        )}
      </div>
      {!collapsed && (
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
                onStatusChange={onStatusChange}
                onViewDoc={onViewDoc}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
