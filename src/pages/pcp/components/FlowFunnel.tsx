import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Filter } from 'lucide-react'
import { MACRO_GROUPS } from './macro-groups'

interface FlowFunnelProps {
  orders: any[]
}

const FUNNEL_MACRO_GROUPS = ['Suprimentos', 'Fabricação', 'Acabamento', 'Montagem']

const STAGE_COLORS: Record<string, string> = {
  Pedidos: 'bg-blue-500',
  OPs: 'bg-indigo-500',
  Suprimentos: 'bg-cyan-500',
  Fabricação: 'bg-orange-500',
  Acabamento: 'bg-purple-500',
  Montagem: 'bg-green-500',
}

interface FunnelStageData {
  name: string
  count: number
  percentage: number
  color: string
}

function getStagesForMacroGroup(name: string): string[] {
  return MACRO_GROUPS.find((g) => g.name === name)?.stages || []
}

function FunnelBars({ stages, maxCount }: { stages: FunnelStageData[]; maxCount: number }) {
  return (
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
                style={{ width: `${Math.max(barWidth, stage.count > 0 ? 12 : 0)}%` }}
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
  )
}

export function FlowFunnel({ orders }: FlowFunnelProps) {
  const { pedidosFunnel, opsFunnel, pedidosTotal, opsTotal } = useMemo(() => {
    const activeOps = orders.filter((o) => o.status === 'Fila' || o.status === 'Em Andamento')
    const nonConcludedOps = orders.filter((o) => o.status !== 'Concluído')

    const ordersByNumber: Record<string, any[]> = {}
    nonConcludedOps.forEach((o) => {
      const key = o.order_number || o.id
      if (!ordersByNumber[key]) ordersByNumber[key] = []
      ordersByNumber[key].push(o)
    })
    const activeOrderNumbers = Object.keys(ordersByNumber)
    const pedidosTotal = activeOrderNumbers.length
    const opsTotal = activeOps.length

    const pedidosFunnel: FunnelStageData[] = [
      { name: 'Pedidos', count: pedidosTotal, percentage: 100, color: STAGE_COLORS.Pedidos },
      ...FUNNEL_MACRO_GROUPS.map((macroName) => {
        const stages = getStagesForMacroGroup(macroName)
        const count = activeOrderNumbers.filter((on) =>
          ordersByNumber[on].some((op) => stages.includes(op.stage)),
        ).length
        return {
          name: macroName,
          count,
          percentage: pedidosTotal > 0 ? (count / pedidosTotal) * 100 : 0,
          color: STAGE_COLORS[macroName],
        }
      }),
    ]

    const opsFunnel: FunnelStageData[] = [
      { name: 'OPs', count: opsTotal, percentage: 100, color: STAGE_COLORS.OPs },
      ...FUNNEL_MACRO_GROUPS.map((macroName) => {
        const stages = getStagesForMacroGroup(macroName)
        const count = activeOps.filter((op) => stages.includes(op.stage)).length
        return {
          name: macroName,
          count,
          percentage: opsTotal > 0 ? (count / opsTotal) * 100 : 0,
          color: STAGE_COLORS[macroName],
        }
      }),
    ]

    return { pedidosFunnel, opsFunnel, pedidosTotal, opsTotal }
  }, [orders])

  const pedidosMaxCount = Math.max(...pedidosFunnel.map((s) => s.count), 1)
  const opsMaxCount = Math.max(...opsFunnel.map((s) => s.count), 1)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Filter className="size-4 text-blue-500" />
          Funil de Fluxo
        </CardTitle>
        <CardDescription>
          Distribuição ativa: Pedidos ({pedidosTotal}) e OPs ({opsTotal}) — Suprimentos → Fabricação
          → Acabamento → Montagem
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="text-sm font-semibold mb-2">
            Pedidos Ativos{' '}
            <span className="text-muted-foreground font-normal">({pedidosTotal})</span>
          </p>
          <FunnelBars stages={pedidosFunnel} maxCount={pedidosMaxCount} />
        </div>
        <div>
          <p className="text-sm font-semibold mb-2">
            OPs Ativas <span className="text-muted-foreground font-normal">({opsTotal})</span>
          </p>
          <FunnelBars stages={opsFunnel} maxCount={opsMaxCount} />
        </div>
      </CardContent>
    </Card>
  )
}
