import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import type { PcpOrderMessage, MessageSector, MessageType, MessageStatus } from '@/types'
import { subscribeToSharedMessages } from '@/services/pcp-order-messages-store'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Send,
  HelpCircle,
  Info,
  Reply,
  CheckCircle2,
  Clock,
  X,
  Factory,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  isPcpSender,
  isPcpManager,
  getUserChannel,
  getUserSector,
  SECTOR_OPTIONS,
  SECTOR_VISUALS,
  type MessageChannel,
} from '@/lib/message-sector'
import { createOrderMessage, markOrderMessagesAsRead } from '@/services/pcp-order-messages'
import { toast } from '@/hooks/use-toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface OrderMessagesPanelProps {
  orderId: string | null
  orderNumber: string
  opNumber?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onMessagesRead?: (orderId: string) => void
  sector?: MessageChannel | 'all'
  initialReplyTo?: PcpOrderMessage | null
}

export function OrderMessagesPanel({
  orderId,
  orderNumber,
  opNumber,
  open,
  onOpenChange,
  onMessagesRead,
  sector = 'all',
  initialReplyTo = null,
}: OrderMessagesPanelProps) {
  const [messages, setMessages] = useState<PcpOrderMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [msgType, setMsgType] = useState<MessageType>('Pergunta')
  const [replyingTo, setReplyingTo] = useState<PcpOrderMessage | null>(initialReplyTo)
  const [pendingLinkTarget, setPendingLinkTarget] = useState<PcpOrderMessage | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { user } = useAuth()

  const userIsPcp = isPcpManager(user)
  const detectedUserSector = getUserSector(user)
  const userChannel = getUserChannel(user)

  // O gestor do PCP pode filtrar por canal ou ver tudo;
  // para perfis de setor (Comercial, Fabricação, Montagem...), o canal é fixo no seu setor
  const [selectedChannel, setSelectedChannel] = useState<MessageSector>(
    sector !== 'all' ? (sector as MessageSector) : userChannel || 'Comercial',
  )

  useEffect(() => {
    if (initialReplyTo) {
      setReplyingTo(initialReplyTo)
      setMsgType('Informação')
      if (initialReplyTo.sector) {
        setSelectedChannel(initialReplyTo.sector)
      }
    }
  }, [initialReplyTo])

  // Atualiza canal quando o setor da prop muda
  useEffect(() => {
    if (sector !== 'all') {
      setSelectedChannel(sector as MessageSector)
    } else if (userChannel) {
      setSelectedChannel(userChannel)
    }
  }, [sector, userChannel])

  // Função para marcar como lidas as mensagens da conversa direcionadas ao perfil atual
  const markAsRead = useCallback(async () => {
    if (!orderId || !user) return
    try {
      await markOrderMessagesAsRead(orderId, user, userIsPcp, userChannel)
      onMessagesRead?.(orderId)
    } catch {
      /* ignore */
    }
  }, [orderId, user, userIsPcp, userChannel, onMessagesRead])

  const loadMessages = useCallback(async () => {
    if (!orderId) return
    try {
      const res = await pb.collection('pcp_order_messages').getFullList<PcpOrderMessage>({
        filter: `order_id="${orderId}"`,
        sort: 'created',
        expand: 'user_id.role,reply_to.user_id',
      })

      // Se for usuário de setor (não PCP), restringe à sua própria thread/setor
      const visible = res.filter((m) => {
        if (userIsPcp) return true
        if (!userChannel) return true
        if (!m.sector) return true
        return m.sector === userChannel
      })

      setMessages(visible)
    } catch {
      /* intentionally ignored */
    }
  }, [orderId, userIsPcp, userChannel])

  useEffect(() => {
    if (open && orderId) {
      loadMessages()
      markAsRead()
    }
  }, [open, orderId, loadMessages, markAsRead])

  // Escuta a fonte compartilhada de mensagens (pcp-order-messages-store)
  // em vez de criar uma assinatura realtime separada do PocketBase.
  useEffect(() => {
    if (!open || !orderId) return
    const unsub = subscribeToSharedMessages((allSharedMessages) => {
      // Quando novas mensagens chegarem via store compartilhado, atualiza a lista local do painel
      const orderMsgs = allSharedMessages.filter((m) => m.order_id === orderId)
      const visible = orderMsgs.filter((m) => {
        if (userIsPcp) return true
        if (!userChannel) return true
        if (!m.sector) return true
        return m.sector === userChannel
      })
      // Ordena por data de criação crescente
      visible.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())
      setMessages(visible)
      markAsRead()
    })
    return () => {
      unsub()
    }
  }, [open, orderId, userIsPcp, userChannel, markAsRead])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, selectedChannel])

  // Contadores por setor para o gestor PCP
  const sectorCounts = useMemo(() => {
    const counts: Record<string, { total: number; pending: number }> = {}
    SECTOR_OPTIONS.forEach((sec) => {
      counts[sec] = { total: 0, pending: 0 }
    })
    messages.forEach((m) => {
      const sec = m.sector || 'Comercial'
      if (!counts[sec]) counts[sec] = { total: 0, pending: 0 }
      counts[sec].total += 1
      if (m.type === 'Pergunta' && m.status === 'Pendente') {
        counts[sec].pending += 1
      }
    })
    return counts
  }, [messages])

  // Filtra mensagens pelo canal selecionado quando o usuário for PCP ou sector === 'all'
  const displayMessages = useMemo(() => {
    if (!userIsPcp && userChannel) {
      return messages.filter((m) => !m.sector || m.sector === userChannel)
    }
    return messages.filter((m) => {
      if (!m.sector) return selectedChannel === 'Comercial' || selectedChannel === 'Operador'
      return m.sector === selectedChannel
    })
  }, [messages, userIsPcp, userChannel, selectedChannel])

  const handleStartReply = (msg: PcpOrderMessage) => {
    setReplyingTo(msg)
    setMsgType('Informação')
    if (msg.sector) {
      setSelectedChannel(msg.sector)
    }
    setTimeout(() => {
      inputRef.current?.focus()
    }, 50)
  }

  const handleCancelReply = () => {
    setReplyingTo(null)
  }

  const handleToggleStatus = async (msg: PcpOrderMessage) => {
    const nextStatus: MessageStatus = msg.status === 'Pendente' ? 'Respondida' : 'Pendente'
    try {
      await pb.collection('pcp_order_messages').update(msg.id, {
        status: nextStatus,
      })
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: nextStatus } : m)))
    } catch {
      /* intentionally ignored */
    }
  }

  // Executa o envio real da mensagem com ou sem reply_to vinculado
  const executeSendMessage = async (replyToTarget?: PcpOrderMessage | null) => {
    if (!input.trim() || !orderId || !user) return
    setSending(true)
    try {
      const activeReplyTo = replyToTarget !== undefined ? replyToTarget : replyingTo

      // Setor da mensagem:
      // Se o usuário é PCP, a mensagem é direcionada ao canal selecionado (ou ao canal da pergunta sendo respondida)
      // Se o usuário é do setor (ex: Comercial, Acabamento, etc.), é detectado automaticamente pelo perfil
      const fallbackSector = userIsPcp
        ? selectedChannel
        : detectedUserSector !== 'pcp'
          ? detectedUserSector
          : selectedChannel

      const messageSector: MessageSector =
        activeReplyTo && activeReplyTo.sector ? activeReplyTo.sector : fallbackSector

      const payloadType = activeReplyTo ? 'Informação' : msgType
      const payloadStatus = payloadType === 'Pergunta' ? 'Pendente' : undefined

      await createOrderMessage({
        order_id: orderId,
        user_id: user.id,
        content: input.trim(),
        sector: messageSector,
        type: payloadType,
        status: payloadStatus,
        reply_to: activeReplyTo ? activeReplyTo.id : undefined,
        read: false,
      })

      setInput('')
      setReplyingTo(null)
      setPendingLinkTarget(null)
      await loadMessages()
      await markAsRead()

      toast({
        title: 'Mensagem enviada',
        description: activeReplyTo
          ? 'Sua resposta foi vinculada à pergunta com sucesso!'
          : 'Sua mensagem foi enviada com sucesso.',
      })

      // Fecha o painel automaticamente após o envio bem-sucedido
      onOpenChange(false)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar mensagem',
        description: 'Não foi possível enviar a mensagem. Tente novamente.',
      })
    } finally {
      setSending(false)
    }
  }

  const handleSend = () => {
    if (!input.trim() || !orderId || !user) return

    // Regra (3): Se for mensagem comum (sem vinculação/reply_to) e msgType !== 'Pergunta',
    // verificar se a conversa no canal atual possui pergunta pendente de outro usuário.
    // Se tiver, oferecer vincular como resposta dessa pergunta antes de enviar.
    if (!replyingTo && msgType !== 'Pergunta') {
      const relevantSector = userIsPcp ? selectedChannel : userChannel
      const pendingQuestionsInSector = messages.filter((m) => {
        if (m.type !== 'Pergunta' || m.status !== 'Pendente') return false
        // Pergunta feita por outro usuário
        if (m.user_id === user.id) return false
        if (userIsPcp) {
          return !m.sector || m.sector === relevantSector
        }
        return !m.sector || m.sector === relevantSector
      })

      if (pendingQuestionsInSector.length > 0) {
        // Encontra a pergunta pendente mais recente do setor
        const targetQ = pendingQuestionsInSector[pendingQuestionsInSector.length - 1]
        setPendingLinkTarget(targetQ)
        return
      }
    }

    executeSendMessage()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-lg p-0 h-full">
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b shrink-0 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <MessageSquare className="size-5" />
              </div>
              <div>
                <SheetTitle className="text-base font-bold">
                  Central de Comunicação da OP
                </SheetTitle>
                <SheetDescription className="flex items-center gap-2 mt-0.5 text-xs">
                  <span className="font-semibold text-foreground">OP {orderNumber || '-'}</span>
                  {opNumber && opNumber !== orderNumber && (
                    <span className="text-muted-foreground">• Ref: {opNumber}</span>
                  )}
                </SheetDescription>
              </div>
            </div>
          </div>

          {/* Abas de setores (visíveis para gestores do PCP) */}
          {userIsPcp && (
            <div className="pt-3">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Canais por Setor
              </span>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {SECTOR_OPTIONS.map((sec) => {
                  const meta = SECTOR_VISUALS[sec]
                  const Icon = meta.icon
                  const isSelected = selectedChannel === sec
                  const counts = sectorCounts[sec] || { total: 0, pending: 0 }
                  return (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setSelectedChannel(sec)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap shrink-0',
                        isSelected
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm border-transparent'
                          : 'bg-card text-muted-foreground hover:text-foreground border-border hover:bg-muted/60',
                      )}
                    >
                      <Icon
                        className="size-3.5"
                        style={{ color: isSelected ? 'inherit' : meta.color }}
                      />
                      <span>{meta.label}</span>
                      {counts.pending > 0 && (
                        <span
                          className={cn(
                            'px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                            isSelected ? 'bg-amber-400 text-slate-950' : 'bg-amber-500 text-white',
                          )}
                          title={`${counts.pending} pergunta(s) pendente(s)`}
                        >
                          {counts.pending}
                        </span>
                      )}
                      {counts.pending === 0 && counts.total > 0 && (
                        <span className="text-[10px] opacity-70">({counts.total})</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Se for usuário de setor restrito, mostra badge indicativo do canal ativo */}
          {!userIsPcp && userChannel && (
            <div className="pt-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Canal de comunicação:</span>
              {(() => {
                const meta = SECTOR_VISUALS[userChannel]
                const Icon = meta.icon
                return (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs gap-1 py-0.5',
                      meta.badgeBg,
                      meta.badgeText,
                      meta.badgeBorder,
                    )}
                  >
                    <Icon className="size-3" style={{ color: meta.color }} />
                    {meta.label}
                  </Badge>
                )
              })()}
            </div>
          )}
        </SheetHeader>

        {/* Lista de Mensagens */}
        <ScrollArea className="flex-1 min-h-0 bg-muted/20" ref={scrollRef}>
          <div className="p-4 space-y-4">
            {displayMessages.length === 0 ? (
              <div className="text-center py-12 px-4 space-y-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <MessageSquare className="size-6 opacity-60" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  Nenhuma mensagem no canal {selectedChannel}
                </p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Envie uma pergunta ou informação para iniciar o alinhamento com a equipe.
                </p>
              </div>
            ) : (
              displayMessages.map((msg) => {
                const isOwnMessage = msg.user_id === user?.id
                const senderIsPcp = isPcpSender(msg)
                const msgSector = (msg.sector || 'Operador') as MessageSector
                const meta = SECTOR_VISUALS[msgSector] || SECTOR_VISUALS.Operador
                const SectorIcon = meta.icon
                const isQuestion = msg.type === 'Pergunta'
                const isPending = isQuestion && msg.status === 'Pendente'
                const isAnswered = isQuestion && msg.status === 'Respondida'
                const isReply = !!msg.reply_to
                const repliedMsg = msg.expand?.reply_to

                return (
                  <div
                    key={msg.id}
                    id={`msg-${msg.id}`}
                    className={cn(
                      'flex flex-col gap-1',
                      isOwnMessage ? 'items-end' : 'items-start',
                    )}
                  >
                    {/* Linha superior: remetente, setor, tipo */}
                    <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {isOwnMessage ? 'Você' : msg.expand?.user_id?.name || 'Usuário'}
                      </span>
                      <span>•</span>
                      {senderIsPcp ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-[10px]">
                          <Factory className="size-2.5 text-blue-600" /> PCP
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.2 rounded font-semibold text-[10px] border',
                            meta.badgeBg,
                            meta.badgeText,
                            meta.badgeBorder,
                          )}
                        >
                          <SectorIcon className="size-2.5" style={{ color: meta.color }} />
                          {meta.label}
                        </span>
                      )}

                      {/* Tipo: Pergunta ou Informação */}
                      {isQuestion ? (
                        <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-medium text-[10px]">
                          <HelpCircle className="size-3" /> Pergunta
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-muted-foreground font-medium text-[10px]">
                          <Info className="size-3" /> Info
                        </span>
                      )}
                    </div>

                    {/* Bloco da mensagem */}
                    <div
                      className={cn(
                        'relative max-w-[88%] sm:max-w-[82%] rounded-2xl p-3 shadow-sm border transition-all text-sm',
                        isOwnMessage
                          ? 'bg-blue-600 text-white border-blue-700 rounded-br-xs'
                          : cn(
                              'bg-card text-card-foreground border-border rounded-bl-xs',
                              meta.bubbleBorder,
                              'border-l-4',
                            ),
                      )}
                    >
                      {/* Vínculo de Q&A se for uma resposta */}
                      {isReply && (
                        <div
                          className={cn(
                            'mb-2 p-2 rounded-lg text-xs border flex items-start gap-1.5',
                            isOwnMessage
                              ? 'bg-blue-700/60 border-blue-500/50 text-blue-100'
                              : 'bg-muted/80 border-border text-muted-foreground',
                          )}
                        >
                          <Reply className="size-3.5 mt-0.5 shrink-0 opacity-80" />
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold block text-[10px] opacity-90">
                              Em resposta a{' '}
                              {repliedMsg?.expand?.user_id?.name || 'pergunta anterior'}:
                            </span>
                            <p className="line-clamp-2 italic text-[11px]">
                              {repliedMsg?.content || 'Pergunta vinculada'}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Conteúdo principal */}
                      <p className="whitespace-pre-wrap break-words leading-relaxed">
                        {msg.content}
                      </p>

                      {/* Barra de rodapé do balão */}
                      <div
                        className={cn(
                          'mt-2 pt-1.5 border-t flex items-center justify-between gap-2 text-[10px]',
                          isOwnMessage
                            ? 'border-blue-500/40 text-blue-100'
                            : 'border-border text-muted-foreground',
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>
                            {msg.created
                              ? format(new Date(msg.created), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                              : ''}
                          </span>

                          {/* Badge de status para perguntas */}
                          {isQuestion && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (userIsPcp || isOwnMessage) {
                                  handleToggleStatus(msg)
                                }
                              }}
                              disabled={!userIsPcp && !isOwnMessage}
                              className={cn(
                                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-bold transition-transform hover:scale-105',
                                isPending
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800',
                                (userIsPcp || isOwnMessage) && 'cursor-pointer',
                              )}
                              title={
                                userIsPcp || isOwnMessage
                                  ? 'Clique para alternar status Pendente / Respondida'
                                  : undefined
                              }
                            >
                              {isPending ? (
                                <>
                                  <Clock className="size-2.5 animate-pulse text-amber-600" />{' '}
                                  Pendente
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="size-2.5 text-emerald-600" /> Respondida
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Botão Responder (Q&A) */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartReply(msg)}
                          className={cn(
                            'h-5 px-1.5 text-[10px] gap-1',
                            isOwnMessage
                              ? 'text-white hover:bg-blue-700 hover:text-white'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <Reply className="size-3" /> Responder
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>

        {/* Rodapé / Input de Envio */}
        <div className="border-t bg-card shrink-0 p-3 space-y-2.5">
          {/* Banner de Resposta Vinculada (Q&A) */}
          {replyingTo && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Reply className="size-4 text-blue-600 shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold text-blue-950 dark:text-blue-200 block truncate">
                    Respondendo a {replyingTo.expand?.user_id?.name || 'mensagem'}
                    {replyingTo.sector ? ` (${replyingTo.sector})` : ''}:
                  </span>
                  <p className="text-[11px] text-blue-800 dark:text-blue-300 truncate">
                    {replyingTo.content}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCancelReply}
                className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                title="Cancelar resposta"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )}

          {/* Seletores de Tipo e Setor */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {/* Toggle Pergunta × Informação */}
            <div className="inline-flex rounded-lg border p-0.5 bg-muted/40">
              <button
                type="button"
                onClick={() => setMsgType('Pergunta')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  msgType === 'Pergunta' && !replyingTo
                    ? 'bg-amber-500 text-white shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <HelpCircle className="size-3" /> Pergunta
              </button>
              <button
                type="button"
                onClick={() => setMsgType('Informação')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  msgType === 'Informação' || replyingTo
                    ? 'bg-blue-600 text-white shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Info className="size-3" /> Informação
              </button>
            </div>

            {/* Indicação do Setor de Destino / Origem */}
            <div className="text-[11px] flex items-center gap-1 text-muted-foreground">
              <span>Setor:</span>
              {(() => {
                const targetSector = userIsPcp ? selectedChannel : detectedUserSector
                const sec = (targetSector === 'pcp' ? 'Operador' : targetSector) as MessageSector
                const meta = SECTOR_VISUALS[sec] || SECTOR_VISUALS.Operador
                const Icon = meta.icon
                return (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] gap-1 py-0 px-1.5',
                      meta.badgeBg,
                      meta.badgeText,
                      meta.badgeBorder,
                    )}
                  >
                    <Icon className="size-2.5" style={{ color: meta.color }} />
                    {meta.label}
                  </Badge>
                )
              })()}
            </div>
          </div>

          {/* Input de texto + botão Enviar */}
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={
                replyingTo
                  ? 'Digite sua resposta vinculada...'
                  : msgType === 'Pergunta'
                    ? 'Digite sua pergunta ao setor...'
                    : 'Digite uma informação ou aviso...'
              }
              disabled={sending}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
            >
              <Send className="size-4" />
              <span className="hidden sm:inline">{replyingTo ? 'Responder' : 'Enviar'}</span>
            </Button>
          </div>
        </div>

        {/* Diálogo de confirmação para vincular mensagem comum a pergunta pendente existente */}
        <AlertDialog
          open={!!pendingLinkTarget}
          onOpenChange={(isOpen) => {
            if (!isOpen) setPendingLinkTarget(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <HelpCircle className="size-5 text-amber-500" />
                Vincular como resposta da pergunta pendente?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-sm pt-1">
                <span>Esta conversa possui uma pergunta pendente que ainda aguarda retorno:</span>
                <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-foreground text-xs space-y-1">
                  <div className="font-semibold text-amber-900 dark:text-amber-200 flex items-center justify-between">
                    <span>{pendingLinkTarget?.expand?.user_id?.name || 'Usuário'}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {pendingLinkTarget?.sector || 'Canal'}
                    </Badge>
                  </div>
                  <p className="italic text-muted-foreground line-clamp-3">
                    "{pendingLinkTarget?.content}"
                  </p>
                </div>
                <span>
                  Deseja vincular sua mensagem como resposta direta a essa pergunta para marcá-la
                  automaticamente como <strong>Respondida</strong>?
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-0">
              <AlertDialogCancel
                onClick={() => {
                  const target = pendingLinkTarget
                  setPendingLinkTarget(null)
                  // Envia como mensagem comum avulsa (sem vincular)
                  executeSendMessage(null)
                }}
              >
                Não, enviar sem vincular
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                onClick={() => {
                  const target = pendingLinkTarget
                  setPendingLinkTarget(null)
                  // Envia vinculada à pergunta pendente
                  executeSendMessage(target)
                }}
              >
                Sim, vincular e responder
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  )
}
