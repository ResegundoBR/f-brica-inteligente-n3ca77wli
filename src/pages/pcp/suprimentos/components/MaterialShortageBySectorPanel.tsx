import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Layers } from 'lucide-react'
import type { MaterialShortage } from '@/types'
import { cn } from '@/lib/utils'

const SECTORS = ['Fabricação', 'Acabamento', 'Montagem', 'Projetos'] as const

interface MaterialShortageBySectorPanelProps {
  shortages: MaterialShortage[]
}

export function MaterialShortageBySectorPanel({ shortages }: MaterialShortageBySectorPanelProps) {
  const { map, other } = useMemo(() => {
    const m: Record<string, number> = {}
    for (const s of SECTORS) m[s] = 0
    let o = 0
    for (const s of shortages) {
      if (s.status === 'Recebido' || s.status === 'Cancelado') continue
      let sector = s.sector || ''
      if (s.order_id && s.expand?.order_id?.observation_sector) {
        sector = s.expand.order_id.observation_sector
      }
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-orange-600" />
            Faltas de Material por Setor
          </span>
          <Badge variant="secondary">{total}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {SECTORS.map((sector) => {
          const count = map[sector]
          return (
            <div
              key={sector}
              className="flex items-center justify-between p-2 rounded-md border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40 text-sm"
            >
              <span className="font-medium">{sector}</span>
              <Badge
                variant={count > 0 ? 'destructive' : 'outline'}
                className={cn(count === 0 && 'opacity-50')}
              >
                {count}
              </Badge>
            </div>
          )
        })}
        {other > 0 && (
          <div className="flex items-center justify-between p-2 rounded-md border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40 text-sm">
            <span className="font-medium">Outros</span>
            <Badge variant="outline">{other}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
