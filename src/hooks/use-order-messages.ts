import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { useAuth } from '@/hooks/use-auth'
import { PcpOrderMessage } from '@/types'
import { type MessageChannel, type IndicatorState } from '@/lib/message-sector'

export interface OrderMessageInfo {
  count: number
  unreadCount: number
  indicatorState: IndicatorState
}

export function useOrderMessages(channel?: MessageChannel) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<PcpOrderMessage[]>([])

  const loadMessages = useCallback(async () => {
    try {
      const res = await pb.collection('pcp_order_messages').getFullList<PcpOrderMessage>({
        sort: 'created',
        expand: 'user_id.role',
      })
      const filtered = channel ? res.filter((m) => m.sector === channel) : res
      setMessages(filtered)
    } catch {
      /* intentionally ignored */
    }
  }, [channel])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  useRealtime('pcp_order_messages', loadMessages)

  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const markOrderAsRead = useCallback(
    (orderId: string) => {
      const messagesToMark = messagesRef.current.filter(
        (m) => m.order_id === orderId && !m.read && m.user_id !== user?.id,
      )
      if (messagesToMark.length > 0) {
        const markIds = new Set(messagesToMark.map((m) => m.id))
        setMessages((prev) => prev.map((m) => (markIds.has(m.id) ? { ...m, read: true } : m)))
      }
      messagesToMark.forEach((m) => {
        pb.collection('pcp_order_messages')
          .update(m.id, { read: true })
          .catch(() => {})
      })
    },
    [user?.id],
  )

  const messagesByOrder = useMemo(() => {
    const map: Record<string, PcpOrderMessage[]> = {}
    messages.forEach((m) => {
      if (!map[m.order_id]) map[m.order_id] = []
      map[m.order_id].push(m)
    })
    return map
  }, [messages])

  const getOrderMessageInfo = useCallback(
    (orderId: string): OrderMessageInfo => {
      const orderMessages = messagesByOrder[orderId] || []
      if (orderMessages.length === 0) {
        return { count: 0, unreadCount: 0, indicatorState: 'none' }
      }

      const otherMessages = orderMessages.filter((m) => m.user_id !== user?.id)
      if (otherMessages.length === 0) {
        return { count: orderMessages.length, unreadCount: 0, indicatorState: 'gray' }
      }

      const unreadFromOthers = otherMessages.filter((m) => !m.read)
      if (unreadFromOthers.length > 0) {
        return {
          count: orderMessages.length,
          unreadCount: unreadFromOthers.length,
          indicatorState: 'green',
        }
      }

      const sorted = [...orderMessages].sort(
        (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
      )
      const lastMessage = sorted[sorted.length - 1]

      if (lastMessage.user_id === user?.id) {
        return { count: orderMessages.length, unreadCount: 0, indicatorState: 'blue' }
      }

      return { count: orderMessages.length, unreadCount: 0, indicatorState: 'gray' }
    },
    [messagesByOrder, user?.id],
  )

  return { messagesByOrder, getOrderMessageInfo, markOrderAsRead }
}
