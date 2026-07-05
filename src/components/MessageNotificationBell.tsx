import { useState, useEffect } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Bell, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUnreadMessages } from '@/hooks/use-unread-messages'
import { useOrderMessages } from '@/hooks/use-order-messages'
import { useAuth } from '@/hooks/use-auth'
import { OrderMessagesPanel } from '@/components/OrderMessagesPanel'
import { isPcpSender, isPcpManager, getUserChannel } from '@/lib/message-sector'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function MessageNotificationBell({ className }: { className?: string }) {
  const { user } = useAuth()
  const userChannel = getUserChannel(user)
  const isPcp = isPcpManager(user)
  const { unreadCount, recentMessages, hasNewMessage, setHasNewMessage, markAllRead } =
    useUnreadMessages()
  const { markOrderAsRead } = useOrderMessages(isPcp ? undefined : (userChannel ?? undefined))
  const [shake, setShake] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<{
    id: string
    orderNumber: string
    opNumber: string
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
          <Button variant="ghost" size="icon" className={cn('relative h-9 w-9', className)}>
            <Bell
              className="h-5 w-5 transition-transform"
              style={shake ? { animation: 'bell-shake 0.6s ease-in-out' } : undefined}
            />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="px-4 py-3 font-medium border-b flex items-center justify-between">
            <span>Mensagens Não Lidas</span>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-6" onClick={markAllRead}>
                Marcar todas como lidas
              </Button>
            )}
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {recentMessages.length === 0 ? (
              <div className="p-4 text-sm text-center text-muted-foreground">
                Nenhuma mensagem nova.
              </div>
            ) : (
              recentMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="p-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    setSelectedOrder({
                      id: msg.order_id,
                      orderNumber: msg.expand?.order_id?.order_number || msg.order_id,
                      opNumber: msg.expand?.order_id?.op_number || '',
                    })
                  }}
                >
                  <div className="flex items-start gap-2">
                    <MessageCircle className="size-4 mt-0.5 shrink-0 text-blue-500" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        {msg.expand?.user_id?.name || 'Usuário'} -{' '}
                        {isPcpSender(msg) ? 'PCP' : msg.sector || 'Geral'} • OP{' '}
                        {msg.expand?.order_id?.order_number || msg.order_id}
                      </div>
                      <p className="text-sm line-clamp-2">{msg.content}</p>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(msg.created), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      <OrderMessagesPanel
        orderId={selectedOrder?.id || null}
        orderNumber={selectedOrder?.orderNumber || ''}
        opNumber={selectedOrder?.opNumber || ''}
        open={!!selectedOrder}
        onOpenChange={(open) => !open && setSelectedOrder(null)}
        onMessagesRead={markOrderAsRead}
        sector={isPcp ? 'all' : userChannel || 'all'}
      />
    </>
  )
}
