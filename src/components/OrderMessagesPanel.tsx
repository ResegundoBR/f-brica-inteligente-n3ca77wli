import { useState, useEffect, useRef, useCallback } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'
import { PcpOrderMessage } from '@/types'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { getMessageSenderSector, SECTOR_LABELS } from '@/lib/message-sector'

interface OrderMessagesPanelProps {
  orderId: string | null
  orderNumber: string
  opNumber?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onMessagesRead?: (orderId: string) => void
}

export function OrderMessagesPanel({
  orderId,
  orderNumber,
  opNumber,
  open,
  onOpenChange,
  onMessagesRead,
}: OrderMessagesPanelProps) {
  const [messages, setMessages] = useState<PcpOrderMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()

  const loadMessages = useCallback(async () => {
    if (!orderId) return
    try {
      const res = await pb.collection('pcp_order_messages').getFullList<PcpOrderMessage>({
        filter: `order_id="${orderId}"`,
        sort: 'created',
        expand: 'user_id.role',
      })
      setMessages(res)
    } catch {
      /* intentionally ignored */
    }
  }, [orderId])

  useEffect(() => {
    if (open && orderId) {
      loadMessages()
      onMessagesRead?.(orderId)
    }
  }, [open, orderId, loadMessages, onMessagesRead])

  useRealtime('pcp_order_messages', () => {
    if (open && orderId) {
      loadMessages()
      onMessagesRead?.(orderId)
    }
  })

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || !orderId || !user) return
    setSending(true)
    try {
      await pb.collection('pcp_order_messages').create({
        order_id: orderId,
        user_id: user.id,
        content: input.trim(),
        read: false,
      })
      setInput('')
      await loadMessages()
      onMessagesRead?.(orderId)
    } catch {
      /* intentionally ignored */
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-md p-0">
        <SheetHeader className="px-4 py-3 border-b shrink-0 space-y-1">
          <SheetTitle className="text-base">Mensagens da OP</SheetTitle>
          <SheetDescription className="flex flex-row items-center gap-3 flex-wrap">
            <span className="font-semibold text-foreground">Pedido: {orderNumber || '-'}</span>
            <span className="text-sm text-muted-foreground">OP: {opNumber || '-'}</span>
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
          <div className="p-4 space-y-3">
            {messages.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                Nenhuma mensagem ainda. Inicie a conversa abaixo.
              </p>
            ) : (
              messages.map((msg) => {
                const sector = getMessageSenderSector(msg)
                const isPcp = sector === 'pcp'
                return (
                  <div
                    key={msg.id}
                    className={cn('flex flex-col', isPcp ? 'items-end' : 'items-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                        isPcp ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white',
                      )}
                    >
                      <span className="block text-xs font-semibold mb-0.5 opacity-90">
                        {msg.expand?.user_id?.name || 'Usuário'} - {SECTOR_LABELS[sector]}
                      </span>
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      {format(new Date(msg.created), 'dd/MM/yyyy HH:mm')}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
        <div className="p-3 border-t flex gap-2 shrink-0">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Digite sua mensagem..."
            disabled={sending}
          />
          <Button size="icon" onClick={handleSend} disabled={sending || !input.trim()}>
            <Send className="size-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
