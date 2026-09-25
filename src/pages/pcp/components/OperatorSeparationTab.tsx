import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { NoTranslate } from '@/components/NoTranslate'
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
import {
  searchUnifiedComponentsWithStock,
  UnifiedComponentSearchResult,
} from '@/services/components'
import { logSeparationAction } from '@/services/pcp-separation-audit'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeftRight } from 'lucide-react'
import {
  getStockAvailabilityForCodes,
  ComponentStockAvailability,
  normalizeCode,
} from '@/services/material-reservations'
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
  const [stockAvailabilityMap, setStockAvailabilityMap] = useState<
    Map<string, ComponentStockAvailability>
  >(new Map())
  const isMobile = useIsMobile()

  // Estado do Diálogo de Falta Parcial
  const [partialDialogOpen, setPartialDialogOpen] = useState(false)
  const [partialItem, setPartialItem] = useState<SeparationItem | null>(null)
  const [stockNowInput, setStockNowInput] = useState<string>('')
  const [partialSaving, setPartialSaving] = useState(false)

  // Estado do Diálogo de Troca / Substituição
  const [swapDialogOpen, setSwapDialogOpen] = useState(false)
  const [swapOriginalItem, setSwapOriginalItem] = useState<SeparationItem | null>(null)
  const [swapSearchTerm, setSwapSearchTerm] = useState('')
  const [swapSearching, setSwapSearching] = useState(false)
  const [swapResults, setSwapResults] = useState<UnifiedComponentSearchResult[]>([])
  const [selectedSubstitute, setSelectedSubstitute] = useState<UnifiedComponentSearchResult | null>(
    null,
  )
  const [substituteQtyInput, setSubstituteQtyInput] = useState<string>('')
  const [swapSaving, setSwapSaving] = useState(false)

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

    pb.collection('material_reservations')
      .subscribe('*', () => {
        if (activeSeparation) {
          refreshAvailability(itemsDraft)
        }
      })
      .catch(() => {})

    return () => {
      pb.collection('material_separations')
        .unsubscribe('*')
        .catch(() => {})
      pb.collection('material_reservations')
        .unsubscribe('*')
        .catch(() => {})
    }
  }, [])

  const refreshAvailability = async (items: SeparationItem[]) => {
    const codes = items.map((i) => i.code).filter(Boolean)
    if (codes.length === 0) return
    const map = await getStockAvailabilityForCodes(codes)
    setStockAvailabilityMap(map)
  }

  const openSeparationModal = (sep: MaterialSeparation) => {
    setActiveSeparation(sep)
    setOpsExpanded(false)
    setFilterQuery('')
    const draft = (sep.items || []).map((item) => ({
      ...item,
      status: item.status || 'pendente',
    }))
    // Cria cópia profunda dos itens para manipulação local
    setItemsDraft(draft)

    // Carregar disponibilidade de estoque em tempo real para os itens
    refreshAvailability(draft)

    // Se estiver Pendente e o operador abriu, podemos colocar como Em_Separacao no backend
    if (sep.status === 'Pendente') {
      pb.collection('material_separations')
        .update(sep.id, { status: 'Em_Separacao' })
        .then(() => loadData())
        .catch(() => {})
    }
  }

  // Abertura do diálogo de Falta Parcial
  const handleOpenFaltaDialog = (item: SeparationItem) => {
    setPartialItem(item)
    // Pré-preenchido com o total solicitado (como pedido pelo usuário)
    setStockNowInput(String(item.total_quantity ?? 0))
    setPartialDialogOpen(true)
  }

  // Confirmação de Falta Parcial / Total
  const handleConfirmFaltaParcial = async () => {
    if (!partialItem) return
    const totalRequested = Number(partialItem.total_quantity) || 0
    const inStock = Number(stockNowInput.replace(',', '.'))

    if (isNaN(inStock) || inStock < 0) {
      toast({
        title: 'Quantidade inválida',
        description: 'Informe um valor maior ou igual a zero.',
        variant: 'destructive',
      })
      return
    }

    if (inStock > totalRequested) {
      toast({
        title: 'Quantidade acima do solicitado',
        description: `O solicitado é ${totalRequested} ${partialItem.unit || 'UN'}. Você não pode informar um valor maior.`,
        variant: 'destructive',
      })
      return
    }

    setPartialSaving(true)
    try {
      const operatorName = pb.authStore.record?.name || pb.authStore.record?.email || 'Operador'
      const unit = partialItem.unit || 'UN'

      // CASO A: Tem em estoque = totalRequested -> o operador confirmou sem alterar (falta total) OU se inStock = 0
      // "ao confirmar sem alterar vira falta total... se quantidade = 0 tratar como falta total de hoje"
      const isTotalShortage = inStock === 0 || inStock === totalRequested

      if (isTotalShortage) {
        // Falta Total
        setItemsDraft((prev) => {
          const nextList: SeparationItem[] = prev.map((it) => {
            if (it.id === partialItem.id) {
              return {
                ...it,
                status: 'falta',
                separated_quantity: 0,
                shortage_quantity: totalRequested,
                marked_at: new Date().toISOString(),
                marked_by: pb.authStore.record?.id,
                notes: `Falta total registrada pelo operador (${totalRequested} ${unit}).`,
              }
            }
            return it
          })
          if (activeSeparation) {
            updateSeparationItems(activeSeparation.id, nextList, 'Em_Separacao').catch(() => {})
          }
          return nextList
        })

        toast({
          title: 'Falta total registrada',
          description: `Item marcado com Falta de ${totalRequested} ${unit}. Solicitação será enviada a Suprimentos.`,
        })
      } else {
        // Falta Parcial real (0 < inStock < totalRequested)
        const separatedQty = inStock
        const missingQty = Number((totalRequested - separatedQty).toFixed(4))

        setItemsDraft((prev) => {
          const nextList: SeparationItem[] = prev.map((it) => {
            if (it.id === partialItem.id) {
              return {
                ...it,
                status: 'parcial',
                separated_quantity: separatedQty,
                shortage_quantity: missingQty,
                marked_at: new Date().toISOString(),
                marked_by: pb.authStore.record?.id,
                notes: `Parcial: ${separatedQty}/${totalRequested} ${unit} separados · ${missingQty} ${unit} em solicitação.`,
              }
            }
            return it
          })
          if (activeSeparation) {
            updateSeparationItems(activeSeparation.id, nextList, 'Em_Separacao').catch(() => {})
          }
          return nextList
        })

        // Auditoria em pcp_order_logs para cada OP envolvida
        try {
          await logSeparationAction({
            orderIds: partialItem.order_ids || [],
            opNumbers: partialItem.op_numbers || [],
            action: 'Separação - Falta Parcial',
            itemOriginal: {
              code: partialItem.code,
              description: partialItem.description,
              quantityRequested: totalRequested,
              unit: partialItem.unit,
              cutMeasurement: partialItem.cut_measurement,
            },
            separatedQuantity: separatedQty,
            shortageQuantity: missingQty,
            operatorName,
            notes: `Falta parcial na rodada de separação: ${separatedQty} ${unit} separados no estoque e ${missingQty} ${unit} em solicitação.`,
          })
        } catch (logErr) {
          console.error('Erro ao auditar falta parcial:', logErr)
        }

        toast({
          title: 'Falta Parcial registrada!',
          description: `${separatedQty}/${totalRequested} ${unit} separados com reserva · ${missingQty} ${unit} em solicitação.`,
        })
      }

      setPartialDialogOpen(false)
      setPartialItem(null)
    } finally {
      setPartialSaving(false)
    }
  }

  // Abertura do diálogo de Troca / Substituição
  const handleOpenSwapDialog = (item: SeparationItem) => {
    setSwapOriginalItem(item)
    setSwapSearchTerm('')
    setSwapResults([])
    setSelectedSubstitute(null)
    setSubstituteQtyInput(String(item.total_quantity ?? 0))
    setSwapDialogOpen(true)
  }

  // Busca de componentes cadastrados no sistema oficial
  const handleSearchSubstitutes = async (term: string) => {
    setSwapSearchTerm(term)
    if (!term.trim() || term.trim().length < 2) {
      setSwapResults([])
      return
    }
    setSwapSearching(true)
    try {
      const results = await searchUnifiedComponentsWithStock(term, 25)
      setSwapResults(results)
    } catch (err) {
      console.error('Erro ao buscar componentes para substituição:', err)
      toast({
        title: 'Erro na busca',
        description: 'Não foi possível carregar os componentes cadastrados.',
        variant: 'destructive',
      })
    } finally {
      setSwapSearching(false)
    }
  }

  // Confirmação de Substituição
  const handleConfirmSubstitution = async () => {
    if (!swapOriginalItem || !selectedSubstitute) return
    const substituteQty = Number(substituteQtyInput.replace(',', '.'))
    if (isNaN(substituteQty) || substituteQty <= 0) {
      toast({
        title: 'Quantidade inválida',
        description: 'Informe uma quantidade válida para o componente substituto.',
        variant: 'destructive',
      })
      return
    }

    setSwapSaving(true)
    try {
      const operatorName = pb.authStore.record?.name || pb.authStore.record?.email || 'Operador'
      const origCode = swapOriginalItem.code || 's/ código'
      const origDesc = swapOriginalItem.description
      const origQty = swapOriginalItem.total_quantity
      const subCode = selectedSubstitute.code || 's/ código'
      const subDesc = selectedSubstitute.description
      const subUnit = selectedSubstitute.unit || swapOriginalItem.unit || 'UN'

      // Cria novo item substituto na mesma rodada herdando as OPs
      const substituteItem: SeparationItem = {
        id: `swap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        code: selectedSubstitute.code || '',
        description: selectedSubstitute.description,
        total_quantity: substituteQty,
        unit: subUnit,
        cut_measurement: null,
        op_numbers: [...(swapOriginalItem.op_numbers || [])],
        order_ids: [...(swapOriginalItem.order_ids || [])],
        status: 'pendente',
        notes: `Substituto oficial de [${origCode}] ${origDesc}`,
        is_substitution: true,
        original_item_id: swapOriginalItem.id,
      }

      setItemsDraft((prev) => {
        const nextList: SeparationItem[] = prev.map((it) => {
          if (it.id === swapOriginalItem.id) {
            // O item ORIGINAL fica marcado como substituído e NÃO gera solicitação de compra
            return {
              ...it,
              status: 'substituido' as any,
              notes: `Substituído por [${subCode}] ${subDesc}`,
              replaced_by_code: subCode,
              replaced_by_description: subDesc,
              marked_at: new Date().toISOString(),
              marked_by: pb.authStore.record?.id,
            }
          }
          return it
        })

        // Insere o substituto logo após o item original
        const origIdx = nextList.findIndex((i) => i.id === swapOriginalItem.id)
        if (origIdx >= 0) {
          nextList.splice(origIdx + 1, 0, substituteItem)
        } else {
          nextList.push(substituteItem)
        }

        if (activeSeparation) {
          updateSeparationItems(activeSeparation.id, nextList, 'Em_Separacao').catch(() => {})
        }
        return nextList
      })

      // Atualiza mapa de disponibilidade com o substituto
      if (substituteItem.code) {
        refreshAvailability([substituteItem])
      }

      // Auditoria em pcp_order_logs
      try {
        await logSeparationAction({
          orderIds: swapOriginalItem.order_ids || [],
          opNumbers: swapOriginalItem.op_numbers || [],
          action: 'Separação - Substituição de Componente',
          itemOriginal: {
            code: origCode,
            description: origDesc,
            quantityRequested: origQty,
            unit: swapOriginalItem.unit,
            cutMeasurement: swapOriginalItem.cut_measurement,
          },
          substitute: {
            code: subCode,
            description: subDesc,
            quantity: substituteQty,
            unit: subUnit,
          },
          operatorName,
          notes: `Substituição realizada na rodada de separação: ${origDesc} substituído por [${subCode}] ${subDesc}. O item substituto agora segue a conferência física normal.`,
        })
      } catch (logErr) {
        console.error('Erro ao auditar substituição de componente:', logErr)
      }

      toast({
        title: 'Componente Substituído!',
        description: `Substituto [${subCode}] adicionado à lista para conferência física. Original marcado como substituído.`,
      })

      setSwapDialogOpen(false)
      setSwapOriginalItem(null)
      setSelectedSubstitute(null)
    } finally {
      setSwapSaving(false)
    }
  }

  const handleToggleItemStatus = (itemId: string, newStatus: 'separado' | 'falta') => {
    const targetItem = itemsDraft.find((i) => i.id === itemId)
    if (!targetItem) return

    // Se clicar em Falta, abre o diálogo de confirmação conforme Requisito (1)
    if (newStatus === 'falta' && targetItem.status !== 'falta') {
      handleOpenFaltaDialog(targetItem)
      return
    }

    if (newStatus === 'separado' && targetItem.status !== 'separado') {
      // Verificar disponibilidade no momento da marcação
      const norm = normalizeCode(targetItem.code)
      const stockInfo = stockAvailabilityMap.get(norm)
      const available = stockInfo ? stockInfo.availableStock : 0
      const requested = Number(targetItem.total_quantity) || 0

      if (available < requested) {
        toast({
          title: 'Estoque insuficiente para separação!',
          description: `Disponível no momento: ${available} ${stockInfo?.unit || targetItem.unit || 'UN'}. Solicitado: ${requested}. Favor usar Falta (🔴) para informar falta parcial ou total.`,
          variant: 'destructive',
        })
      }
    }

    setItemsDraft((prev) => {
      const nextList: SeparationItem[] = prev.map((item) => {
        if (item.id === itemId) {
          // Se já está no status clicado, permite voltar atrás (desmarcar para 'pendente')
          const currentStatus = item.status
          const nextStatus = (
            currentStatus === newStatus ? 'pendente' : newStatus
          ) as SeparationItem['status']
          return {
            ...item,
            status: nextStatus,
            separated_quantity: nextStatus === 'separado' ? item.total_quantity : undefined,
            shortage_quantity: undefined,
            marked_at: nextStatus !== 'pendente' ? new Date().toISOString() : undefined,
          }
        }
        return item
      })

      // Sincronizar reservas no background se temos uma rodada ativa
      if (activeSeparation) {
        updateSeparationItems(activeSeparation.id, nextList, 'Em_Separacao').catch(() => {})
      }

      return nextList
    })
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
  const countPartial = itemsDraft.filter((i) => i.status === 'parcial').length
  const countShortage = itemsDraft.filter((i) => i.status === 'falta').length
  const countSubstituted = itemsDraft.filter((i) => i.status === 'substituido').length
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

            {/* Linha 3: Contadores em UMA LINHA COMPACTA (Total / Separados / Parciais / Faltas / Pendentes) */}
            <div className="grid grid-cols-5 gap-1 text-center">
              <div className="px-1 py-1 rounded bg-muted/50 border">
                <span className="text-[8px] text-muted-foreground block leading-tight font-medium truncate">
                  Total
                </span>
                <span className="text-xs font-bold text-foreground leading-tight">
                  {totalDraft}
                </span>
              </div>
              <div className="px-1 py-1 rounded bg-emerald-500/10 border border-emerald-500/30">
                <span className="text-[8px] text-emerald-700 dark:text-emerald-400 block leading-tight font-medium truncate">
                  🟢 Sep.
                </span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 leading-tight">
                  {countSeparated}
                </span>
              </div>
              <div className="px-1 py-1 rounded bg-amber-500/10 border border-amber-500/30">
                <span className="text-[8px] text-amber-700 dark:text-amber-400 block leading-tight font-medium truncate">
                  🟡 Parc.
                </span>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 leading-tight">
                  {countPartial}
                </span>
              </div>
              <div className="px-1 py-1 rounded bg-rose-500/10 border border-rose-500/30">
                <span className="text-[8px] text-rose-700 dark:text-rose-400 block leading-tight font-medium truncate">
                  🔴 Falta
                </span>
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400 leading-tight">
                  {countShortage}
                </span>
              </div>
              <div className="px-1 py-1 rounded bg-slate-500/10 border border-slate-500/30">
                <span className="text-[8px] text-muted-foreground block leading-tight font-medium truncate">
                  ⏳ Pend.
                </span>
                <span className="text-xs font-bold text-muted-foreground leading-tight">
                  {countPending}
                </span>
              </div>
            </div>

            {/* CAMPO DE BUSCA POR CÓDIGO E DESCRIÇÃO NO MOBILE (toque fácil ~44px de altura) */}
            <div className="relative pt-0.5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por código ou descrição..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="h-11 w-full pl-9 pr-9 text-xs sm:text-sm bg-muted/50 rounded-lg border border-input focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner"
              />
              {filterQuery && (
                <button
                  type="button"
                  onClick={() => setFilterQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Ações em lote compactas */}
            {activeSeparation.status !== 'Concluida' && (
              <div className="flex items-center justify-between gap-1.5 pt-0.5">
                <div className="flex items-center gap-1.5 w-full">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleMarkAllSeparated}
                    className="h-8 flex-1 text-[11px] px-2 gap-1 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Marcar todos Separados
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResetAll}
                    className="h-8 text-[11px] px-2 gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Limpar
                  </Button>
                </div>
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
                const isPartial = item.status === 'parcial'
                const isShortage = item.status === 'falta'
                const isSubstituted = item.status === 'substituido'
                const isReadOnly = activeSeparation.status === 'Concluida'

                return (
                  <div
                    key={item.id || index}
                    className={`p-3 rounded-xl border transition-colors shadow-sm flex flex-col gap-2.5 ${
                      isSeparated
                        ? 'bg-emerald-500/10 border-emerald-500/50'
                        : isPartial
                          ? 'bg-amber-500/10 border-amber-500/50'
                          : isShortage
                            ? 'bg-rose-500/10 border-rose-500/50'
                            : isSubstituted
                              ? 'bg-slate-500/10 border-slate-400/50 opacity-80'
                              : 'bg-card border-border'
                    }`}
                  >
                    {/* Código do material + status atual (se readonly ou marcado) */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.code ? (
                          <NoTranslate
                            as="span"
                            className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-muted text-foreground border"
                          >
                            {item.code}
                          </NoTranslate>
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">
                            s/ código
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">#{index + 1}</span>
                        {item.is_substitution && (
                          <Badge
                            variant="outline"
                            className="bg-blue-500/10 text-blue-600 border-blue-400 text-[9px] h-4 px-1.5"
                          >
                            Substituto
                          </Badge>
                        )}
                      </div>

                      {isSeparated && (
                        <Badge className="bg-emerald-600 text-white text-[10px] h-5 px-2 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Separado
                        </Badge>
                      )}
                      {isPartial && (
                        <Badge className="bg-amber-500 text-white text-[10px] h-5 px-2 gap-1">
                          <Package className="h-3 w-3" /> Parcial
                        </Badge>
                      )}
                      {isShortage && (
                        <Badge className="bg-rose-600 text-white text-[10px] h-5 px-2 gap-1">
                          <AlertTriangle className="h-3 w-3" /> Falta
                        </Badge>
                      )}
                      {isSubstituted && (
                        <Badge
                          variant="outline"
                          className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-400 text-[10px] h-5 px-2 gap-1"
                        >
                          Substituído
                        </Badge>
                      )}
                      {!isSeparated && !isPartial && !isShortage && !isSubstituted && (
                        <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">
                          Pendente
                        </Badge>
                      )}
                    </div>

                    {/* Descrição em destaque */}
                    <NoTranslate
                      as="div"
                      className={`font-bold text-sm text-foreground leading-snug break-words ${
                        isSubstituted ? 'line-through opacity-70' : ''
                      }`}
                    >
                      {item.description}
                    </NoTranslate>

                    {/* Banner informativo de Falta Parcial ou Substituição */}
                    {isPartial && (
                      <div className="p-2 rounded bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-300 font-semibold flex items-center justify-between gap-2">
                        <span>
                          {item.separated_quantity ?? 0}/{item.total_quantity} {item.unit || 'UN'}{' '}
                          separados
                        </span>
                        <span className="text-amber-900 dark:text-amber-200">
                          {item.shortage_quantity ?? 0} {item.unit || 'UN'} em solicitação
                        </span>
                      </div>
                    )}

                    {isSubstituted && (
                      <div className="p-2 rounded bg-slate-200/70 dark:bg-slate-800/70 border border-slate-300 dark:border-slate-700 text-[11px] text-foreground font-medium flex items-center gap-1.5">
                        <ArrowLeftRight className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        <span>
                          Substituído por{' '}
                          <NoTranslate as="strong" className="font-mono text-primary font-bold">
                            [{item.replaced_by_code}]
                          </NoTranslate>{' '}
                          {item.replaced_by_description} (sem solicitação de compra)
                        </span>
                      </div>
                    )}

                    {/* Qtd, OPs e Medida empilhados de forma limpa */}
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className="text-muted-foreground text-[11px]">
                          Quantidade solicitada:
                        </span>
                        <span className="font-bold text-foreground text-xs bg-muted px-2 py-0.5 rounded">
                          <NoTranslate as="span">
                            {Number(item.total_quantity).toLocaleString('pt-BR', {
                              maximumFractionDigits: 2,
                            })}{' '}
                            {item.unit}
                          </NoTranslate>
                        </span>
                      </div>

                      {/* DISPONIBILIDADE DO ITEM NO ESTOQUE (Mobile) */}
                      {(() => {
                        const norm = normalizeCode(item.code)
                        const stockInfo = stockAvailabilityMap.get(norm)
                        const available = stockInfo ? stockInfo.availableStock : 0
                        const requested = Number(item.total_quantity) || 0
                        const isInsufficient = available < requested
                        return (
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <span className="text-muted-foreground text-[11px]">Disponível:</span>
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant={isInsufficient ? 'destructive' : 'secondary'}
                                className={`h-5 px-2 text-[10px] font-mono font-bold notranslate ${
                                  isInsufficient
                                    ? 'bg-rose-600 text-white animate-pulse'
                                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 border-emerald-300'
                                }`}
                                translate="no"
                              >
                                {available} {stockInfo?.unit || item.unit || 'UN'}
                              </Badge>
                              {isInsufficient && !isSeparated && (
                                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                                  Marcar 🔴 Falta
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })()}

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground text-[11px]">OPs:</span>
                        <NoTranslate
                          as="span"
                          className="font-mono font-medium text-foreground text-[11px] truncate max-w-[200px] text-right"
                        >
                          {item.op_numbers?.join(', ') || 'N/A'}
                        </NoTranslate>
                      </div>

                      {item.cut_measurement && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground text-[11px]">Medida corte:</span>
                          <Badge
                            variant="secondary"
                            className="h-5 px-1.5 text-[10px] font-mono text-foreground notranslate"
                            translate="no"
                          >
                            {item.cut_measurement}
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* BOTÕES GRANDES PARA O CHÃO DE FÁBRICA: Separado / Falta / Troca */}
                    {!isReadOnly && !isSubstituted && (
                      <div className="grid grid-cols-3 gap-1.5 pt-1">
                        <Button
                          type="button"
                          variant={isSeparated ? 'default' : 'outline'}
                          onClick={() => handleToggleItemStatus(item.id, 'separado')}
                          className={`min-h-[44px] h-11 text-[11px] font-bold gap-1 transition-all shadow-sm ${
                            isSeparated
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-500/50'
                              : 'border-2 border-emerald-600/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 active:bg-emerald-100'
                          }`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span>Separado</span>
                        </Button>

                        <Button
                          type="button"
                          variant={isShortage || isPartial ? 'default' : 'outline'}
                          onClick={() => handleToggleItemStatus(item.id, 'falta')}
                          className={`min-h-[44px] h-11 text-[11px] font-bold gap-1 transition-all shadow-sm ${
                            isShortage || isPartial
                              ? isPartial
                                ? 'bg-amber-600 hover:bg-amber-700 text-white ring-2 ring-amber-500/50'
                                : 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-500/50'
                              : 'border-2 border-rose-600/50 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:bg-rose-100'
                          }`}
                        >
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span>{isPartial ? 'Parcial' : 'Falta'}</span>
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleOpenSwapDialog(item)}
                          className="min-h-[44px] h-11 text-[11px] font-bold gap-1 transition-all shadow-sm border-2 border-blue-600/50 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 active:bg-blue-100"
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
                          <span>Troca</span>
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
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
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
                <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20 text-center">
                  <span className="text-[10px] text-amber-700 dark:text-amber-400 block font-medium">
                    🟡 Parciais
                  </span>
                  <span className="text-base font-bold text-amber-600">{countPartial}</span>
                </div>
                <div className="p-2 bg-rose-500/10 rounded-lg border border-rose-500/20 text-center">
                  <span className="text-[10px] text-rose-700 dark:text-rose-400 block font-medium">
                    🔴 Faltas
                  </span>
                  <span className="text-base font-bold text-rose-600">{countShortage}</span>
                </div>
                <div className="p-2 bg-slate-500/10 rounded-lg border border-slate-500/20 text-center">
                  <span className="text-[10px] text-muted-foreground block font-medium">
                    ⏳ Pendentes
                  </span>
                  <span className="text-base font-bold text-muted-foreground">{countPending}</span>
                </div>
              </div>

              {/* ATALHOS RÁPIDOS E BUSCA NO MODAL DESKTOP */}
              <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Filtrar por código ou descrição..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="h-8 w-full pl-8 pr-7 text-xs bg-muted/40 rounded-md border border-input focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  {filterQuery && (
                    <button
                      type="button"
                      onClick={() => setFilterQuery('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {activeSeparation.status !== 'Concluida' && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleMarkAllSeparated}
                      className="h-8 text-[11px] gap-1 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Marcar todos como Separados
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleResetAll}
                      className="h-8 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Limpar marcações
                    </Button>
                  </div>
                )}
              </div>
            </DialogHeader>

            {/* LISTA INTERATIVA DE ITENS */}
            <div className="flex-1 min-h-0 flex flex-col py-2">
              <ScrollArea className="flex-1 max-h-[50vh] pr-2">
                <div className="space-y-2">
                  {filteredItemsDraft.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground border-2 border-dashed rounded-xl my-4">
                      {filterQuery
                        ? 'Nenhum material encontrado com o filtro aplicado.'
                        : 'Nenhum material nesta rodada.'}
                    </div>
                  ) : (
                    filteredItemsDraft.map((item, index) => {
                      const isSeparated = item.status === 'separado'
                      const isPartial = item.status === 'parcial'
                      const isShortage = item.status === 'falta'
                      const isSubstituted = item.status === 'substituido'
                      const isReadOnly = activeSeparation.status === 'Concluida'

                      return (
                        <div
                          key={item.id || index}
                          className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            isSeparated
                              ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm'
                              : isPartial
                                ? 'bg-amber-500/10 border-amber-500/40 shadow-sm'
                                : isShortage
                                  ? 'bg-rose-500/10 border-rose-500/40 shadow-sm'
                                  : isSubstituted
                                    ? 'bg-slate-500/10 border-slate-400/50 opacity-80'
                                    : 'bg-card border-border hover:border-slate-400/50'
                          }`}
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {item.code ? (
                                <NoTranslate
                                  as="span"
                                  className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-muted text-foreground"
                                >
                                  {item.code}
                                </NoTranslate>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">
                                  s/ código
                                </span>
                              )}
                              {item.is_substitution && (
                                <Badge
                                  variant="outline"
                                  className="bg-blue-500/10 text-blue-600 border-blue-400 text-[10px] h-5 px-1.5"
                                >
                                  Substituto
                                </Badge>
                              )}
                              <NoTranslate
                                as="span"
                                className={`font-semibold text-sm text-foreground break-words ${
                                  isSubstituted ? 'line-through opacity-70' : ''
                                }`}
                              >
                                {item.description}
                              </NoTranslate>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              <NoTranslate
                                as="span"
                                className="flex items-center gap-1 font-mono font-semibold text-foreground"
                              >
                                OPs: {item.op_numbers?.join(', ') || 'N/A'}
                              </NoTranslate>

                              {item.cut_measurement && (
                                <Badge
                                  variant="secondary"
                                  className="h-5 px-1.5 text-[10px] font-mono notranslate"
                                  translate="no"
                                >
                                  Medida de corte: {item.cut_measurement}
                                </Badge>
                              )}

                              <NoTranslate
                                as="span"
                                className="font-semibold text-foreground bg-muted/80 px-2 py-0.5 rounded text-xs"
                              >
                                Solicitado:{' '}
                                {Number(item.total_quantity).toLocaleString('pt-BR', {
                                  maximumFractionDigits: 2,
                                })}{' '}
                                {item.unit}
                              </NoTranslate>

                              {/* BADGE DE DISPONIBILIDADE (Desktop) */}
                              {(() => {
                                const norm = normalizeCode(item.code)
                                const stockInfo = stockAvailabilityMap.get(norm)
                                const available = stockInfo ? stockInfo.availableStock : 0
                                const requested = Number(item.total_quantity) || 0
                                const isInsufficient = available < requested
                                return (
                                  <div className="flex items-center gap-1.5">
                                    <Badge
                                      variant={isInsufficient ? 'destructive' : 'secondary'}
                                      className={`h-5 px-2 text-[10px] font-mono font-bold notranslate ${
                                        isInsufficient
                                          ? 'bg-rose-600 text-white animate-pulse'
                                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 border-emerald-300'
                                      }`}
                                      translate="no"
                                      title={`Estoque total: ${stockInfo?.totalStock ?? 0} | Reservado: ${stockInfo?.reservedStock ?? 0} | Disponível: ${available}`}
                                    >
                                      Disponível: {available} {stockInfo?.unit || item.unit || 'UN'}
                                    </Badge>
                                    {isInsufficient && !isSeparated && (
                                      <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                                        ⚠️ Insuficiente — marcar 🔴
                                      </span>
                                    )}
                                  </div>
                                )
                              })()}
                            </div>

                            {/* Banner informativo desktop para Parcial ou Substituição */}
                            {isPartial && (
                              <div className="mt-1 px-2 py-1 rounded bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-300 font-semibold inline-flex items-center gap-2">
                                <span>
                                  🟡 {item.separated_quantity ?? 0}/{item.total_quantity}{' '}
                                  {item.unit || 'UN'} separados
                                </span>
                                <span>·</span>
                                <span className="text-amber-900 dark:text-amber-200">
                                  {item.shortage_quantity ?? 0} {item.unit || 'UN'} em solicitação
                                </span>
                              </div>
                            )}

                            {isSubstituted && (
                              <div className="mt-1 px-2 py-1 rounded bg-slate-200/70 dark:bg-slate-800/70 border border-slate-300 dark:border-slate-700 text-[11px] text-foreground font-medium inline-flex items-center gap-1.5">
                                <ArrowLeftRight className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                <span>
                                  Substituído por{' '}
                                  <NoTranslate
                                    as="strong"
                                    className="font-mono text-primary font-bold"
                                  >
                                    [{item.replaced_by_code}]
                                  </NoTranslate>{' '}
                                  {item.replaced_by_description} (sem solicitação de compra)
                                </span>
                              </div>
                            )}
                          </div>

                          {/* BOTÕES DE AÇÃO DO OPERADOR: 🟢 SEPARADO / 🔴 FALTA / 🔄 TROCA */}
                          {!isReadOnly && !isSubstituted ? (
                            <div className="flex items-center gap-1.5 shrink-0">
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
                                variant={isShortage || isPartial ? 'default' : 'outline'}
                                onClick={() => handleToggleItemStatus(item.id, 'falta')}
                                className={`h-9 px-3 gap-1.5 font-bold transition-all text-xs ${
                                  isShortage || isPartial
                                    ? isPartial
                                      ? 'bg-amber-600 hover:bg-amber-700 text-white ring-2 ring-amber-500/30 shadow'
                                      : 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-500/30 shadow'
                                    : 'border-rose-600/40 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                }`}
                              >
                                <AlertTriangle className="h-4 w-4" />
                                {isPartial ? 'Parcial' : 'Falta'}
                              </Button>

                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenSwapDialog(item)}
                                className="h-9 px-3 gap-1.5 font-bold transition-all text-xs border-blue-600/40 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                              >
                                <ArrowLeftRight className="h-4 w-4" />
                                Troca
                              </Button>
                            </div>
                          ) : (
                            <div className="shrink-0 flex items-center gap-1.5">
                              {isSeparated ? (
                                <Badge className="bg-emerald-600 text-white text-xs gap-1 py-1 px-2.5">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Separado
                                </Badge>
                              ) : isPartial ? (
                                <Badge className="bg-amber-600 text-white text-xs gap-1 py-1 px-2.5">
                                  <Package className="h-3.5 w-3.5" />
                                  Parcial
                                </Badge>
                              ) : isShortage ? (
                                <Badge className="bg-rose-600 text-white text-xs gap-1 py-1 px-2.5">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  Falta
                                </Badge>
                              ) : isSubstituted ? (
                                <Badge
                                  variant="outline"
                                  className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-400 text-xs gap-1 py-1 px-2.5"
                                >
                                  Substituído
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
                    })
                  )}
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

      {/* DIÁLOGO 1: FALTA PARCIAL */}
      {partialDialogOpen && partialItem && (
        <Dialog open={partialDialogOpen} onOpenChange={setPartialDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
                <DialogTitle>Informar Falta de Material</DialogTitle>
              </div>
              <DialogDescription className="text-xs">
                Confirme a quantidade disponível agora no estoque para este item.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 rounded-lg bg-muted/60 border space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-medium">Código:</span>
                  <NoTranslate as="span" className="font-mono font-bold text-foreground">
                    {partialItem.code || 's/ código'}
                  </NoTranslate>
                </div>
                <div>
                  <span className="text-muted-foreground font-medium block">Descrição:</span>
                  <NoTranslate as="div" className="font-semibold text-foreground mt-0.5 text-xs">
                    {partialItem.description}
                  </NoTranslate>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-medium">Unidade:</span>
                  <span className="font-mono font-semibold">{partialItem.unit || 'UN'}</span>
                </div>
                {partialItem.cut_measurement && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground font-medium">Medida de corte:</span>
                    <Badge
                      variant="secondary"
                      className="font-mono text-[10px] notranslate"
                      translate="no"
                    >
                      {partialItem.cut_measurement}
                    </Badge>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t">
                  <span className="text-muted-foreground font-bold">
                    Quantidade solicitada total:
                  </span>
                  <span className="font-bold text-sm text-foreground">
                    {partialItem.total_quantity} {partialItem.unit || 'UN'}
                  </span>
                </div>
                {partialItem.op_numbers && partialItem.op_numbers.length > 0 && (
                  <div className="pt-1 text-[11px] text-muted-foreground">
                    <span className="font-medium">OPs envolvidas:</span>{' '}
                    <NoTranslate as="span" className="font-mono">
                      {partialItem.op_numbers.join(', ')}
                    </NoTranslate>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 pt-1">
                <Label
                  htmlFor="stockNow"
                  className="text-xs font-semibold flex items-center justify-between"
                >
                  <span>Tem em estoque agora ({partialItem.unit || 'UN'}):</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    0 ≤ quantidade ≤ {partialItem.total_quantity}
                  </span>
                </Label>
                <Input
                  id="stockNow"
                  type="number"
                  step="any"
                  min="0"
                  max={partialItem.total_quantity}
                  value={stockNowInput}
                  onChange={(e) => setStockNowInput(e.target.value)}
                  placeholder={`Ex: ${partialItem.total_quantity}`}
                  className="font-mono text-sm"
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground">
                  • Se mantiver <strong>{partialItem.total_quantity}</strong> (sem alterar) ou
                  colocar <strong>0</strong>: vira <strong>Falta Total</strong>.
                  <br />• Se colocar um valor parcial (ex:{' '}
                  {Math.max(1, Math.floor(partialItem.total_quantity / 2))}): essa quantidade é{' '}
                  <strong>separada agora</strong> com reserva, e a{' '}
                  <strong>diferença restante</strong> é enviada para compra em Suprimentos.
                </p>
              </div>

              {/* Pré-visualização do resultado */}
              {(() => {
                const totalReq = Number(partialItem.total_quantity) || 0
                const num = Number(stockNowInput.replace(',', '.'))
                if (!isNaN(num) && num >= 0 && num <= totalReq) {
                  if (num === 0 || num === totalReq) {
                    return (
                      <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 text-[11px]">
                        <strong>Resultado: Falta Total.</strong> Solicitação de {totalReq}{' '}
                        {partialItem.unit || 'UN'} será enviada a Suprimentos.
                      </div>
                    )
                  }
                  const missing = Number((totalReq - num).toFixed(4))
                  return (
                    <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-[11px] space-y-0.5">
                      <div>
                        <strong>Resultado: Falta Parcial.</strong>
                      </div>
                      <div>
                        • Separar agora no kit:{' '}
                        <strong>
                          {num} {partialItem.unit || 'UN'}
                        </strong>
                      </div>
                      <div>
                        • Solicitação de compra para Suprimentos:{' '}
                        <strong>
                          {missing} {partialItem.unit || 'UN'}
                        </strong>
                      </div>
                    </div>
                  )
                }
                return null
              })()}
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPartialDialogOpen(false)}
                disabled={partialSaving}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                onClick={handleConfirmFaltaParcial}
                disabled={partialSaving}
              >
                {partialSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    Gravando...
                  </>
                ) : (
                  'Confirmar Falta'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* DIÁLOGO 2: TROCA / SUBSTITUIÇÃO */}
      {swapDialogOpen && swapOriginalItem && (
        <Dialog open={swapDialogOpen} onOpenChange={setSwapDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader>
              <div className="flex items-center gap-2 text-blue-600">
                <ArrowLeftRight className="h-5 w-5" />
                <DialogTitle>Trocar / Substituir Componente</DialogTitle>
              </div>
              <DialogDescription className="text-xs">
                Selecione um componente substituto no cadastro oficial do sistema.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-1 text-xs overflow-y-auto pr-1 flex-1">
              {/* Item Original */}
              <div className="p-2.5 rounded-lg bg-muted/60 border space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide">
                  Item Original que será substituído:
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <NoTranslate as="span" className="font-mono font-bold text-foreground">
                    [{swapOriginalItem.code || 's/ código'}]
                  </NoTranslate>
                  <NoTranslate as="span" className="text-foreground">
                    {swapOriginalItem.description}
                  </NoTranslate>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Solicitado:{' '}
                  <strong>
                    {swapOriginalItem.total_quantity} {swapOriginalItem.unit || 'UN'}
                  </strong>
                  {swapOriginalItem.cut_measurement
                    ? ` · Medida: ${swapOriginalItem.cut_measurement}`
                    : ''}
                </div>
                <div className="text-[10px] text-amber-600 font-medium">
                  ℹ️ O item original ficará marcado como substituído e NÃO gerará solicitação de
                  compra.
                </div>
              </div>

              {/* Busca de Substituto */}
              <div className="space-y-1.5">
                <Label htmlFor="searchSub" className="text-xs font-semibold">
                  Buscar Substituto no Cadastro Oficial:
                </Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="searchSub"
                    type="text"
                    value={swapSearchTerm}
                    onChange={(e) => handleSearchSubstitutes(e.target.value)}
                    placeholder="Digite código ou descrição (mínimo 2 letras)..."
                    className="pl-8 text-xs h-9"
                    autoFocus
                  />
                  {swapSearching && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Lista de Resultados Oficiais */}
              <div className="space-y-1 max-h-48 overflow-y-auto border rounded-lg p-1 bg-background">
                {swapResults.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-xs">
                    {swapSearchTerm.trim().length < 2
                      ? 'Digite pelo menos 2 caracteres para buscar no cadastro oficial.'
                      : 'Nenhum componente encontrado no cadastro com esse termo.'}
                  </div>
                ) : (
                  swapResults.map((comp) => {
                    const isSelected = selectedSubstitute?.id === comp.id
                    return (
                      <div
                        key={comp.id}
                        onClick={() => setSelectedSubstitute(comp)}
                        className={`p-2 rounded cursor-pointer transition-colors text-xs flex items-center justify-between gap-2 border ${
                          isSelected
                            ? 'bg-blue-500/15 border-blue-500 text-blue-900 dark:text-blue-200'
                            : 'hover:bg-muted border-transparent'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <NoTranslate as="span" className="font-mono font-bold">
                              {comp.code}
                            </NoTranslate>
                            <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">
                              {comp.unit || 'UN'}
                            </Badge>
                          </div>
                          <NoTranslate
                            as="div"
                            className="truncate text-foreground font-medium text-[11px] mt-0.5"
                          >
                            {comp.description}
                          </NoTranslate>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-muted-foreground block">Estoque</span>
                          <span className="font-mono font-bold text-xs text-foreground">
                            {comp.stock_quantity ?? 0}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Componente Selecionado + Quantidade */}
              {selectedSubstitute && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-blue-900 dark:text-blue-300">
                      Substituto Selecionado:
                    </span>
                    <Badge className="bg-blue-600 text-white text-[10px]">Confirmado</Badge>
                  </div>
                  <div>
                    <NoTranslate as="span" className="font-mono font-bold text-xs">
                      [{selectedSubstitute.code}]
                    </NoTranslate>{' '}
                    <NoTranslate as="span" className="text-xs">
                      {selectedSubstitute.description}
                    </NoTranslate>
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>Estoque cadastrado disponível:</span>
                    <span className="font-mono font-bold text-foreground">
                      {selectedSubstitute.stock_quantity ?? 0} {selectedSubstitute.unit || 'UN'}
                    </span>
                  </div>

                  <div className="pt-1 space-y-1">
                    <Label htmlFor="subQty" className="text-xs font-semibold">
                      Quantidade a separar do substituto (
                      {selectedSubstitute.unit || swapOriginalItem.unit || 'UN'}):
                    </Label>
                    <Input
                      id="subQty"
                      type="number"
                      step="any"
                      min="0.001"
                      value={substituteQtyInput}
                      onChange={(e) => setSubstituteQtyInput(e.target.value)}
                      className="font-mono text-xs h-8 bg-background"
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSwapDialogOpen(false)}
                disabled={swapSaving}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5"
                onClick={handleConfirmSubstitution}
                disabled={swapSaving || !selectedSubstitute}
              >
                {swapSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Confirmando...
                  </>
                ) : (
                  <>
                    <ArrowLeftRight className="h-4 w-4" />
                    Confirmar Substituição
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

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
