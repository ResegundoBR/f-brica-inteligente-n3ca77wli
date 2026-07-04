import { useState, useEffect, useRef } from 'react'
import pb from '@/lib/pocketbase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'
import { cn } from '@/lib/utils'

interface ChatMessage {
  id: string
  order_id: string
  user_id: string
  content: string
  created: string
  updated: string
  expand?: {
    user_id?: { id: string; name: string }
  }
}

export function OrderMessagesPanel({
  orderId,
  orderNumber,
  open,
  onOpenChange,
}: {
  orderId: string | null
  orderNumber: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadMessages = async () => {
    if (!orderId) return
    try {
      const res = await pb.collection('pcp_order_messages').getFullList<ChatMessage>({
        filter: `order_id="${orderId}"`,
        sort: 'created',
        expand: 'user_id',
      })
      setMessages(res)
    } catch {
      /* ignored */
    }
  }

  useEffect(() => {
    if (open && orderId) {
      loadMessages()
    }
  }, [open, orderId])

  useRealtime('pcp_order_messages', (e) => {
    if (orderId && e.record.order_id === orderId) {
      loadMessages()
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
      })
      setInput('')
      loadMessages()
    } catch {
      /* ignored */
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Mensagens — OP {orderNumber}</SheetTitle>
        </SheetHeader>
        <div ref={scrollRef} className="flex-1 overflow-y-auto -mx-6 px-6 py-4">
          <div className="flex flex-col gap-3">
            {messages.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                Nenhuma mensagem ainda. Inicie a conversa sobre esta OP.
              </p>
            ) : (
              messages.map((msg) => {
                const isOwn = msg.user_id === user?.id
                return (
                  <div
                    key={msg.id}
                    className={cn('flex flex-col', isOwn ? 'items-end' : 'items-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                        isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                      )}
                    >
                      {!isOwn && msg.expand?.user_id?.name && (
                        <span className="text-xs font-semibold opacity-70 block mb-1">
                          {msg.expand.user_id.name}
                        </span>
                      )}
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1">
                      {new Date(msg.created).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
        <div className="flex gap-2 pt-4 border-t">
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
