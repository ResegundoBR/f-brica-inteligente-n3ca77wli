import { useState, useMemo, useEffect } from 'react'
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
import { Input } from '@/components/ui/input'
import {
  Calendar,
  CheckCircle2,
  Package,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Lock,
  Search,
  ArrowUpDown,
  X,
  Layers,
  ExternalLink,
} from 'lucide-react'
import { PcpProgramacaoRecord, ProgramacaoOrderItem } from '@/services/pcp-programacoes'
import { NoTranslate } from '@/components/NoTranslate'
import { OpReadOnlyModal } from './OpReadOnlyModal'

interface ProgramacaoDetailModalProps {
  programacao: PcpProgramacaoRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseProgramacao?: (prog: PcpProgramacaoRecord) => void
}

export interface GroupedProgramacaoOrder {
  order_number: string
  client_name: string
  total_quantity: number
  ops: ProgramacaoOrderItem[]
}

export function ProgramacaoDetailModal({
  programacao,
  open,
  onOpenChange,
  onCloseProgramacao,
}: ProgramacaoDetailModalProps) {
  const [componentsExpanded, setComponentsExpanded] = useState(false)
  const [orderSearch, setOrderSearch] = useState('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [componentSearch, setComponentSearch] = useState('')
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({})
  const [selectedOpForModal, setSelectedOpForModal] = useState<string | null>(null)
  const [opModalOpen, setOpModalOpen] = useState(false)

  // Resetar busca e expansão ao trocar de programação
  useEffect(() => {
    setOrderSearch('')
    setExpandedOrders({})
    setComponentsExpanded(false)
  }, [programacao?.id])

  const isClosed = programacao?.status === 'Encerrada'
  const separation = programacao?.expand?.separation_id
  const compiledItems = Array.isArray(programacao?.compiled_items) ? programacao.compiled_items : []
  const ordersList: ProgramacaoOrderItem[] = Array.isArray(programacao?.orders_list)
    ? programacao.orders_list
    : []

  // Total de itens consolidados
  const totalItemsCount = compiledItems.length || programacao?.items_count || 0

  // Agrupamento de itens por PEDIDO
  const groupedOrders: GroupedProgramacaoOrder[] = useMemo(() => {
    const groupsMap = new Map<string, GroupedProgramacaoOrder>()

    ordersList.forEach((item) => {
      const orderNum = (item.order_number || 'Sem Pedido').trim()
      const key = orderNum.toUpperCase()

      let existing = groupsMap.get(key)
      if (!existing) {
        existing = {
          order_number: item.order_number || 'Sem Pedido',
          client_name: item.client_name || 'Cliente não informado',
          total_quantity: 0,
          ops: [],
        }
        groupsMap.set(key, existing)
      } else {
        // Atualiza cliente se o item atual tiver um nome mais completo
        if (
          (!existing.client_name || existing.client_name === 'Cliente não informado') &&
          item.client_name
        ) {
          existing.client_name = item.client_name
        }
      }

      existing.total_quantity += Number(item.quantity || 0)
      existing.ops.push(item)
    })

    return Array.from(groupsMap.values())
  }, [ordersList])

  // Contadores globais corretos
  const totalUniqueOrders = groupedOrders.length || programacao?.orders_count || 0
  const totalOpsCount = useMemo(() => {
    if (ordersList.length > 0) return ordersList.length
    return programacao?.ops_count || 0
  }, [ordersList, programacao])

  // Filtragem e ordenação dos pedidos agrupados
  const filteredAndSortedGroups = useMemo(() => {
    const q = orderSearch.toLowerCase().trim()

    let list = groupedOrders.filter((group) => {
      if (!q) return true

      const orderMatch = group.order_number.toLowerCase().includes(q)
      const clientMatch = group.client_name.toLowerCase().includes(q)
      const opsMatch = group.ops.some((op) => {
        const opNum = (op.op_number || '').toLowerCase()
        const prod = (op.product_name || '').toLowerCase()
        const label = (op.formatted_label || '').toLowerCase()
        return opNum.includes(q) || prod.includes(q) || label.includes(q)
      })

      return orderMatch || clientMatch || opsMatch
    })

    list.sort((a, b) => {
      const numA = (a.order_number || '').toLowerCase()
      const numB = (b.order_number || '').toLowerCase()
      const comp = numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' })
      return sortOrder === 'asc' ? comp : -comp
    })

    return list
  }, [groupedOrders, orderSearch, sortOrder])

  // Contagem de OPs visíveis após filtro
  const filteredOpsCount = useMemo(() => {
    return filteredAndSortedGroups.reduce((acc, g) => acc + g.ops.length, 0)
  }, [filteredAndSortedGroups])

  const toggleOrderExpand = (orderNumber: string) => {
    setExpandedOrders((prev) => ({
      ...prev,
      [orderNumber]: !prev[orderNumber],
    }))
  }

  const handleOpenOpModal = (opNumber: string) => {
    if (!opNumber) return
    setSelectedOpForModal(opNumber)
    setOpModalOpen(true)
  }

  // Filtragem de componentes expandidos
  const filteredComponents = useMemo(() => {
    if (!componentSearch.trim()) return compiledItems
    const q = componentSearch.toLowerCase().trim()
    return compiledItems.filter((item: any) => {
      const code = (item.code || '').toLowerCase()
      const desc = (item.description || '').toLowerCase()
      const cut = (item.cutMeasurement || '').toLowerCase()
      const ops = Array.isArray(item.orderNumbers) ? item.orderNumbers.join(' ').toLowerCase() : ''
      return code.includes(q) || desc.includes(q) || cut.includes(q) || ops.includes(q)
    })
  }, [compiledItems, componentSearch])

  if (!programacao) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-4xl max-h-[92vh] sm:max-h-[90vh] flex flex-col p-3 sm:p-6 overflow-hidden">
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
              <span className="text-xl font-bold text-foreground">{totalUniqueOrders}</span>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border text-center">
              <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                Ordens de Produção
              </span>
              <span className="text-xl font-bold text-blue-600">{totalOpsCount}</span>
            </div>{' '}
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

          {/* (4) LISTA DE PEDIDOS & ORDENS DE PRODUÇÃO AGRUPADA POR PEDIDO */}
          <div className="space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2 flex-wrap">
                  <span className="text-base">📋</span>
                  <span>Pedidos & Ordens de Produção</span>
                  <Badge variant="secondary" className="font-semibold text-xs">
                    {totalUniqueOrders} {totalUniqueOrders === 1 ? 'pedido' : 'pedidos'} /{' '}
                    {totalOpsCount} OP{totalOpsCount !== 1 ? 's' : ''}
                  </Badge>
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Exibindo{' '}
                  <strong className="text-foreground font-semibold">
                    {filteredAndSortedGroups.length}
                  </strong>{' '}
                  {filteredAndSortedGroups.length === 1 ? 'pedido' : 'pedidos'} ({filteredOpsCount}{' '}
                  OP{filteredOpsCount !== 1 ? 's' : ''}) de {totalUniqueOrders} pedidos gravados
                  {orderSearch.trim() && ' (filtrado)'}
                </p>
              </div>

              {/* FILTRO E ORDENAÇÃO RÁPIDA */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Filtrar pedido, cliente, OP ou produto..."
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    className="h-8 pl-8 pr-7 text-xs bg-background"
                  />
                  {orderSearch && (
                    <button
                      type="button"
                      onClick={() => setOrderSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      title="Limpar filtro"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="h-8 px-2.5 text-xs gap-1 shrink-0"
                  title={`Ordenar por pedido (${sortOrder === 'asc' ? 'Crescente' : 'Decrescente'})`}
                >
                  <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="hidden sm:inline">
                    {sortOrder === 'asc' ? 'Crescente' : 'Decrescente'}
                  </span>
                </Button>
              </div>
            </div>

            {/* CONTAINER COM ROLAGEM NATIVA, AGRUPAMENTO POR PEDIDO */}
            <div className="relative border rounded-lg overflow-hidden bg-card shadow-sm">
              <div className="max-h-[50vh] sm:max-h-[55vh] overflow-y-auto overscroll-contain divide-y text-xs divide-border/60">
                {filteredAndSortedGroups.map((group, idx) => {
                  const hasMultipleOps = group.ops.length > 1
                  const isExpanded = !!(
                    expandedOrders[group.order_number] ||
                    (orderSearch.trim().length > 0 && hasMultipleOps)
                  )
                  const isSearchActive = orderSearch.trim().length > 0
                  const q = orderSearch.toLowerCase().trim()

                  return (
                    <div
                      key={`${group.order_number}-${idx}`}
                      className="transition-colors bg-card hover:bg-muted/30"
                    >
                      {/* LINHA PRINCIPAL DO PEDIDO */}
                      <div
                        onClick={() => {
                          if (hasMultipleOps) toggleOrderExpand(group.order_number)
                        }}
                        className={`p-2.5 sm:p-3 flex items-start sm:items-center justify-between gap-3 ${
                          hasMultipleOps ? 'cursor-pointer select-none' : ''
                        }`}
                      >
                        <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                          <span className="font-mono text-[11px] text-muted-foreground w-6 shrink-0 text-center pt-0.5 sm:pt-0">
                            #{idx + 1}
                          </span>

                          <div className="min-w-0 space-y-0.5 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <NoTranslate className="font-bold text-foreground text-xs sm:text-sm">
                                Pedido {group.order_number}
                              </NoTranslate>
                              {group.client_name && (
                                <NoTranslate className="text-muted-foreground text-xs truncate max-w-[260px] sm:max-w-md font-medium">
                                  • {group.client_name}
                                </NoTranslate>
                              )}
                            </div>

                            {/* CASO 1 OP: Exibir direto na linha sem precisar expandir */}
                            {!hasMultipleOps && group.ops[0] && (
                              <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                                <NoTranslate className="text-slate-600 dark:text-slate-300">
                                  {group.ops[0].product_name ||
                                    group.ops[0].formatted_label ||
                                    'Produto'}
                                </NoTranslate>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* LADO DIREITO: SOMA DE QUANTIDADES, OP OU CONTADOR DE OPS */}
                        <div className="shrink-0 flex items-center gap-1.5 sm:gap-2 self-start sm:self-center">
                          {/* SOMA TOTAL DAS QUANTIDADES DO PEDIDO */}
                          <Badge
                            variant="secondary"
                            className="font-mono text-[10px] sm:text-xs font-semibold px-2 py-0.5"
                            title={`Soma das quantidades das OPs do Pedido ${group.order_number}`}
                          >
                            <NoTranslate>{group.total_quantity} un</NoTranslate>
                          </Badge>

                          {/* QUANDO TEM 1 OP: mostra a OP direto como botão clicável */}
                          {!hasMultipleOps && group.ops[0] && (
                            <>
                              {group.ops[0].op_number ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleOpenOpModal(group.ops[0].op_number!)
                                  }}
                                  className="h-6 px-2 text-[10px] sm:text-xs font-mono bg-blue-50/70 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border-blue-300 cursor-pointer gap-1"
                                  title="Clique para abrir detalhes da OP"
                                >
                                  <NoTranslate>OP {group.ops[0].op_number}</NoTranslate>
                                  <ExternalLink className="size-2.5 opacity-60" />
                                </Button>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="font-mono text-[10px] text-muted-foreground"
                                >
                                  Sem OP
                                </Badge>
                              )}
                            </>
                          )}

                          {/* QUANDO TEM VÁRIAS OPS: botão expansor com contador */}
                          {hasMultipleOps && (
                            <Button
                              type="button"
                              variant={isExpanded ? 'secondary' : 'outline'}
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleOrderExpand(group.order_number)
                              }}
                              className="h-6 px-2 text-[10px] sm:text-xs font-semibold gap-1 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700"
                              title={
                                isExpanded
                                  ? 'Recolher OPs deste pedido'
                                  : 'Expandir lista de OPs deste pedido'
                              }
                            >
                              <Layers className="size-3 text-blue-600 dark:text-blue-400" />
                              <span>{group.ops.length} OPs</span>
                              {isExpanded ? (
                                <ChevronDown className="size-3 transition-transform" />
                              ) : (
                                <ChevronRight className="size-3 transition-transform" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* LISTA EXPANDIDA DE OPS (quando tem mais de 1 OP) */}
                      {hasMultipleOps && isExpanded && (
                        <div className="bg-slate-50/70 dark:bg-slate-900/40 border-t border-dashed px-3 py-2 sm:px-6 space-y-1.5 animate-in fade-in duration-150">
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold flex items-center justify-between pb-1">
                            <span>Ordens de Produção vinculadas a este pedido:</span>
                            <span>{group.ops.length} OPs</span>
                          </div>

                          <div className="divide-y divide-border/40 border rounded-md bg-background overflow-hidden">
                            {group.ops.map((op, opIdx) => {
                              const opMatchesSearch =
                                isSearchActive &&
                                ((op.op_number || '').toLowerCase().includes(q) ||
                                  (op.product_name || '').toLowerCase().includes(q) ||
                                  (op.formatted_label || '').toLowerCase().includes(q))

                              return (
                                <div
                                  key={`${op.op_number || op.order_id}-${opIdx}`}
                                  className={`p-2 flex items-center justify-between gap-2 text-xs transition-colors ${
                                    opMatchesSearch
                                      ? 'bg-amber-50/70 dark:bg-amber-950/30'
                                      : 'hover:bg-muted/40'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {/* Botão de OP clicável */}
                                    {op.op_number ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpenOpModal(op.op_number!)}
                                        className="h-6 px-2 text-[10px] font-mono font-bold bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/70 text-blue-700 dark:text-blue-300 border-blue-300 shrink-0 gap-1 cursor-pointer"
                                        title="Ver detalhes da OP em modo leitura"
                                      >
                                        <NoTranslate>OP {op.op_number}</NoTranslate>
                                        <ExternalLink className="size-2.5 opacity-60" />
                                      </Button>
                                    ) : (
                                      <Badge
                                        variant="outline"
                                        className="font-mono text-[10px] text-muted-foreground shrink-0"
                                      >
                                        Sem OP
                                      </Badge>
                                    )}

                                    {/* Descrição do produto */}
                                    <div className="min-w-0 flex-1">
                                      <NoTranslate className="text-slate-700 dark:text-slate-300 text-[11px] truncate block font-medium">
                                        {op.product_name || op.formatted_label || 'Produto'}
                                      </NoTranslate>
                                    </div>
                                  </div>

                                  {/* Quantidade desta OP específica */}
                                  <div className="shrink-0 flex items-center gap-1.5">
                                    <Badge
                                      variant="outline"
                                      className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300"
                                    >
                                      <NoTranslate>{op.quantity || 1} un</NoTranslate>
                                    </Badge>
                                    {opMatchesSearch && (
                                      <Badge
                                        variant="secondary"
                                        className="text-[9px] h-4 px-1 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                                      >
                                        Correspondente
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                {filteredAndSortedGroups.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground text-xs space-y-1">
                    <p className="font-medium text-foreground">Nenhum pedido encontrado</p>
                    <p className="text-[11px]">
                      {orderSearch.trim()
                        ? `Nenhum pedido ou OP corresponde ao filtro "${orderSearch}".`
                        : 'Nenhum pedido listado nesta programação.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Barra de rodapé do container com contador fixo para transparência */}
              <div className="px-3 py-1.5 bg-muted/30 border-t flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  Mostrando{' '}
                  <strong className="text-foreground">{filteredAndSortedGroups.length}</strong> de{' '}
                  {totalUniqueOrders} pedidos ({filteredOpsCount} de {totalOpsCount} OPs)
                </span>
                <span className="text-[10px]">Role para ver todos</span>
              </div>
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

            {/* SE EXPANDIDO: EXIBE A LISTA DE MATERIAIS COM ROLAGEM NATIVA E FILTRO */}
            {componentsExpanded && (
              <div className="pt-3 border-t mt-2 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="relative flex-1 sm:max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Filtrar por código ou descrição..."
                      value={componentSearch}
                      onChange={(e) => setComponentSearch(e.target.value)}
                      className="h-7 pl-8 pr-7 text-xs bg-background"
                    />
                    {componentSearch && (
                      <button
                        type="button"
                        onClick={() => setComponentSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Exibindo <strong>{filteredComponents.length}</strong> de {compiledItems.length}
                  </span>
                </div>

                <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
                  <div className="max-h-[50vh] sm:max-h-[55vh] overflow-y-auto overscroll-contain divide-y text-xs divide-border/60">
                    {filteredComponents.map((item: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-none flex items-center justify-between text-xs gap-3 hover:bg-muted/40 transition-colors"
                      >
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {item.code ? (
                              <NoTranslate className="font-mono font-bold text-foreground">
                                {item.code}
                              </NoTranslate>
                            ) : (
                              <span className="text-muted-foreground italic">s/ código</span>
                            )}
                            <NoTranslate className="text-foreground truncate max-w-sm sm:max-w-md">
                              {item.description}
                            </NoTranslate>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                            {item.cutMeasurement && (
                              <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                                <NoTranslate>Corte: {item.cutMeasurement}</NoTranslate>
                              </Badge>
                            )}
                            {item.categoryName && (
                              <span className="text-slate-500">[{item.categoryName}]</span>
                            )}
                            {item.orderNumbers && item.orderNumbers.length > 0 && (
                              <NoTranslate className="text-muted-foreground">
                                OPs: {item.orderNumbers.join(', ')}
                              </NoTranslate>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <NoTranslate className="font-bold text-foreground font-mono">
                            {Number(item.totalQuantity || item.quantity || 0).toLocaleString(
                              'pt-BR',
                              { maximumFractionDigits: 2 },
                            )}{' '}
                            {item.unit || 'UN'}
                          </NoTranslate>
                        </div>
                      </div>
                    ))}

                    {filteredComponents.length === 0 && (
                      <div className="p-6 text-center text-muted-foreground text-xs">
                        Nenhum componente encontrado para esta busca.
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-1 bg-muted/30 border-t flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Lista completa de insumos compilados da programação</span>
                    <span>Role para ver todos</span>
                  </div>
                </div>
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

      {/* MODAL SOMENTE LEITURA DA OP QUANDO O GESTOR CLICA NA OP */}
      <OpReadOnlyModal
        open={opModalOpen}
        onOpenChange={(isOpen) => {
          setOpModalOpen(isOpen)
          if (!isOpen) setSelectedOpForModal(null)
        }}
        opIdentifier={selectedOpForModal}
      />
    </Dialog>
  )
}
