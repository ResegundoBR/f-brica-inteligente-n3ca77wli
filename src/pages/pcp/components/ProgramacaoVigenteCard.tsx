import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Layers, Lock, Eye, ChevronDown, ChevronUp } from 'lucide-react'
import { PcpProgramacaoRecord } from '@/services/pcp-programacoes'
import { NoTranslate } from '@/components/NoTranslate'

interface ProgramacaoVigenteCardProps {
  programacoesEmProducao: PcpProgramacaoRecord[]
  onOpenDetails: (prog: PcpProgramacaoRecord) => void
  onCloseProgramacao: (prog: PcpProgramacaoRecord) => void
}

export function ProgramacaoVigenteCard({
  programacoesEmProducao,
  onOpenDetails,
  onCloseProgramacao,
}: ProgramacaoVigenteCardProps) {
  const [showOtherCards, setShowOtherCards] = useState(false)

  // A vigente é a mais recente em produção
  const vigente = programacoesEmProducao[0]
  const outrasEmProducao = programacoesEmProducao.slice(1)

  const vigenteSeparation = vigente?.expand?.separation_id
  const vigenteOrdersList = Array.isArray(vigente?.orders_list) ? vigente.orders_list : []

  // Agrupamento de pedidos únicos para exibição consistente
  const uniqueVigenteOrders = useMemo(() => {
    const map = new Map<string, { order_number: string; client_name: string; opCount: number }>()
    vigenteOrdersList.forEach((o) => {
      const key = (o.order_number || 'Sem Pedido').trim().toUpperCase()
      const existing = map.get(key)
      if (!existing) {
        map.set(key, {
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
    return Array.from(map.values())
  }, [vigenteOrdersList])

  const vigenteOrdersCount = uniqueVigenteOrders.length || vigente?.orders_count || 0
  const vigenteOpsCount = vigenteOrdersList.length || vigente?.ops_count || 0

  if (programacoesEmProducao.length === 0) {
    return (
      <Card className="border-2 border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
        <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Calendar className="size-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                Nenhuma Programação Vigente no momento
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Selecione OPs da fila abaixo e clique em <strong>ENVIAR PARA SEPARAÇÃO</strong> para
                iniciar uma nova Programação oficial.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* (3) CARTÃO FIXO NO TOPO: PROGRAMAÇÃO VIGENTE */}
      <Card className="border-2 border-blue-500/60 bg-gradient-to-r from-blue-500/10 via-background to-blue-500/5 shadow-md">
        <CardHeader className="p-4 pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <Badge className="bg-blue-600 hover:bg-blue-600 text-white font-bold text-xs uppercase tracking-wider">
                Programação Vigente
              </Badge>
              <Badge
                variant="outline"
                className="border-blue-300 dark:border-blue-800 font-mono text-xs"
              >
                #{vigente.seq_number}
              </Badge>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-emerald-600 text-white text-xs font-semibold gap-1">
                <span className="size-1.5 rounded-full bg-white animate-ping" />
                {vigente.status}
              </Badge>
              {vigenteSeparation?.status && (
                <Badge variant="outline" className="text-xs">
                  Separação: {vigenteSeparation.status}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-1 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-lg md:text-xl font-black text-foreground flex items-center gap-2">
                <span>{vigente.name}</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                <span>
                  <strong>
                    {vigenteOrdersCount} {vigenteOrdersCount === 1 ? 'pedido' : 'pedidos'}
                  </strong>
                </span>
                <span>•</span>
                <span>
                  <strong>
                    {vigenteOpsCount} OP{vigenteOpsCount !== 1 ? 's' : ''}
                  </strong>
                </span>
                <span>•</span>
                <span>
                  <strong>
                    {vigente.items_count || vigente.compiled_items?.length || 0} itens
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Gerada em{' '}
                  {vigente.created ? new Date(vigente.created).toLocaleString('pt-BR') : '-'}
                </span>
              </CardDescription>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenDetails(vigente)}
                className="gap-1.5 h-9 text-xs font-semibold bg-background hover:bg-muted"
              >
                <Eye className="size-4" />
                Ver Detalhes da Programação
              </Button>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => onCloseProgramacao(vigente)}
                className="gap-1.5 h-9 text-xs font-semibold"
                title="Status manual: encerra esta programação explicitamente"
              >
                <Lock className="size-3.5" />
                Encerrar Programação
              </Button>
            </div>
          </div>

          {/* PRÉVIA RÁPIDA DOS PEDIDOS DA VIGENTE */}
          {uniqueVigenteOrders.length > 0 && (
            <div className="pt-2 border-t text-xs text-muted-foreground flex items-center gap-2 overflow-x-auto whitespace-nowrap">
              <span className="font-semibold text-foreground shrink-0">Pedidos nesta rodada:</span>
              <div className="flex items-center gap-1.5">
                {uniqueVigenteOrders.slice(0, 4).map((ord, idx) => (
                  <Badge
                    key={idx}
                    variant="secondary"
                    className="text-[11px] font-mono px-2 py-0.5 max-w-[280px] truncate"
                    title={`Pedido ${ord.order_number}${ord.client_name ? ` · ${ord.client_name}` : ''} (${ord.opCount} OPs)`}
                  >
                    <NoTranslate>
                      {ord.order_number}
                      {ord.client_name ? ` (${ord.client_name})` : ''}
                      {ord.opCount > 1 ? ` [${ord.opCount} OPs]` : ''}
                    </NoTranslate>
                  </Badge>
                ))}
                {uniqueVigenteOrders.length > 4 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{uniqueVigenteOrders.length - 4} pedidos
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DEMAIS PROGRAMAÇÕES EM PRODUÇÃO LISTADAS AO LADO / ABAIXO */}
      {outrasEmProducao.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="size-3.5 text-blue-500" />
              Outras Programações em Produção Simultâneas ({outrasEmProducao.length})
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOtherCards(!showOtherCards)}
              className="h-6 text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              {showOtherCards ? 'Recolher' : 'Exibir todas'}
              {showOtherCards ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
            </Button>
          </div>

          {showOtherCards && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {outrasEmProducao.map((prog) => {
                const sep = prog.expand?.separation_id
                const ordList = Array.isArray(prog.orders_list) ? prog.orders_list : []

                return (
                  <Card
                    key={prog.id}
                    className="border shadow-sm bg-card hover:border-blue-400 transition-colors"
                  >
                    <CardHeader className="p-3 pb-1">
                      <div className="flex items-start justify-between gap-1">
                        <div>
                          <CardTitle className="text-sm font-bold text-foreground">
                            {prog.name}
                          </CardTitle>
                          <CardDescription className="text-[11px]">
                            {prog.orders_count ||
                              new Set(ordList.map((o) => o.order_number).filter(Boolean)).size ||
                              ordList.length}{' '}
                            pedidos • {ordList.length || prog.ops_count || 0} OPs •{' '}
                            {prog.items_count || 0} itens
                          </CardDescription>
                        </div>
                        <Badge className="bg-emerald-600 text-white text-[10px]">Em produção</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-1 space-y-2">
                      <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                        <span>Rodada de Separação:</span>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {sep?.status || 'Atrelada'}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onOpenDetails(prog)}
                          className="h-7 text-xs px-2 gap-1"
                        >
                          <Eye className="size-3" /> Detalhes
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onCloseProgramacao(prog)}
                          className="h-7 text-xs px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                        >
                          <Lock className="size-3 mr-1" /> Encerrar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
