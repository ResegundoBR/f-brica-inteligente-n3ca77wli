import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { History, Lock, Eye, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { PcpProgramacaoRecord } from '@/services/pcp-programacoes'
import { NoTranslate } from '@/components/NoTranslate'
interface ProgramacaoHistorySectionProps {
  programacoesEncerradas: PcpProgramacaoRecord[]
  onOpenDetails: (prog: PcpProgramacaoRecord) => void
  onRefresh?: () => void
}

export function ProgramacaoHistorySection({
  programacoesEncerradas,
  onOpenDetails,
  onRefresh,
}: ProgramacaoHistorySectionProps) {
  if (programacoesEncerradas.length === 0) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-slate-500" />
            Histórico de Programações Encerradas
          </CardTitle>
          <CardDescription className="text-xs">
            Programações de produção que já foram finalizadas pelo gestor
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 text-center text-xs text-muted-foreground">
          Nenhuma programação foi encerrada ainda. Todas as novas programações permanecem em
          produção até clique explícito em "Encerrar Programação".
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border shadow-sm">
      <CardHeader className="p-4 border-b flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-slate-600" />
            Histórico de Programações
          </CardTitle>
          <CardDescription className="text-xs">
            Registro oficial de programações encerradas (somente leitura: pedidos, OPs, produtos e
            resultado da separação)
          </CardDescription>
        </div>

        {onRefresh && (
          <Button variant="ghost" size="sm" onClick={onRefresh} className="h-8 gap-1 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent text-xs">
                <TableHead className="w-[120px]">Data Criação</TableHead>
                <TableHead>Programação / Identificação</TableHead>
                <TableHead className="w-[110px] text-center">Status</TableHead>
                <TableHead className="w-[140px] text-center">Pedidos / OPs</TableHead>
                <TableHead className="w-[160px] text-center">Separação (Resultado)</TableHead>
                <TableHead className="w-[150px] text-center">Encerrada por</TableHead>
                <TableHead className="w-[80px] text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {programacoesEncerradas.map((prog) => {
                const sep = prog.expand?.separation_id
                const ordList = Array.isArray(prog.orders_list) ? prog.orders_list : []

                // Agrupamento por pedido único para consistência
                const uniqueOrdersMap = new Map<
                  string,
                  { order_number: string; client_name: string; opCount: number }
                >()
                ordList.forEach((o) => {
                  const key = (o.order_number || 'Sem Pedido').trim().toUpperCase()
                  const existing = uniqueOrdersMap.get(key)
                  if (!existing) {
                    uniqueOrdersMap.set(key, {
                      order_number: o.order_number || 'Sem Pedido',
                      client_name: o.client_name || '',
                      opCount: 1,
                    })
                  } else {
                    existing.opCount += 1
                    if (!existing.client_name && o.client_name) {
                      existing.client_name = o.client_name
                    }
                  }
                })
                const uniqueOrders = Array.from(uniqueOrdersMap.values())
                const totalOrdersCount = uniqueOrders.length || prog.orders_count || 0
                const totalOpsCount = ordList.length || prog.ops_count || 0

                return (
                  <TableRow key={prog.id} className="hover:bg-muted/40 text-xs">
                    <TableCell className="font-mono text-muted-foreground">
                      {prog.created ? new Date(prog.created).toLocaleDateString('pt-BR') : '-'}
                    </TableCell>

                    <TableCell>
                      <div className="space-y-0.5">
                        <span className="font-semibold text-foreground text-sm block">
                          {prog.name}
                        </span>
                        <div className="text-[11px] text-muted-foreground truncate max-w-md">
                          <NoTranslate>
                            {uniqueOrders
                              .slice(0, 3)
                              .map(
                                (o) =>
                                  `${o.order_number}${o.client_name ? ` (${o.client_name})` : ''}${
                                    o.opCount > 1 ? ` [${o.opCount} OPs]` : ''
                                  }`,
                              )
                              .join(', ')}
                            {uniqueOrders.length > 3 &&
                              ` e mais ${uniqueOrders.length - 3} pedidos...`}
                          </NoTranslate>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 font-semibold"
                      >
                        <Lock className="size-3 mr-1" />
                        Encerrada
                      </Badge>
                    </TableCell>

                    <TableCell className="text-center">
                      <span className="font-bold text-foreground">
                        {totalOrdersCount} {totalOrdersCount === 1 ? 'pedido' : 'pedidos'}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {totalOpsCount} OP{totalOpsCount !== 1 ? 's' : ''} • {prog.items_count || 0}{' '}
                        itens
                      </span>
                    </TableCell>

                    <TableCell className="text-center">
                      {sep ? (
                        <div className="flex items-center justify-center gap-2">
                          <span
                            className="flex items-center gap-1 text-emerald-600 font-semibold text-[11px]"
                            title="Itens separados"
                          >
                            <CheckCircle2 className="size-3" />
                            {sep.separated_count || 0}
                          </span>
                          <span className="text-muted-foreground">/</span>
                          <span
                            className="flex items-center gap-1 text-rose-600 font-semibold text-[11px]"
                            title="Faltas registradas"
                          >
                            <AlertTriangle className="size-3" />
                            {sep.shortage_count || 0}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px] italic">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-center text-[11px] text-muted-foreground">
                      <span className="block font-medium text-foreground">
                        {prog.expand?.closed_by?.name || 'Gestor'}
                      </span>
                      <span className="text-[10px]">
                        {prog.closed_at
                          ? new Date(prog.closed_at).toLocaleString('pt-BR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : '-'}
                      </span>
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenDetails(prog)}
                        className="h-8 w-8 p-0"
                        title="Ver histórico em somente leitura"
                      >
                        <Eye className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
