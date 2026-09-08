import { useState, useMemo, useEffect, useCallback } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'
import type { PcpOrderMessage, MessageSector } from '@/types'
import {
  isPcpSender,
  isPcpManager,
  getUserChannel,
  SECTOR_OPTIONS,
  SECTOR_VISUALS,
} from '@/lib/message-sector'
import { OrderMessagesPanel } from '@/components/OrderMessagesPanel'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  MessageSquare,
  HelpCircle,
  Clock,
  CheckCircle2,
  Filter,
  CheckCheck,
  Building2,
  RefreshCw,
  Layers,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface ConversationGroup {
  key: string // orderId_sector
  orderId: string
  orderNumber: string
  opNumber?: string
  clientName?: string
  sector: MessageSector
  messages: PcpOrderMessage[]
  unreadCount: number
  pendingQuestionsCount: number
  answeredQuestionsCount: number
  totalQuestions: number
  lastMessage: PcpOrderMessage
}

export function PcpInbox() {
  const { user } = useAuth()
  const isPcp = isPcpManager(user)
  const userChannel = getUserChannel(user)

  const [messages, setMessages] = useState<PcpOrderMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sectorFilter, setSectorFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'unread'>('pending')
  const [selectedConversation, setSelectedConversation] = useState<{
    orderId: string
    orderNumber: string
    opNumber?: string
    sector: MessageSector
    initialReplyTo?: PcpOrderMessage | null
  } | null>(null)

  const loadData = useCallback(async () => {
    try {
      const all = await pb.collection('pcp_order_messages').getFullList<PcpOrderMessage>({
        sort: '-created',
        expand: 'user_id.role,order_id.client_id,reply_to.user_id',
      })
      setMessages(all)
    } catch (err) {
      console.error('Erro ao carregar mensagens da caixa de entrada', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useRealtime('pcp_order_messages', () => {
    loadData()
  })

  // Agrupa mensagens por OP + Setor
  const conversationGroups = useMemo(() => {
    const map = new Map<string, ConversationGroup>()

    for (const msg of messages) {
      const order = msg.expand?.order_id
      const orderId = msg.order_id
      if (!orderId) continue

      const orderNumber = order?.order_number || 'S/N'
      const opNumber = order?.op_number || ''
      const clientName = order?.expand?.client_id?.name || order?.client_name || ''
      const sector = (msg.sector || 'Operador') as MessageSector

      // Se o usuário não é PCP, só vê conversas do seu setor
      if (!isPcp && userChannel && sector !== userChannel) {
        continue
      }

      const key = `${orderId}_${sector}`

      if (!map.has(key)) {
        map.set(key, {
          key,
          orderId,
          orderNumber,
          opNumber,
          clientName,
          sector,
          messages: [],
          unreadCount: 0,
          pendingQuestionsCount: 0,
          answeredQuestionsCount: 0,
          totalQuestions: 0,
          lastMessage: msg,
        })
      }

      const conv = map.get(key)!
      conv.messages.push(msg)

      // Regra de não lidas:
      // Se sou PCP: mensagem não lida enviada por outros (não PCP)
      // Se sou setor: mensagem não lida enviada pelo PCP
      const msgFromPcp = isPcpSender(msg)
      const isUnread = !msg.read && msg.user_id !== user?.id && (isPcp ? !msgFromPcp : msgFromPcp)

      if (isUnread) {
        conv.unreadCount += 1
      }

      if (msg.type === 'Pergunta') {
        conv.totalQuestions += 1
        if (msg.status === 'Pendente') {
          conv.pendingQuestionsCount += 1
        } else if (msg.status === 'Respondida') {
          conv.answeredQuestionsCount += 1
        }
      }
    }

    // Ordenação esperada:
    // 1. Mais perguntas pendentes primeiro
    // 2. Mais mensagens não lidas
    // 3. Mais recente
    const list = Array.from(map.values())
    list.sort((a, b) => {
      if (b.pendingQuestionsCount !== a.pendingQuestionsCount) {
        return b.pendingQuestionsCount - a.pendingQuestionsCount
      }
      if (b.unreadCount !== a.unreadCount) {
        return b.unreadCount - a.unreadCount
      }
      return new Date(b.lastMessage.created).getTime() - new Date(a.lastMessage.created).getTime()
    })

    return list
  }, [messages, isPcp, userChannel, user?.id])

  // Métricas gerais
  const metrics = useMemo(() => {
    let totalPendingQuestions = 0
    let totalUnreadMessages = 0
    let totalConversations = conversationGroups.length

    for (const c of conversationGroups) {
      totalPendingQuestions += c.pendingQuestionsCount
      totalUnreadMessages += c.unreadCount
    }

    return {
      totalConversations,
      totalPendingQuestions,
      totalUnreadMessages,
    }
  }, [conversationGroups])

  // Filtragem
  const filteredConversations = useMemo(() => {
    return conversationGroups.filter((c) => {
      if (sectorFilter !== 'all' && c.sector !== sectorFilter) {
        return false
      }

      if (statusFilter === 'pending' && c.pendingQuestionsCount === 0) {
        return false
      }
      if (statusFilter === 'unread' && c.unreadCount === 0) {
        return false
      }

      if (search.trim()) {
        const query = search.toLowerCase()
        const matchOp = c.orderNumber.toLowerCase().includes(query)
        const matchRef = c.opNumber?.toLowerCase().includes(query)
        const matchClient = c.clientName?.toLowerCase().includes(query)
        const matchContent = c.messages.some((m) => m.content.toLowerCase().includes(query))
        return matchOp || matchRef || matchClient || matchContent
      }

      return true
    })
  }, [conversationGroups, sectorFilter, statusFilter, search])

  // Marca conversa como lida
  const handleMarkConversationAsRead = async (conv: ConversationGroup) => {
    const unreadMsgs = conv.messages.filter(
      (m) => !m.read && m.user_id !== user?.id && (isPcp ? !isPcpSender(m) : isPcpSender(m)),
    )

    if (unreadMsgs.length === 0) return

    setMessages((prev) => {
      const ids = new Set(unreadMsgs.map((m) => m.id))
      return prev.map((m) => (ids.has(m.id) ? { ...m, read: true } : m))
    })

    unreadMsgs.forEach((m) => {
      pb.collection('pcp_order_messages')
        .update(m.id, { read: true })
        .catch(() => {})
    })
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-600 text-white shadow-sm">
              <MessageSquare className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Central de Comunicações
              </h1>
              <p className="text-sm text-muted-foreground">
                Caixa de entrada de mensagens e Q&A alinhadas por OP e Setor fabril
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            <span>Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Cards de Métricas / KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-amber-500 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Perguntas Pendentes
              </span>
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {metrics.totalPendingQuestions}
              </span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Aguardando resposta do PCP/equipe
              </p>
            </div>
            <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
              <Clock className="size-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Mensagens Não Lidas
              </span>
              <span className="text-2xl font-bold text-red-600 dark:text-red-400">
                {metrics.totalUnreadMessages}
              </span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Novas atualizações para sua visualização
              </p>
            </div>
            <div className="p-3 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400">
              <MessageSquare className="size-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Canais / Conversas
              </span>
              <span className="text-2xl font-bold text-foreground">
                {metrics.totalConversations}
              </span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Total de OPs com interações ativas
              </p>
            </div>
            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
              <Layers className="size-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-card p-3 rounded-xl border shadow-xs">
        {/* Campo de Busca */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por OP, cliente ou mensagem..."
            className="pl-9 h-9"
          />
        </div>

        {/* Filtros rápidos de Status */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
            <Filter className="size-3.5" /> Filtrar:
          </span>
          <Button
            variant={statusFilter === 'pending' ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setStatusFilter('pending')}
          >
            <Clock className="size-3 text-amber-400" />
            <span>Com Pendências</span>
            {metrics.totalPendingQuestions > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {metrics.totalPendingQuestions}
              </Badge>
            )}
          </Button>

          <Button
            variant={statusFilter === 'unread' ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setStatusFilter('unread')}
          >
            <MessageSquare className="size-3 text-red-400" />
            <span>Não Lidas</span>
            {metrics.totalUnreadMessages > 0 && (
              <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                {metrics.totalUnreadMessages}
              </Badge>
            )}
          </Button>

          <Button
            variant={statusFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setStatusFilter('all')}
          >
            Todas
          </Button>
        </div>

        {/* Filtro por Setor (para PCP) */}
        {isPcp && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <Button
              variant={sectorFilter === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setSectorFilter('all')}
            >
              Todos Setores
            </Button>
            {SECTOR_OPTIONS.map((sec) => {
              const meta = SECTOR_VISUALS[sec]
              const Icon = meta.icon
              const isSelected = sectorFilter === sec
              return (
                <Button
                  key={sec}
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  className={cn('h-8 text-xs gap-1.5 shrink-0')}
                  onClick={() => setSectorFilter(sec)}
                >
                  <Icon className="size-3.5" style={{ color: isSelected ? 'white' : meta.color }} />
                  <span>{meta.label}</span>
                </Button>
              )
            })}
          </div>
        )}
      </div>

      {/* Lista de Conversas / Threads agrupadas por OP + Setor */}
      <div className="space-y-3">
        {filteredConversations.length === 0 ? (
          <div className="text-center py-16 px-4 border rounded-xl bg-card space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <MessageSquare className="size-6 opacity-60" />
            </div>
            <h3 className="font-semibold text-foreground text-base">Nenhuma conversa encontrada</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {statusFilter === 'pending'
                ? 'Excelente! Não há perguntas pendentes no filtro selecionado.'
                : 'Não há mensagens cadastradas com esses critérios de busca.'}
            </p>
            {statusFilter !== 'all' && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setStatusFilter('all')}
              >
                Ver todas as conversas
              </Button>
            )}
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const meta = SECTOR_VISUALS[conv.sector] || SECTOR_VISUALS.Operador
            const SectorIcon = meta.icon
            const hasPending = conv.pendingQuestionsCount > 0
            const hasUnread = conv.unreadCount > 0
            const lastMsg = conv.lastMessage
            const senderIsPcp = isPcpSender(lastMsg)

            // Acha a última pergunta pendente da conversa para facilitar resposta direta
            const latestPendingQuestion = conv.messages.find(
              (m) => m.type === 'Pergunta' && m.status === 'Pendente',
            )

            return (
              <Card
                key={conv.key}
                className={cn(
                  'border transition-all hover:shadow-md cursor-pointer group',
                  meta.bubbleBorder,
                  'border-l-4',
                  hasPending
                    ? 'ring-1 ring-amber-400/40 bg-amber-50/20 dark:bg-amber-950/10'
                    : 'bg-card',
                )}
                onClick={() => {
                  setSelectedConversation({
                    orderId: conv.orderId,
                    orderNumber: conv.orderNumber,
                    opNumber: conv.opNumber,
                    sector: conv.sector,
                  })
                }}
              >
                <CardContent className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Lado Esquerdo: Info da OP, Setor, Badges */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div
                      className={cn(
                        'p-2.5 rounded-xl shrink-0 mt-0.5 border',
                        meta.badgeBg,
                        meta.badgeBorder,
                      )}
                    >
                      <SectorIcon className="size-5" style={{ color: meta.color }} />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      {/* Linha 1: OP, cliente, badges de status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base text-foreground">
                          OP {conv.orderNumber}
                        </span>
                        {conv.opNumber && conv.opNumber !== conv.orderNumber && (
                          <span className="text-xs text-muted-foreground">
                            (Ref: {conv.opNumber})
                          </span>
                        )}

                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs font-semibold gap-1 py-0.5',
                            meta.badgeBg,
                            meta.badgeText,
                            meta.badgeBorder,
                          )}
                        >
                          <SectorIcon className="size-3" style={{ color: meta.color }} />
                          {meta.label}
                        </Badge>

                        {/* Badge de Perguntas Pendentes */}
                        {hasPending && (
                          <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs gap-1 py-0.5 animate-pulse">
                            <Clock className="size-3" />
                            {conv.pendingQuestionsCount}{' '}
                            {conv.pendingQuestionsCount === 1
                              ? 'pergunta pendente'
                              : 'perguntas pendentes'}
                          </Badge>
                        )}

                        {/* Badge de Não Lidas */}
                        {hasUnread && (
                          <Badge variant="destructive" className="text-xs font-bold py-0.5">
                            {conv.unreadCount} não lida(s)
                          </Badge>
                        )}

                        {conv.totalQuestions > 0 && !hasPending && (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 text-xs gap-1 py-0.5"
                          >
                            <CheckCircle2 className="size-3 text-emerald-600" />
                            Respondidas ({conv.answeredQuestionsCount})
                          </Badge>
                        )}
                      </div>

                      {/* Linha 2: Cliente */}
                      {conv.clientName && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Building2 className="size-3.5 opacity-70" />
                          <span>{conv.clientName}</span>
                        </div>
                      )}

                      {/* Linha 3: Preview da Última Mensagem */}
                      <div className="pt-1">
                        <p className="text-sm text-foreground/90 line-clamp-2">
                          <span className="font-semibold text-xs text-muted-foreground mr-1.5">
                            {lastMsg.expand?.user_id?.name || 'Usuário'}
                            {senderIsPcp ? ' (PCP)' : ''}:
                          </span>
                          {lastMsg.content}
                        </p>
                      </div>

                      {/* Linha 4: Destaque da pergunta pendente (se houver) */}
                      {latestPendingQuestion && (
                        <div className="mt-2 p-2 rounded-lg bg-amber-100/60 dark:bg-amber-950/30 border border-amber-300/60 dark:border-amber-800/60 flex items-start gap-2 text-xs">
                          <HelpCircle className="size-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold text-amber-950 dark:text-amber-200 block text-[11px]">
                              Pergunta pendente de {latestPendingQuestion.expand?.user_id?.name}:
                            </span>
                            <p className="text-amber-900 dark:text-amber-300 italic truncate">
                              "{latestPendingQuestion.content}"
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Lado Direito: Horário e Ações */}
                  <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0">
                    <span className="text-[11px] text-muted-foreground">
                      {lastMsg.created
                        ? formatDistanceToNow(new Date(lastMsg.created), {
                            addSuffix: true,
                            locale: ptBR,
                          })
                        : ''}
                    </span>

                    <div className="flex items-center gap-2">
                      {hasUnread && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleMarkConversationAsRead(conv)
                          }}
                          title="Marcar como lida"
                        >
                          <CheckCheck className="size-3.5" />
                          <span className="hidden sm:inline">Lida</span>
                        </Button>
                      )}

                      <Button
                        size="sm"
                        className={cn(
                          'h-8 text-xs gap-1.5 shadow-xs',
                          hasPending
                            ? 'bg-amber-600 hover:bg-amber-700 text-white'
                            : 'bg-primary text-primary-foreground',
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedConversation({
                            orderId: conv.orderId,
                            orderNumber: conv.orderNumber,
                            opNumber: conv.opNumber,
                            sector: conv.sector,
                            initialReplyTo: latestPendingQuestion || null,
                          })
                        }}
                      >
                        <span>{hasPending ? 'Responder Q&A' : 'Abrir Chat'}</span>
                        <ArrowRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Painel lateral de mensagens da conversa selecionada */}
      {selectedConversation && (
        <OrderMessagesPanel
          orderId={selectedConversation.orderId}
          orderNumber={selectedConversation.orderNumber}
          opNumber={selectedConversation.opNumber}
          open={!!selectedConversation}
          onOpenChange={(open) => !open && setSelectedConversation(null)}
          sector={selectedConversation.sector}
          initialReplyTo={selectedConversation.initialReplyTo}
          onMessagesRead={() => loadData()}
        />
      )}
    </div>
  )
}
