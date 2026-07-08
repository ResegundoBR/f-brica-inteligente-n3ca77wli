import { cn } from '@/lib/utils'

const LEGEND_ITEMS = [
  {
    color: 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700',
    label: 'No fluxo',
  },
  { color: 'bg-yellow-400', label: 'Etapa atrasada' },
  { color: 'bg-orange-500', label: 'Parado / Gargalo' },
  { color: 'bg-purple-500', label: 'Prazo vencido' },
]

export function StatusLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      {LEGEND_ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={cn('inline-block h-3 w-3 rounded-sm', item.color)} />
          <span className="text-xs text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  )
}
