import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Package,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Layers,
  Loader2,
  RotateCcw,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  MaterialSeparation,
  SeparationItem,
  getSeparations,
  updateSeparationItems,
  finalizeSeparation,
} from '@/services/material-separations'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'

export function OperatorSeparationTab() {
  const [separations, setSeparations] = useState<MaterialSeparation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSeparation, setActiveSeparation] = useState<MaterialSeparation | null>(null)
  const [itemsDraft, setItemsDraft] = useState<SeparationItem[]>([])
  const [savingProgress, setSavingProgress] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [confirmFinalizeOpen, setConfirmFinalizeOpen] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
  const [opsExpanded, setOpsExpanded] = useState(false)
  const isMobile = useIsMobile()

  const loadData = async () => {
    try {
      setLoading(true)
      // Operador foca nas rodadas Pendente ou Em_Separacao, mas pode ver Concluidas recentes
      const list = await getSeparations()
      setSeparations(list)

      // Se temos uma rodada ativa aberta, atualizar seus dados sem perder os clicks locais
      if (activeSeparation) {
        const fresh = list.find((s) => s.id === activeSeparation.id)
        if (fresh && fresh.status === 'Concluida' && activeSeparation.status !== 'Concluida') {
          setActiveSeparation(fresh)
          setItemsDraft(fresh.items || [])
        }
      }
    } catch (err) {
      console.error('Erro ao carregar separações:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

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

  const openSeparationModal = (sep: MaterialSeparation) => {
    setActiveSeparation(sep)
    setOpsExpanded(false)
    setFilterQuery('')
    // Cria cópia profunda dos itens para manipulação local
    setItemsDraft(
      (sep.items || []).map((item) => ({
        ...item,
        status: item.status || 'pendente',
      })),
    )

    // Se estiver Pendente e o operador abriu, podemos colocar como Em_Separacao no backend
    if (sep.status === 'Pendente') {
      pb.collection('material_separations')
        .update(sep.id, { status: 'Em_Separacao' })
        .then(() => loadData())
        .catch(() => {})
    }
  }

  const handleToggleItemStatus = (itemId: string, newStatus: 'separado' | 'falta') => {
    setItemsDraft((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          // Se já está no status clicado, permite voltar atrás (desmarcar para 'pendente')
          const currentStatus = item.status
          const nextStatus = currentStatus === newStatus ? 'pendente' : newStatus
          return {
            ...item,
            status: nextStatus,
            marked_at: nextStatus !== 'pendente' ? new Date().toISOString() : undefined,
          }
        }
        return item
      }),
    )
  }

  const handleMarkAllSeparated = () => {
    setItemsDraft((prev) =>
      prev.map((item) => ({
        ...item,
        status: 'separado',
        marked_at: new Date().toISOString(),
      })),
    )
  }

  const handleResetAll = () => {
    setItemsDraft((prev) =>
      prev.map((item) => ({
        ...item,
        status: 'pendente',
        marked_at: undefined,
      })),
    )
  }

  const handleSaveProgress = async () => {
    if (!activeSeparation) return
    try {
      setSavingProgress(true)
      await updateSeparationItems(activeSeparation.id, itemsDraft, 'Em_Separacao')
      toast({
        title: 'Progresso Salvo',
        description: 'Você pode continuar a separação a qualquer momento.',
      })
      loadData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o progresso.',
        variant: 'destructive',
      })
    } finally {
      setSavingProgress(false)
    }
  }

  const handleConfirmFinalize = async () => {
    if (!activeSeparation) return
    try {
      setFinalizing(true)
      const res = await finalizeSeparation(activeSeparation.id, itemsDraft)

      toast({
        title: 'Separação Finalizada com Sucesso!',
        description: `${res.separation.separated_count} itens separados. ${res.shortagesCreatedCount} faltas encaminhadas para a Triagem de Suprimentos.`,
      })

      setConfirmFinalizeOpen(false)
      setActiveSeparation(null)
      loadData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao finalizar separação',
        description: 'Não foi possível concluir a rodada.',
        variant: 'destructive',
      })
    } finally {
      setFinalizing(false)
    }
  }

  // Contadores do rascunho atual
  const countSeparated = itemsDraft.filter((i) => i.status === 'separado').length
  const countShortage = itemsDraft.filter((i) => i.status === 'falta').length
  const countPending = itemsDraft.filter((i) => !i.status || i.status === 'pendente').length
  const totalDraft = itemsDraft.length

  // Itens filtrados para busca opcional
  const filteredItemsDraft = useMemo(() => {
    if (!filterQuery.trim()) return itemsDraft
    const q = filterQuery.toLowerCase()
    return itemsDraft.filter((item) => {
      const codeMatch = item.code?.toLowerCase().includes(q)
      const descMatch = item.description?.toLowerCase().includes(q)
      const opMatch = item.op_numbers?.some((op) => op.toLowerCase().includes(q))
      return codeMatch || descMatch || opMatch
    })
  }, [itemsDraft, filterQuery])

  const pendingSeparations = separations.filter(
    (s) => s.status === 'Pendente' || s.status === 'Em_Separacao',
  )
  const finishedSeparations = separations.filter((s) => s.status === 'Concluida')

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/40 p-4 rounded-xl border">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
            <Package className="h-6 w-6 text-emerald-600" />
            Separação Física de Materiais
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Abra uma rodada programada pelo gestor para conferir e separar os materiais no estoque
            físico.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadData}
          disabled={loading}
          className="h-9 gap-1.5 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar Rodadas
        </Button>
      </div>

      {/* SEÇÃO 1: RODADAS PENDENTES E EM SEPARAÇÃO */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <span>Rodadas Pendentes para Separação</span>
            <Badge variant="secondary" className="font-mono text-xs">
              {pendingSeparations.length}
            </Badge>
          </h3>
        </div>

        {pendingSeparations.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-sm text-muted-foreground space-y-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-1 opacity-70" />
              <div className="font-semibold text-foreground">Tudo em dia!</div>
              <div>Nenhuma rodada de separação pendente no momento.</div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingSeparations.map((sep) => {
              const isEmSeparacao = sep.status === 'Em_Separacao'
              const totalItems = sep.total_items_count || sep.items?.length || 0
              const sepCount = sep.separated_count || 0
              const shortCount = sep.shortage_count || 0
              const progName = sep.expand?.programacao_id?.name

              return (
                <Card
                  key={sep.id}
                  className={`border-2 transition-all shadow-sm hover:shadow-md flex flex-col justify-between ${
                    isEmSeparacao ? 'border-blue-500/60 bg-blue-500/5' : 'border-border bg-card'
                  }`}
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        {progName && (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400">
                            <span className="size-2 rounded-full bg-blue-500 animate-pulse" />
                            <span>{progName}</span>
                          </div>
                        )}
                        <CardTitle className="text-base font-bold text-foreground leading-snug">
                          {progName
                            ? `Separação — ${progName}`
                            : sep.title || `Separação (${sep.op_numbers?.length || 0} OPs)`}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {sep.created
                            ? new Date(sep.created).toLocaleString('pt-BR', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : ''}
                        </CardDescription>
                      </div>

                      {isEmSeparacao ? (
                        <Badge className="bg-blue-600 text-white text-xs gap-1">
                          <Layers className="h-3 w-3 animate-pulse" />
                          Em Separação
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs gap-1"
                        >
                          <Clock className="h-3 w-3" />
                          Pendente
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 pt-1 space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">OPs:</span>{' '}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(sep.op_numbers || []).slice(0, 6).map((op) => (
                            <Badge
                              key={op}
                              variant="secondary"
                              className="font-mono text-[11px] px-1.5 py-0 h-5"
                            >
                              OP {op}
                            </Badge>
                          ))}
                          {(sep.op_numbers || []).length > 6 && (
                            <Badge variant="outline" className="text-[11px] px-1 h-5">
                              +{(sep.op_numbers || []).length - 6}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {sep.notes && (
                        <div className="p-2 rounded bg-muted/60 text-[11px] text-muted-foreground border">
                          <strong>Obs:</strong> {sep.notes}
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-1 p-2 rounded-lg bg-muted/40 border text-center text-xs">
                        <div>
                          <span className="text-[10px] text-muted-foreground block">
                            Total Itens
                          </span>
                          <span className="font-bold">{totalItems}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-600 block">Separados</span>
                          <span className="font-bold text-emerald-600">{sepCount}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-rose-600 block">Faltas</span>
                          <span className="font-bold text-rose-600">{shortCount}</span>
                        </div>
                      </div>
                    </div>

                    <Button
                      className="w-full mt-2 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 shadow-sm"
                      onClick={() => openSeparationModal(sep)}
                    >
                      <Package className="h-4 w-4" />
                      {isEmSeparacao ? 'Continuar Separação' : 'Iniciar Separação'}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* SEÇÃO 2: HISTÓRICO DE RODADAS CONCLUÍDAS */}
      {finishedSeparations.length > 0 && (
        <div className="space-y-3 pt-6 border-t">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <span>Histórico de Rodadas Concluídas</span>
              <Badge variant="outline" className="font-mono text-xs">
                {finishedSeparations.length}
              </Badge>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {finishedSeparations.slice(0, 6).map((sep) => (
              <Card
                key={sep.id}
                className="border bg-muted/20 opacity-90 hover:opacity-100 transition-opacity"
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      {sep.expand?.programacao_id?.name && (
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 block font-mono">
                          {sep.expand.programacao_id.name}
                        </span>
                      )}
                      <CardTitle className="text-sm font-semibold text-foreground">
                        {sep.expand?.programacao_id?.name
                          ? `Separação — ${sep.expand.programacao_id.name}`
                          : sep.title || `Separação (${sep.op_numbers?.length || 0} OPs)`}
                      </CardTitle>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[11px] gap-1 shrink-0"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Concluída
                    </Badge>
                  </div>
                  <CardDescription className="text-[11px]">
                    Finalizada em{' '}
                    {sep.finished_at ? new Date(sep.finished_at).toLocaleString('pt-BR') : '-'}
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-4 pt-1 space-y-2">
                  <div className="flex items-center justify-between text-xs p-2 bg-muted/50 rounded border">
                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {sep.separated_count || 0} separados
                    </span>
                    <span className="text-rose-600 font-semibold flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {sep.shortage_count || 0} faltas
                    </span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8"
                    onClick={() => openSeparationModal(sep)}
                  >
                    Ver Itens da Rodada
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* VISUALIZAÇÃO DE SEPARAÇÃO: FULL-SCREEN NATIVO NO MOBILE / DIALOG NO DESKTOP */}
      {activeSeparation && isMobile ? (
        /* ================= TELA CHEIA MOBILE ================= */
        <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden animate-in fade-in-0 duration-200">
          {/* CABEÇALHO COMPACTO MOBILE */}
          <div className="bg-card border-b px-3 py-2.5 shrink-0 space-y-2 shadow-sm">
            {/* Linha 1: Título da Programação, status badge e botão fechar */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Package className="h-5 w-5 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <h1 className="font-bold text-sm text-foreground truncate leading-tight">
                    {activeSeparation.expand?.programacao_id?.name ||
                      activeSeparation.title ||
                      'Separação de Materiais'}
                  </h1>
                  {activeSeparation.created && (
                    <span className="text-[10px] text-muted-foreground block">
                      {new Date(activeSeparation.created).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {activeSeparation.status === 'Concluida' ? (
                  <Badge className="bg-emerald-600 text-white text-[10px] h-6 px-2">
                    Concluída
                  </Badge>
                ) : (
                  <Badge className="bg-blue-600 text-white text-[10px] h-6 px-2">
                    Em Separação
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                  onClick={() => setActiveSeparation(null)}
                  aria-label="Fechar tela de separação"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Linha 2: OPs colapsáveis ("13 OPs" expansível ao toque) */}
            {(activeSeparation.op_numbers?.length || 0) > 0 && (
              <div className="text-xs">
                <button
                  type="button"
                  onClick={() => setOpsExpanded(!opsExpanded)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline py-0.5"
                >
                  <Layers className="h-3 w-3" />
                  <span>{activeSeparation.op_numbers?.length || 0} OPs na rodada</span>
                  {opsExpanded ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>

                {opsExpanded && (
                  <div className="mt-1.5 p-2 rounded-lg bg-muted/60 border text-[11px] max-h-28 overflow-y-auto space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground block">
                      Ordens de Produção vinculadas:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {activeSeparation.op_numbers?.map((op) => (
                        <Badge
                          key={op}
                          variant="secondary"
                          className="font-mono text-[10px] px-1.5 py-0 h-4"
                        >
                          OP {op}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Linha 3: Contadores em UMA LINHA COMPACTA (Total / Separados / Faltas / Pendentes) */}
            <div className="grid grid-cols-4 gap-1.5 text-center">
              <div className="px-1.5 py-1 rounded bg-muted/50 border">
                <span className="text-[9px] text-muted-foreground block leading-tight font-medium truncate">
                  Total
                </span>
                <span className="text-sm font-bold text-foreground leading-tight">
                  {totalDraft}
                </span>
              </div>
              <div className="px-1.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30">
                <span className="text-[9px] text-emerald-700 dark:text-emerald-400 block leading-tight font-medium truncate">
                  🟢 Separados
                </span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 leading-tight">
                  {countSeparated}
                </span>
              </div>
              <div className="px-1.5 py-1 rounded bg-rose-500/10 border border-rose-500/30">
                <span className="text-[9px] text-rose-700 dark:text-rose-400 block leading-tight font-medium truncate">
                  🔴 Faltas
                </span>
                <span className="text-sm font-bold text-rose-600 dark:text-rose-400 leading-tight">
                  {countShortage}
                </span>
              </div>
              <div className="px-1.5 py-1 rounded bg-amber-500/10 border border-amber-500/30">
                <span className="text-[9px] text-amber-700 dark:text-amber-400 block leading-tight font-medium truncate">
                  ⏳ Pendentes
                </span>
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400 leading-tight">
                  {countPending}
                </span>
              </div>
            </div>

            {/* Ações em lote e busca rápida compacta */}
            {activeSeparation.status !== 'Concluida' && (
              <div className="flex items-center justify-between gap-1.5 pt-0.5">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleMarkAllSeparated}
                    className="h-7 text-[10px] px-2 gap-1 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Marcar todos Separados
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResetAll}
                    className="h-7 text-[10px] px-1.5 gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Limpar
                  </Button>
                </div>

                {/* Filtro rápido se a lista for grande */}
                {itemsDraft.length > 10 && (
                  <div className="relative flex-1 max-w-[130px]">
                    <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Filtrar..."
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                      className="h-7 w-full pl-5 pr-1.5 text-[10px] bg-muted/40 rounded border border-input focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* LISTA MOBILE: ROLAGEM NATIVA POR TOQUE (overflow-y-auto com touch-pan-y) */}
          <div
            className="flex-1 overflow-y-auto touch-pan-y overscroll-contain p-3 space-y-2.5 pb-24"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {filteredItemsDraft.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground border-2 border-dashed rounded-xl my-4">
                {filterQuery
                  ? 'Nenhum material encontrado com o filtro aplicado.'
                  : 'Nenhum material nesta rodada.'}
              </div>
            ) : (
              filteredItemsDraft.map((item, index) => {
                const isSeparated = item.status === 'separado'
                const isShortage = item.status === 'falta'
                const isReadOnly = activeSeparation.status === 'Concluida'

                return (
                  <div
                    key={item.id || index}
                    className={`p-3 rounded-xl border transition-colors shadow-sm flex flex-col gap-2.5 ${
                      isSeparated
                        ? 'bg-emerald-500/10 border-emerald-500/50'
                        : isShortage
                          ? 'bg-rose-500/10 border-rose-500/50'
                          : 'bg-card border-border'
                    }`}
                  >
                    {/* Código do material + status atual (se readonly ou marcado) */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {item.code ? (
                          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-muted text-foreground border">
                            {item.code}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">
                            s/ código
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">#{index + 1}</span>
                      </div>

                      {isSeparated && (
                        <Badge className="bg-emerald-600 text-white text-[10px] h-5 px-2 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Separado
                        </Badge>
                      )}
                      {isShortage && (
                        <Badge className="bg-rose-600 text-white text-[10px] h-5 px-2 gap-1">
                          <AlertTriangle className="h-3 w-3" /> Falta
                        </Badge>
                      )}
                      {!isSeparated && !isShortage && (
                        <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">
                          Pendente
                        </Badge>
                      )}
                    </div>

                    {/* Descrição em destaque */}
                    <div className="font-bold text-sm text-foreground leading-snug break-words">
                      {item.description}
                    </div>

                    {/* Qtd, OPs e Medida empilhados de forma limpa */}
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className="text-muted-foreground text-[11px]">Quantidade:</span>
                        <span className="font-bold text-foreground text-xs bg-muted px-2 py-0.5 rounded">
                          {Number(item.total_quantity).toLocaleString('pt-BR', {
                            maximumFractionDigits: 2,
                          })}{' '}
                          {item.unit}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground text-[11px]">OPs:</span>
                        <span className="font-mono font-medium text-foreground text-[11px] truncate max-w-[200px] text-right">
                          {item.op_numbers?.join(', ') || 'N/A'}
                        </span>
                      </div>

                      {item.cut_measurement && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground text-[11px]">Medida corte:</span>
                          <Badge
                            variant="secondary"
                            className="h-5 px-1.5 text-[10px] font-mono text-foreground"
                          >
                            {item.cut_measurement}
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* BOTÕES GRANDES PARA O CHÃO DE FÁBRICA (mínimo 44px de altura, fáceis de tocar) */}
                    {!isReadOnly && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button
                          type="button"
                          variant={isSeparated ? 'default' : 'outline'}
                          onClick={() => handleToggleItemStatus(item.id, 'separado')}
                          className={`min-h-[44px] h-11 text-xs font-bold gap-2 transition-all shadow-sm ${
                            isSeparated
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-500/50'
                              : 'border-2 border-emerald-600/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 active:bg-emerald-100'
                          }`}
                        >
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span>Separado</span>
                        </Button>

                        <Button
                          type="button"
                          variant={isShortage ? 'default' : 'outline'}
                          onClick={() => handleToggleItemStatus(item.id, 'falta')}
                          className={`min-h-[44px] h-11 text-xs font-bold gap-2 transition-all shadow-sm ${
                            isShortage
                              ? 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-500/50'
                              : 'border-2 border-rose-600/50 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:bg-rose-100'
                          }`}
                        >
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>Falta</span>
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* RODAPÉ FIXO NO MOBILE (sticky bottom, sempre visível sem rolar) */}
          <div className="fixed bottom-0 left-0 right-0 z-20 bg-background/95 backdrop-blur border-t p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-lg space-y-1.5">
            <div className="text-[11px] text-muted-foreground text-center truncate">
              {activeSeparation.status !== 'Concluida' ? (
                countPending > 0 ? (
                  <span>
                    Restam <strong>{countPending}</strong> itens pendentes de conferência.
                  </span>
                ) : (
                  <span className="text-emerald-600 font-semibold">
                    ✓ Todos os itens conferidos!
                  </span>
                )
              ) : (
                <span>Rodada concluída no histórico.</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 px-3 text-xs shrink-0"
                onClick={() => setActiveSeparation(null)}
              >
                Voltar
              </Button>

              {activeSeparation.status !== 'Concluida' && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 flex-1 text-xs font-medium gap-1"
                    onClick={handleSaveProgress}
                    disabled={savingProgress || finalizing}
                  >
                    {savingProgress ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      'Salvar Progresso'
                    )}
                  </Button>

                  <Button
                    type="button"
                    className="h-11 flex-1 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow"
                    onClick={() => setConfirmFinalizeOpen(true)}
                    disabled={savingProgress || finalizing || totalDraft === 0}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Finalizar
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : activeSeparation ? (
        /* ================= MODAL DESKTOP (preservado) ================= */
        <Dialog
          open={!!activeSeparation}
          onOpenChange={(open) => !open && setActiveSeparation(null)}
        >
          <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-4 sm:p-6">
            <DialogHeader className="border-b pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="space-y-0.5">
                  <DialogTitle className="text-xl flex items-center gap-2">
                    <Package className="h-5 w-5 text-emerald-600" />
                    {activeSeparation.expand?.programacao_id?.name
                      ? `Separação — ${activeSeparation.expand.programacao_id.name}`
                      : activeSeparation.title || 'Separação de Materiais'}
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    {activeSeparation.expand?.programacao_id?.name && (
                      <span className="font-semibold text-foreground mr-2">
                        Vinculada à {activeSeparation.expand.programacao_id.name} |
                      </span>
                    )}
                    OPs: {activeSeparation.op_numbers?.join(', ')}
                  </DialogDescription>
                </div>

                <div className="flex items-center gap-2">
                  {activeSeparation.status === 'Concluida' ? (
                    <Badge className="bg-emerald-600 text-white">Concluída</Badge>
                  ) : (
                    <Badge className="bg-blue-600 text-white">Em Separação</Badge>
                  )}
                </div>
              </div>

              {/* BARRA DE PROGRESSO E CONTADORES */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                <div className="p-2 bg-muted/50 rounded-lg border text-center">
                  <span className="text-[10px] text-muted-foreground block font-medium">
                    Total de Itens
                  </span>
                  <span className="text-base font-bold text-foreground">{totalDraft}</span>
                </div>
                <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-center">
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 block font-medium">
                    🟢 Separados
                  </span>
                  <span className="text-base font-bold text-emerald-600">{countSeparated}</span>
                </div>
                <div className="p-2 bg-rose-500/10 rounded-lg border border-rose-500/20 text-center">
                  <span className="text-[10px] text-rose-700 dark:text-rose-400 block font-medium">
                    🔴 Faltas
                  </span>
                  <span className="text-base font-bold text-rose-600">{countShortage}</span>
                </div>
                <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20 text-center">
                  <span className="text-[10px] text-amber-700 dark:text-amber-400 block font-medium">
                    ⏳ Pendentes
                  </span>
                  <span className="text-base font-bold text-amber-600">{countPending}</span>
                </div>
              </div>

              {/* ATALHOS RÁPIDOS SE A RODADA NÃO ESTIVER CONCLUÍDA */}
              {activeSeparation.status !== 'Concluida' && (
                <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                  <div className="text-xs text-muted-foreground">
                    Marque <strong>Separado</strong> para itens em estoque ou <strong>Falta</strong>{' '}
                    para os faltantes. Clique novamente para desmarcar.
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleMarkAllSeparated}
                      className="h-7 text-[11px] gap-1 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Marcar todos como Separados
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleResetAll}
                      className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Limpar marcações
                    </Button>
                  </div>
                </div>
              )}
            </DialogHeader>

            {/* LISTA INTERATIVA DE ITENS */}
            <div className="flex-1 min-h-0 flex flex-col py-2">
              <ScrollArea className="flex-1 max-h-[50vh] pr-2">
                <div className="space-y-2">
                  {itemsDraft.map((item, index) => {
                    const isSeparated = item.status === 'separado'
                    const isShortage = item.status === 'falta'
                    const isReadOnly = activeSeparation.status === 'Concluida'

                    return (
                      <div
                        key={item.id || index}
                        className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isSeparated
                            ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm'
                            : isShortage
                              ? 'bg-rose-500/10 border-rose-500/40 shadow-sm'
                              : 'bg-card border-border hover:border-slate-400/50'
                        }`}
                      >
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {item.code ? (
                              <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-muted text-foreground">
                                {item.code}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                s/ código
                              </span>
                            )}
                            <span className="font-semibold text-sm text-foreground break-words">
                              {item.description}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1 font-mono font-semibold text-foreground">
                              OPs: {item.op_numbers?.join(', ') || 'N/A'}
                            </span>

                            {item.cut_measurement && (
                              <Badge
                                variant="secondary"
                                className="h-5 px-1.5 text-[10px] font-mono"
                              >
                                Medida de corte: {item.cut_measurement}
                              </Badge>
                            )}

                            <span className="font-semibold text-foreground bg-muted/80 px-2 py-0.5 rounded text-xs">
                              Qtd:{' '}
                              {Number(item.total_quantity).toLocaleString('pt-BR', {
                                maximumFractionDigits: 2,
                              })}{' '}
                              {item.unit}
                            </span>
                          </div>
                        </div>

                        {/* BOTÕES DE AÇÃO DO OPERADOR: 🟢 SEPARADO / 🔴 FALTA */}
                        {!isReadOnly ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant={isSeparated ? 'default' : 'outline'}
                              onClick={() => handleToggleItemStatus(item.id, 'separado')}
                              className={`h-9 px-3 gap-1.5 font-bold transition-all text-xs ${
                                isSeparated
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-500/30 shadow'
                                  : 'border-emerald-600/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                              }`}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Separado
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant={isShortage ? 'default' : 'outline'}
                              onClick={() => handleToggleItemStatus(item.id, 'falta')}
                              className={`h-9 px-3 gap-1.5 font-bold transition-all text-xs ${
                                isShortage
                                  ? 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-500/30 shadow'
                                  : 'border-rose-600/40 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                              }`}
                            >
                              <AlertTriangle className="h-4 w-4" />
                              Falta
                            </Button>
                          </div>
                        ) : (
                          <div className="shrink-0">
                            {isSeparated ? (
                              <Badge className="bg-emerald-600 text-white text-xs gap-1 py-1 px-2.5">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Separado
                              </Badge>
                            ) : isShortage ? (
                              <Badge className="bg-rose-600 text-white text-xs gap-1 py-1 px-2.5">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Falta
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                Pendente
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* RODAPÉ COM AÇÕES EXPLÍCITAS */}
            <DialogFooter className="border-t pt-3 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground w-full sm:w-auto text-left">
                {activeSeparation.status !== 'Concluida' ? (
                  <span>
                    {countPending > 0
                      ? `Ainda restam ${countPending} itens pendentes de conferência.`
                      : 'Todos os itens foram conferidos! Pronto para finalizar.'}
                  </span>
                ) : (
                  <span>Rodada concluída. Registros gravados no histórico.</span>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveSeparation(null)}
                >
                  Fechar
                </Button>

                {activeSeparation.status !== 'Concluida' && (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleSaveProgress}
                      disabled={savingProgress || finalizing}
                      className="gap-1.5"
                    >
                      {savingProgress ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        'Salvar Progresso'
                      )}
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setConfirmFinalizeOpen(true)}
                      disabled={savingProgress || finalizing || totalDraft === 0}
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Finalizar Separação
                    </Button>
                  </>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* MODAL DE CONFIRMAÇÃO EXPLÍCITA ANTES DE FINALIZAR A RODADA */}
      {confirmFinalizeOpen && (
        <Dialog open={confirmFinalizeOpen} onOpenChange={setConfirmFinalizeOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
                <DialogTitle>Confirmar Finalização da Separação</DialogTitle>
              </div>
              <DialogDescription className="text-xs">
                Revise o resumo antes de gravar. Nada é gravado sem clique explícito.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-sm">
              <div className="p-3 rounded-lg bg-muted/50 border space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">🟢 Itens Separados (Kit da rodada):</span>
                  <strong className="text-emerald-600 font-bold">{countSeparated}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    🔴 Itens em Falta (serão enviados para Suprimentos):
                  </span>
                  <strong className="text-rose-600 font-bold">{countShortage}</strong>
                </div>
                {countPending > 0 && (
                  <div className="flex justify-between text-amber-600 font-medium">
                    <span>⏳ Itens não marcados (permanecerão pendentes):</span>
                    <strong>{countPending}</strong>
                  </div>
                )}
              </div>

              {countShortage > 0 && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 text-xs flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Os <strong>{countShortage} itens de falta</strong> serão registrados
                    automaticamente na <strong>Triagem de Solicitações</strong> de Suprimentos para
                    compra ou uso de estoque.
                  </span>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmFinalizeOpen(false)}
                disabled={finalizing}
              >
                Voltar e Revisar
              </Button>
              <Button
                type="button"
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                onClick={handleConfirmFinalize}
                disabled={finalizing}
              >
                {finalizing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Finalizando e gravando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Confirmar e Finalizar Rodada
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
