import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Calendar,
  CheckCircle2,
  Clock,
  Layers,
  Package,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Lock,
} from 'lucide-react'
import { PcpProgramacaoRecord } from '@/services/pcp-programacoes'

interface ProgramacaoDetailModalProps {
  programacao: PcpProgramacaoRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseProgramacao?: (prog: PcpProgramacaoRecord) => void
}

export function ProgramacaoDetailModal({
  programacao,
  open,
  onOpenChange,
  onCloseProgramacao,
}: ProgramacaoDetailModalProps) {
  const [componentsExpanded, setComponentsExpanded] = useState(false)

  if (!programacao) return null

  const isClosed = programacao.status === 'Encerrada'
  const separation = programacao.expand?.separation_id
  const compiledItems = Array.isArray(programacao.compiled_items) ? programacao.compiled_items : []
  const ordersList = Array.isArray(programacao.orders_list) ? programacao.orders_list : []

  // Agrupar componentes por perfil/tubos e gerais se aplicável, ou exibir blocos
  const totalItemsCount = compiledItems.length || programacao.items_count || 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="border-b pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                <DialogTitle className="text-xl font-bold">{programacao.name}</DialogTitle>
              </div>
              <DialogDescription className="text-xs">
                Gerada em{' '}
                {programacao.created ? new Date(programacao.created).toLocaleString('pt-BR') : '-'}{' '}
                {programacao.expand?.created_by?.name &&
                  `por ${programacao.expand.created_by.name}`}
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2">
              {isClosed ? (
                <Badge
                  variant="outline"
                  className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 font-semibold"
                >
                  <Lock className="h-3 w-3 mr-1" />
                  Encerrada
                </Badge>
              ) : (
                <Badge className="bg-emerald-600 text-white font-semibold gap-1">
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  Em produção
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 py-3 space-y-5">
          {/* CARDS RESUMO */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-3 bg-muted/40 rounded-lg border text-center">
              <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                Pedidos
              </span>
              <span className="text-xl font-bold text-foreground">
                {programacao.orders_count || ordersList.length}
              </span>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border text-center">
              <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                Ordens de Produção
              </span>
              <span className="text-xl font-bold text-blue-600">
                {programacao.ops_count || ordersList.length}
              </span>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border text-center">
              <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                Itens Consolidados
              </span>
              <span className="text-xl font-bold text-foreground">{totalItemsCount}</span>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border text-center">
              <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                Rodada Separação
              </span>
              <span className="text-xs font-semibold text-foreground truncate block mt-1">
                {separation?.status ? (
                  <Badge variant="outline" className="text-[10px] h-5">
                    {separation.status}
                  </Badge>
                ) : (
                  'Atrelada'
                )}
              </span>
            </div>
          </div>

          {/* SE A PROGRAMAÇÃO JÁ FOI ENCERRADA: RESULTADO DA SEPARAÇÃO */}
          {separation && (
            <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Package className="h-4 w-4 text-emerald-600" />
                  Resultado da Separação Física:
                </span>
                <span className="text-xs text-muted-foreground">
                  Status: <strong>{separation.status}</strong>
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2 rounded bg-background border flex items-center justify-between">
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Separados:
                  </span>
                  <strong className="text-emerald-600 text-sm font-bold">
                    {separation.separated_count || 0}
                  </strong>
                </div>
                <div className="p-2 rounded bg-background border flex items-center justify-between">
                  <span className="text-rose-700 dark:text-rose-400 font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Faltas:
                  </span>
                  <strong className="text-rose-600 text-sm font-bold">
                    {separation.shortage_count || 0}
                  </strong>
                </div>
                <div className="p-2 rounded bg-background border flex items-center justify-between col-span-2 sm:col-span-1">
                  <span className="text-muted-foreground font-medium">Finalizado por:</span>
                  <span className="font-semibold truncate">
                    {separation.expand?.finished_by?.name ||
                      (separation.status === 'Concluida' ? 'Operador' : 'Em andamento')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* (4) LISTA DE PEDIDOS / OPS / PRODUTOS (SEMPRE VISÍVEL) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>📋</span>
                Pedidos & Ordens de Produção ({ordersList.length})
                <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                  Sempre visível
                </Badge>
              </h3>
            </div>

            <div className="border rounded-lg overflow-hidden bg-card">
              <ScrollArea className="max-h-56">
                <div className="divide-y text-xs">
                  {ordersList.map((ord, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 flex items-center justify-between hover:bg-muted/40 transition-colors gap-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[11px] text-muted-foreground w-6 text-center">
                          #{idx + 1}
                        </span>
                        <div className="font-medium text-foreground break-words">
                          {ord.formatted_label ||
                            `${ord.order_number} — ${ord.client_name} — ${ord.product_name} / OP ${ord.op_number}`}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {ord.quantity && (
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            {ord.quantity} un
                          </Badge>
                        )}
                        {ord.op_number && (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            OP {ord.op_number}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  {ordersList.length === 0 && (
                    <div className="p-4 text-center text-muted-foreground text-xs">
                      Nenhum pedido listado nesta programação.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* (4) LISTA DE COMPONENTES RECOLHIDA POR PADRÃO (APENAS CONTADORES, COM EXPANSÃO EXPLÍCITA) */}
          <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span>🔩</span>
                  Compilado de Materiais & Componentes
                  <Badge variant="secondary" className="font-mono text-xs">
                    {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'itens'}
                  </Badge>
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Recolhido por padrão — abra somente para consulta técnica detalhada de corte ou
                  peças.
                </p>
              </div>

              <Button
                type="button"
                variant={componentsExpanded ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setComponentsExpanded(!componentsExpanded)}
                className="h-8 text-xs font-semibold gap-1.5"
              >
                {componentsExpanded
                  ? 'Ocultar Componentes'
                  : `Expandir Lista (${totalItemsCount} itens)`}
                <ChevronRight
                  className={`h-4 w-4 transition-transform ${componentsExpanded ? 'rotate-90' : ''}`}
                />
              </Button>
            </div>

            {/* SE EXPANDIDO: EXIBE A LISTA DE MATERIAIS */}
            {componentsExpanded && (
              <div className="pt-2 border-t mt-2">
                <ScrollArea className="max-h-72">
                  <div className="space-y-1.5">
                    {compiledItems.map((item: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-2 rounded bg-card border flex items-center justify-between text-xs gap-3 hover:bg-muted/40"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            {item.code ? (
                              <span className="font-mono font-bold text-foreground">
                                {item.code}
                              </span>
                            ) : (
                              <span className="text-muted-foreground italic">s/ código</span>
                            )}
                            <span className="text-muted-foreground truncate">
                              {item.description}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            {item.cutMeasurement && (
                              <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                                Corte: {item.cutMeasurement}
                              </Badge>
                            )}
                            {item.orderNumbers && item.orderNumbers.length > 0 && (
                              <span>OPs: {item.orderNumbers.join(', ')}</span>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="font-bold text-foreground font-mono">
                            {Number(item.totalQuantity || item.quantity || 0).toLocaleString(
                              'pt-BR',
                              { maximumFractionDigits: 2 },
                            )}{' '}
                            {item.unit || 'UN'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          {programacao.notes && (
            <div className="p-3 rounded-lg bg-muted/40 border text-xs text-muted-foreground">
              <strong className="text-foreground">Observações:</strong> {programacao.notes}
            </div>
          )}

          {isClosed && programacao.closed_at && (
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border text-xs text-muted-foreground flex items-center justify-between">
              <span>
                Encerrada em {new Date(programacao.closed_at).toLocaleString('pt-BR')}
                {programacao.expand?.closed_by?.name && ` por ${programacao.expand.closed_by.name}`}
              </span>
              <Badge variant="outline" className="text-[10px]">
                Somente Leitura
              </Badge>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-3 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {!isClosed ? (
              <span>
                Permanece <strong>Em produção</strong> até clique explícito do gestor.
              </span>
            ) : (
              <span>Registro oficial gravado no Histórico de Programações.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>

            {!isClosed && onCloseProgramacao && (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5 font-bold"
                onClick={() => {
                  onCloseProgramacao(programacao)
                }}
              >
                <Lock className="h-4 w-4" />
                Encerrar Programação
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
