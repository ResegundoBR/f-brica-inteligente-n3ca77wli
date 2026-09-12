import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getPromisedDateInfo } from '@/lib/pcp-utils'

interface PromisedDateBadgeProps {
  promisedDate?: string | null
  status?: string
  className?: string
  size?: 'sm' | 'md' | 'compact'
  titlePrefix?: string
  promisedBy?: {
    name?: string
    email?: string
  } | null
}

export function PromisedDateBadge({
  promisedDate,
  status,
  className,
  size = 'md',
  titlePrefix,
  promisedBy,
}: PromisedDateBadgeProps) {
  const info = getPromisedDateInfo(promisedDate, status)
  if (!info) return null

  // Cores:
  // Vermelho: vencida (data < hoje e não concluída)
  // Âmbar: faltam 3 dias ou menos (e não vencida)
  // Verde suave: concluída (cumprimento do prazo)
  // Slate/Azul: normal dentro do prazo (> 3 dias)
  let colorClass =
    'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'

  if (info.isConcluded) {
    colorClass =
      'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
  } else if (info.isOverdue) {
    colorClass =
      'bg-red-600 text-white border-red-700 animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.5)] font-bold'
  } else if (info.isDueSoon) {
    colorClass =
      'bg-amber-500 text-slate-950 border-amber-600 dark:bg-amber-400 dark:text-slate-950 font-bold shadow-xs'
  }

  const sizeClass =
    size === 'compact'
      ? 'text-[7.5px] px-1 py-0 h-3.5 leading-none'
      : size === 'sm'
        ? 'text-[10px] px-1.5 py-0.5 h-5 leading-none'
        : 'text-xs px-2 py-0.5 font-medium'

  const promisedByName = promisedBy?.name || promisedBy?.email?.split('@')[0] || ''
  const titleText = `${titlePrefix ? titlePrefix + ' - ' : ''}Data Prometida: ${info.formattedDate}${
    promisedByName ? ` (definida por ${promisedByName})` : ''
  }${
    info.isConcluded
      ? ' (Concluída)'
      : info.isOverdue
        ? ` (${Math.abs(info.daysRemaining)} dia(s) atrasado)`
        : info.isDueSoon
          ? ` (Faltam ${info.daysRemaining} dia(s))`
          : ''
  }`

  return (
    <Badge
      variant="outline"
      title={titleText}
      className={cn(
        'inline-flex items-center gap-1 shrink-0 whitespace-nowrap',
        sizeClass,
        colorClass,
        className,
      )}
    >
      <span>🎯</span>
      <span>
        Prometido: {info.formattedDate}
        {promisedByName && size !== 'compact' && ` · ${promisedByName.split(' ')[0]}`}
      </span>
    </Badge>
  )
}
