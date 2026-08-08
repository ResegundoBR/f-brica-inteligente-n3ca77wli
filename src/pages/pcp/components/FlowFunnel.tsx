import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Filter } from 'lucide-react'
import { MACRO_GROUPS } from './macro-groups'

interface FlowFunnelProps {
  orders: any[]
}

interface FunnelStageConfig {
  name: string
  macroGroup: string | null
  color: string
  isCompleted: boolean
}

const FUNNEL_STAGE_CONFIGS: FunnelStageConfig[] = [
  { name: 'Pedidos', macroGroup: null, color: 'bg-blue-500', isCompleted: false },
  { name: 'Suprimentos', macroGroup: 'Suprimentos', color: 'bg-cyan-500', isCompleted: false },
  { name: 'Fabricação', macroGroup: 'Fabricação', color: 'bg-orange-500', isCompleted: false },
  { name: 'Acabamento', macroGroup: 'Acabamento', color: 'bg-purple-500', isCompleted: false },
  { name: 'Montagem', macroGroup: 'Montagem', color: 'bg-green-500', isCompleted: false },
  { name: 'Concluídas', macroGroup: null, color: 'bg-emerald-600', isCompleted: true },
]

export function FlowFunnel({ orders }: FlowFunnelProps) {
  const { stages, total } = useMemo(() => {
    const total = orders.length
    const computed = FUNNEL_STAGE_CONFIGS.map((stage) => {
      let count: number
      if (stage.isCompleted) {
        count = orders.filter((o) => o.status === 'Concluído').length
      } else if (stage.macroGroup) {
        const macro = MACRO_GROUPS.find((g) => g.name === stage.macroGroup)
        count = orders.filter(
          (o) => o.status !== 'Concluído' && (macro?.stages || []).includes(o.stage),
        ).length
      } else {
        count = total
      }
      return {
        ...stage,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      }
    })
    return { stages: computed, total }
  }, [orders])

  const maxCount = Math.max(...stages.map((s) => s.count), 1)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Filter className="size-4 text-blue-500" />
          Funil de Fluxo
        </CardTitle>
        <CardDescription>
          Distribuição de OPs: Pedidos → Suprimentos → Fabricação → Acabamento → Montagem →
          Concluídas
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {stages.map((stage) => {
            const barWidth = (stage.count / maxCount) * 100
            return (
              <div key={stage.name} className="flex items-center gap-2">
                <span className="text-xs font-medium w-20 md:w-28 text-right shrink-0">
                  {stage.name}
                </span>
                <div className="flex-1 h-7 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-md transition-all flex items-center justify-end pr-2',
                      stage.color,
                    )}
                    style={{
                      width: `${Math.max(barWidth, stage.count > 0 ? 12 : 0)}%`,
                    }}
                  >
                    {stage.count > 0 && (
                      <span className="text-[10px] font-bold text-white whitespace-nowrap">
                        {stage.count} · {stage.percentage.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          {stages
            .filter((s) => s.count > 0 && s.macroGroup && s.count >= 3)
            .map((stage) => {
              const macro = MACRO_GROUPS.find((g) => g.name === stage.macroGroup)
              const stageOrders = orders
                .filter((o) => o.status !== 'Concluído' && (macro?.stages || []).includes(o.stage))
                .slice(0, 4)
              return (
                <div key={stage.name} className="rounded-md border p-2">
                  <p className="text-[10px] font-semibold mb-1">
                    {stage.name} — OPs acumuladas ({stage.count})
                  </p>
                  <div className="space-y-0.5">
                    {stageOrders.map((op) => (
                      <p key={op.id} className="text-[9px] text-muted-foreground truncate">
                        <span className="font-medium text-foreground">{op.order_number}</span>
                        {' — '}
                        {op.expand?.client_id?.name || op.client_name}
                        {op.op_number && <span className="opacity-60"> · OP: {op.op_number}</span>}
                      </p>
                    ))}
                    {stage.count > 4 && (
                      <p className="text-[9px] text-muted-foreground italic">
                        +{stage.count - 4} mais
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
        </div>
      </CardContent>
    </Card>
  )
}
