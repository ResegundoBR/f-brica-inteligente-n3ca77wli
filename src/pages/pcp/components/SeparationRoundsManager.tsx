import { useState, useEffect } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Package,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Eye,
  Layers,
  ArrowRight,
} from 'lucide-react'
import {
  MaterialSeparation,
  getSeparations,
  SeparationStatus,
} from '@/services/material-separations'
import { formatLocalDate } from '@/lib/pcp-utils'
import pb from '@/lib/pocketbase/client'

export function SeparationRoundsManager() {
  const [separations, setSeparations] = useState<MaterialSeparation[]>([])
  const [loading, setLoading] = useState(true)
  const [detailModal, setDetailModal] = useState<MaterialSeparation | null>(null)

  const loadData = async () => {
    try {
      setLoading(true)
      const list = await getSeparations()
      setSeparations(list)
    } catch (err) {
      console.error('Erro ao carregar separações:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    // Inscrição em tempo real para atualizações nas separações
    pb.collection('material_separations')
      .subscribe('*', () => {
        loadData()
      })
      .catch(() => {})

    return () => {
      pb.collection('material_separations')
        .unsubscribe('*')
        .catch(() => {})
    }
  }, [])

  const getStatusBadge = (status: SeparationStatus) => {
    switch (status) {
      case 'Pendente':
        return (
          <Badge
            variant="outline"
            className="bg-amber-500/10 text-amber-600 border-amber-500/30 font-medium"
          >
            <Clock className="w-3 h-3 mr-1" />
            Pendente
          </Badge>
        )
      case 'Em_Separacao':
        return (
          <Badge
            variant="outline"
            className="bg-blue-500/10 text-blue-600 border-blue-500/30 font-medium animate-pulse"
          >
            <Layers className="w-3 h-3 mr-1" />
            Em Separação
          </Badge>
        )
      case 'Concluida':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-medium"
          >
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Concluída
          </Badge>
        )
      case 'Cancelada':
        return (
          <Badge variant="outline" className="bg-muted text-muted-foreground font-medium">
            Cancelada
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (loading && separations.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Carregando histórico de separações...
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border shadow-sm">
      <CardHeader className="p-4 border-b flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Rodadas de Separação de Materiais
          </CardTitle>
          <CardDescription className="text-xs">
            Acompanhe o status das rodadas enviadas para separação física pelo Operador
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadData}
          disabled={loading}
          className="h-8 gap-1 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {separations.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma rodada de separação criada ainda. Selecione OPs e clique em{' '}
            <strong>ENVIAR PARA SEPARAÇÃO</strong> no compilado de materiais.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[140px]">Data Envio</TableHead>
                  <TableHead>Identificação / OPs</TableHead>
                  <TableHead className="w-[130px] text-center">Status</TableHead>
                  <TableHead className="w-[180px] text-center">Itens / Resumo</TableHead>
                  <TableHead className="w-[150px] text-center">Finalizado por</TableHead>
                  <TableHead className="w-[80px] text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {separations.map((sep) => {
                  const total = sep.total_items_count || sep.items?.length || 0
                  const sepCount = sep.separated_count || 0
                  const shortCount = sep.shortage_count || 0

                  return (
                    <TableRow key={sep.id} className="hover:bg-muted/40">
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {sep.created
                          ? new Date(sep.created).toLocaleString('pt-BR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : '-'}
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          {sep.expand?.programacao_id?.name && (
                            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 block font-mono">
                              {sep.expand.programacao_id.name}
                            </span>
                          )}
                          <span className="font-medium text-sm text-foreground block">
                            {sep.expand?.programacao_id?.name
                              ? `Separação — ${sep.expand.programacao_id.name}`
                              : sep.title || `Separação (${sep.op_numbers?.length || 0} OPs)`}
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {(sep.op_numbers || []).slice(0, 5).map((op) => (
                              <Badge
                                key={op}
                                variant="outline"
                                className="text-[10px] font-mono px-1.5 py-0 h-4"
                              >
                                OP {op}
                              </Badge>
                            ))}
                            {(sep.op_numbers || []).length > 5 && (
                              <Badge variant="secondary" className="text-[10px] px-1 h-4">
                                +{(sep.op_numbers || []).length - 5}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-center">{getStatusBadge(sep.status)}</TableCell>

                      <TableCell>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-medium text-foreground">
                            {total} {total === 1 ? 'item' : 'itens'} no total
                          </span>
                          <div className="flex items-center gap-2 text-xs">
                            <span
                              className="flex items-center gap-1 text-emerald-600 font-semibold"
                              title="Separados"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {sepCount}
                            </span>
                            <span className="text-muted-foreground">/</span>
                            <span
                              className="flex items-center gap-1 text-rose-600 font-semibold"
                              title="Faltas geradas para Suprimentos"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              {shortCount}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-xs text-center text-muted-foreground">
                        {sep.status === 'Concluida' ? (
                          <div>
                            <span className="font-medium text-foreground block">
                              {sep.expand?.finished_by?.name || 'Operador'}
                            </span>
                            <span className="text-[10px]">
                              {sep.finished_at
                                ? new Date(sep.finished_at).toLocaleString('pt-BR', {
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                  })
                                : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">Em andamento</span>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setDetailModal(sep)}
                          title="Ver detalhes da rodada"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Modal de Detalhes da Rodada */}
      {detailModal && (
        <Dialog open={!!detailModal} onOpenChange={(open) => !open && setDetailModal(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  {detailModal.expand?.programacao_id?.name && (
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 font-mono block">
                      {detailModal.expand.programacao_id.name}
                    </span>
                  )}
                  <DialogTitle className="text-lg flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    {detailModal.expand?.programacao_id?.name
                      ? `Separação — ${detailModal.expand.programacao_id.name}`
                      : detailModal.title || 'Detalhes da Rodada'}
                  </DialogTitle>
                </div>
                {getStatusBadge(detailModal.status)}
              </div>
              <DialogDescription className="text-xs">
                {detailModal.expand?.programacao_id?.name && (
                  <span className="font-semibold text-foreground mr-1">
                    Vinculada à {detailModal.expand.programacao_id.name} |
                  </span>
                )}
                Criada em {new Date(detailModal.created).toLocaleString('pt-BR')} | OPs:{' '}
                {detailModal.op_numbers?.join(', ')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 flex-1 overflow-hidden flex flex-col">
              {/* KPIs rápidos */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-muted/40 rounded-lg border text-center">
                <div>
                  <span className="text-[11px] text-muted-foreground block font-medium">
                    Total de Itens
                  </span>
                  <span className="text-lg font-bold">{detailModal.items?.length || 0}</span>
                </div>
                <div>
                  <span className="text-[11px] text-emerald-600 block font-medium">
                    🟢 Separados (Kit)
                  </span>
                  <span className="text-lg font-bold text-emerald-600">
                    {detailModal.separated_count || 0}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-rose-600 block font-medium">
                    🔴 Faltas enviadas
                  </span>
                  <span className="text-lg font-bold text-rose-600">
                    {detailModal.shortage_count || 0}
                  </span>
                </div>
              </div>

              {detailModal.notes && (
                <div className="text-xs p-2.5 bg-muted rounded-md border text-muted-foreground">
                  <strong>Observação:</strong> {detailModal.notes}
                </div>
              )}

              {/* Lista dos itens */}
              <div className="flex-1 min-h-0 border rounded-lg overflow-hidden flex flex-col">
                <div className="bg-muted px-3 py-2 border-b flex justify-between text-xs font-semibold text-muted-foreground">
                  <span>Itens da Separação</span>
                  <span>Status do Item</span>
                </div>
                <ScrollArea className="flex-1 max-h-72 p-2">
                  <div className="space-y-2">
                    {(detailModal.items || []).map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition-colors ${
                          item.status === 'separado'
                            ? 'bg-emerald-500/5 border-emerald-500/30'
                            : item.status === 'falta'
                              ? 'bg-rose-500/5 border-rose-500/30'
                              : 'bg-card border-border'
                        }`}
                      >
                        <div className="space-y-1 max-w-[70%]">
                          <div className="flex items-center gap-2">
                            {item.code ? (
                              <span className="font-mono font-semibold text-foreground">
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
                            <span>OPs: {item.op_numbers?.join(', ')}</span>
                            {item.cut_measurement && (
                              <Badge variant="outline" className="h-4 px-1 text-[9px]">
                                Corte: {item.cut_measurement}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-foreground text-xs">
                            {Number(item.total_quantity).toLocaleString('pt-BR', {
                              maximumFractionDigits: 2,
                            })}{' '}
                            {item.unit}
                          </span>
                          {item.status === 'separado' ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Separado
                            </Badge>
                          ) : item.status === 'falta' ? (
                            <Badge className="bg-rose-600 hover:bg-rose-600 text-white text-[10px] gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Falta
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Pendente
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {detailModal.shortage_count > 0 && (
                <div className="text-xs p-2.5 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 flex items-center justify-between">
                  <span>
                    <strong>{detailModal.shortage_count} faltas</strong> foram registradas
                    automaticamente na Triagem de Suprimentos (/pcp/suprimentos/solicitacoes).
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-rose-700 dark:text-rose-400 font-semibold gap-1"
                    onClick={() => {
                      window.open('/pcp/suprimentos/solicitacoes', '_blank')
                    }}
                  >
                    Ver Triagem
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  )
}
