import { useState, type ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SupplierGroupSectionProps {
  supplier: string
  itemCount: number
  totalValue: number
  allSelected: boolean
  onSelectAll: () => void
  children: ReactNode
}

export function SupplierGroupSection({
  supplier,
  itemCount,
  totalValue,
  allSelected,
  onSelectAll,
  children,
}: SupplierGroupSectionProps) {
  const [collapsed, setCollapsed] = useState(false)

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
      <div
        className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        onClick={() => setCollapsed((c) => !c)}
      >
        <Checkbox
          checked={allSelected}
          onCheckedChange={onSelectAll}
          onClick={(e) => e.stopPropagation()}
        />
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform',
            collapsed && '-rotate-90',
          )}
        />
        <span className="font-semibold text-sm">{supplier || 'Sem fornecedor definido'}</span>
        <Badge variant="secondary" className="text-xs">
          {itemCount} {itemCount === 1 ? 'item' : 'itens'}
        </Badge>
        {totalValue > 0 && (
          <span className="ml-auto text-sm font-semibold text-blue-600 dark:text-blue-400">
            {formatCurrency(totalValue)}
          </span>
        )}
      </div>
      {!collapsed && children}
    </div>
  )
}
