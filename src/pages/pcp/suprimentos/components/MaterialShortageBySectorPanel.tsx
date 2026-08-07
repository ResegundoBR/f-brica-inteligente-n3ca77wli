import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Layers, ChevronRight } from 'lucide-react'
import type { MaterialShortage } from '@/types'
import { cn } from '@/lib/utils'

export const SECTORS = ['Fabricação', 'Acabamento', 'Montagem', 'Projetos'] as const

export function getShortageSector(s: MaterialShortage): string {
  if (s.order_id && s.expand?.order_id?.observation_sector) {
    return s.expand.order_id.observation_sector
  }
  return s.sector || ''
}

interface MaterialShortageBySectorPanelProps {
  shortages: MaterialShortage[]
  onSectorClick?: (sector: string) => void
}

export function MaterialShortageBySectorPanel({
  shortages,
  onSectorClick,
}: MaterialShortageBySectorPanelProps) {
  const { map, other } = useMemo(() => {
    const m: Record<string, number> = {}
    for (const s of SECTORS) m[s] = 0
    let o = 0
    for (const s of shortages) {
      if (s.status === 'Recebido' || s.status === 'Cancelado') continue
      const sector = getShortageSector(s)
      if ((SECTORS as readonly string[]).includes(sector)) {
        m[sector]++
      } else {
        o++
      }
    }
    return { map: m, other: o }
  }, [shortages])

  const total = Object.values(map).reduce((a, b) => a + b, 0) + other

  return (
    <Card className="border-orange-200 dark:border-orange-900/50 shadow-md ring-1 ring-orange-100 dark:ring-orange-900/30">
      <CardHeader className="pb-3 bg-orange-50 dark:bg-orange-900/20 rounded-t-lg">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-orange-600" />
            Faltas de Material por Setor
          </span>
          <Badge variant="secondary" className="text-sm">
            {total}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-3">
        <p className="text-xs text-muted-foreground mb-2">
          Clique em um setor para ver os materiais pendentes
        </p>
        {SECTORS.map((sector) => {
          const count = map[sector]
          const clickable = count > 0 && !!onSectorClick
          return (
            <button
              key={sector}
              type="button"
              onClick={() => clickable && onSectorClick?.(sector)}
              disabled={!clickable}
              className={cn(
                'flex items-center justify-between w-full p-3 rounded-md border text-sm transition-all',
                clickable
                  ? 'cursor-pointer hover:bg-orange-50 hover:border-orange-300 dark:hover:bg-orange-900/20 dark:hover:border-orange-700 border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40'
                  : 'opacity-50 cursor-default border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40',
              )}
            >
              <span className="font-medium">{sector}</span>
              <div className="flex items-center gap-2">
                <Badge variant={count > 0 ? 'destructive' : 'outline'}>{count}</Badge>
                {clickable && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>
          )
        })}
        {other > 0 &&
          (() => {
            const clickable = !!onSectorClick
            return (
              <button
                type="button"
                onClick={() => clickable && onSectorClick?.('Outros')}
                disabled={!clickable}
                className={cn(
                  'flex items-center justify-between w-full p-3 rounded-md border text-sm transition-all',
                  clickable
                    ? 'cursor-pointer hover:bg-orange-50 hover:border-orange-300 dark:hover:bg-orange-900/20 dark:hover:border-orange-700 border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40'
                    : 'opacity-50 cursor-default border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40',
                )}
              >
                <span className="font-medium">Outros</span>
                <div className="flex items-center gap-2">
                  <Badge variant={other > 0 ? 'destructive' : 'outline'}>{other}</Badge>
                  {clickable && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>
            )
          })()}
      </CardContent>
    </Card>
  )
}
