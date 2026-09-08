import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, MessageSquare, HelpCircle, ArrowRight, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUnreadMessages } from '@/hooks/use-unread-messages'
import { useOrderMessages } from '@/hooks/use-order-messages'
import { useAuth } from '@/hooks/use-auth'
import { OrderMessagesPanel } from '@/components/OrderMessagesPanel'
import {
  isPcpSender,
  isPcpManager,
  getUserChannel,
  SECTOR_VISUALS,
  type MessageSector,
} from '@/lib/message-sector'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function MessageNotificationBell({ className }: { className?: string }) {
  const { user } = useAuth()
  const userChannel = getUserChannel(user)
  const isPcp = isPcpManager(user)
  const navigate = useNavigate()

  const {
    unreadCount,
    pendingQuestionsCount,
    totalBadgeCount,
    recentMessages,
    hasNewMessage,
    loading: unreadLoading,
    error: unreadError,
    setHasNewMessage,
    markAllRead,
    markOrderAsRead: markOrderUnreadAsRead,
    refresh,
  } = useUnreadMessages()

  const { markOrderAsRead } = useOrderMessages(isPcp ? undefined : (userChannel ?? undefined))

  const handleMessagesRead = useCallback(
    (orderId: string) => {
      markOrderAsRead(orderId)
      markOrderUnreadAsRead(orderId)
      refresh()
    },
    [markOrderAsRead, markOrderUnreadAsRead, refresh],
  )

  const [shake, setShake] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<{
    id: string
    orderNumber: string
    opNumber: string
    sector?: MessageSector
  } | null>(null)

  useEffect(() => {
    if (hasNewMessage) {
      setShake(true)
      const timer = setTimeout(() => setShake(false), 600)
      return () => clearTimeout(timer)
    }
  }, [hasNewMessage])

  return (
    <>
      <style>{`
        @keyframes bell-shake {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(-14deg); }
          30% { transform: rotate(14deg); }
          45% { transform: rotate(-10deg); }
          60% { transform: rotate(10deg); }
          75% { transform: rotate(-6deg); }
          90% { transform: rotate(6deg); }
        }
      `}</style>
      <Popover
        onOpenChange={(open) => {
          if (open) setHasNewMessage(false)
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('relative h-9 w-9', className)}
            title={
              pendingQuestionsCount > 0
                ? `${pendingQuestionsCount} pergunta(s) pendente(s)`
                : unreadCount > 0
                  ? `${unreadCount} mensagem(ns) não lida(s)`
                  : 'Central de Comunicações'
            }
          >
            <Bell
              className={cn(
                'h-5 w-5 transition-transform',
                pendingQuestionsCount > 0 && 'text-amber-500',
              )}
              style={shake ? { animation: 'bell-shake 0.6s ease-in-out' } : undefined}
            />
            {totalBadgeCount > 0 && (
              <span
                className={cn(
                  'absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-sm',
                  pendingQuestionsCount > 0 ? 'bg-amber-500 animate-pulse' : 'bg-red-500',
                )}
              >
                {totalBadgeCount > 99 ? '99+' : totalBadgeCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-88 p-0">
          <div className="px-4 py-3 font-medium border-b flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="size-4 text-blue-600" />
              <span className="font-semibold text-sm">Comunicações das OPs</span>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6 px-1.5 text-muted-foreground hover:text-foreground"
                onClick={markAllRead}
              >
                Ler todas
              </Button>
            )}
          </div>

          {/* Destaque para perguntas pendentes */}
          {pendingQuestionsCount > 0 && (
            <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 flex items-center justify-between text-xs">
              <span className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <Clock className="size-3.5 text-amber-600 animate-pulse" />
                {pendingQuestionsCount} pergunta(s) pendente(s)
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] text-amber-800 dark:text-amber-300 font-semibold hover:underline p-0"
                onClick={() => navigate('/pcp/comunicacoes')}
              >
                Abrir Central
              </Button>
            </div>
          )}

          <div className="max-h-[340px] overflow-y-auto divide-y">
            {unreadError ? (
              <div className="p-4 text-center space-y-2">
                <p className="text-xs text-destructive font-medium">{unreadError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refresh()}
                  className="text-xs h-7"
                >
                  Tentar novamente
                </Button>
              </div>
            ) : unreadLoading && recentMessages.length === 0 ? (
              <div className="p-6 text-sm text-center text-muted-foreground flex items-center justify-center gap-2">
                <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>Carregando mensagens...</span>
              </div>
            ) : recentMessages.length === 0 ? (
              <div className="p-6 text-sm text-center text-muted-foreground space-y-1">
                <p>Nenhuma mensagem nova ou pendência.</p>
                <p className="text-xs">Tudo atualizado!</p>
              </div>
            ) : (
              recentMessages.map((msg) => {
                const isQuestion = msg.type === 'Pergunta'
                const isPending = isQuestion && msg.status === 'Pendente'
                const senderPcp = isPcpSender(msg)
                const sec = (msg.sector || 'Operador') as MessageSector
                const meta = SECTOR_VISUALS[sec] || SECTOR_VISUALS.Operador
                const SectorIcon = meta.icon

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      'p-3 hover:bg-muted/50 cursor-pointer transition-colors',
                      isPending ? 'bg-amber-50/30 dark:bg-amber-950/20' : '',
                    )}
                    onClick={() => {
                      setSelectedOrder({
                        id: msg.order_id,
                        orderNumber: msg.expand?.order_id?.order_number || msg.order_id,
                        opNumber: msg.expand?.order_id?.op_number || '',
                        sector: msg.sector,
                      })
                    }}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={cn(
                          'p-1.5 rounded-md mt-0.5 border shrink-0',
                          meta.badgeBg,
                          meta.badgeBorder,
                        )}
                      >
                        <SectorIcon className="size-3.5" style={{ color: meta.color }} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-semibold text-xs text-foreground truncate">
                            OP {msg.expand?.order_id?.order_number || msg.order_id}
                          </span>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(msg.created), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="text-[11px] text-muted-foreground font-medium">
                            {msg.expand?.user_id?.name || 'Usuário'}
                            {senderPcp ? ' (PCP)' : ''}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn('text-[9px] px-1 py-0', meta.badgeBg, meta.badgeText)}
                          >
                            {meta.label}
                          </Badge>
                          {isQuestion && (
                            <Badge
                              className={cn(
                                'text-[9px] px-1 py-0 font-bold',
                                isPending ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white',
                              )}
                            >
                              {isPending ? 'Pendente' : 'Respondida'}
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs text-foreground/90 line-clamp-2">{msg.content}</p>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Rodapé do sino com link direto para a Central de Comunicações */}
          <div className="p-2 border-t bg-muted/20">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs justify-center gap-1.5 h-8 font-semibold"
              onClick={() => navigate('/pcp/comunicacoes')}
            >
              <span>Ver todas na Central de Comunicações</span>
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <OrderMessagesPanel
        orderId={selectedOrder?.id || null}
        orderNumber={selectedOrder?.orderNumber || ''}
        opNumber={selectedOrder?.opNumber || ''}
        open={!!selectedOrder}
        onOpenChange={(open) => !open && setSelectedOrder(null)}
        onMessagesRead={handleMessagesRead}
        sector={selectedOrder?.sector || (isPcp ? 'all' : userChannel || 'all')}
      />
    </>
  )
}
