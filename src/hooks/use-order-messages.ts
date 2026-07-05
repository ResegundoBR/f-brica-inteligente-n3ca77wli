import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { useAuth } from '@/hooks/use-auth'
import { PcpOrderMessage } from '@/types'
import {
  type MessageChannel,
  type IndicatorState,
  isPcpSender,
  isPcpManager,
  getUserChannel,
} from '@/lib/message-sector'

export interface OrderMessageInfo {
  count: number
  unreadCount: number
  indicatorState: IndicatorState
}

export function useOrderMessages(channel?: MessageChannel) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<PcpOrderMessage[]>([])

  const isPcp = isPcpManager(user)
  const userChannel = getUserChannel(user)
  const effectiveChannel = channel ?? (isPcp ? undefined : (userChannel ?? undefined))

  const loadMessages = useCallback(async () => {
    try {
      const res = await pb.collection('pcp_order_messages').getFullList<PcpOrderMessage>({
        sort: 'created',
        expand: 'user_id.role',
      })
      const filtered = effectiveChannel ? res.filter((m) => m.sector === effectiveChannel) : res
      setMessages(filtered)
    } catch {
      /* intentionally ignored */
    }
  }, [effectiveChannel])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  useRealtime('pcp_order_messages', loadMessages)

  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const markOrderAsRead = useCallback(
    (orderId: string) => {
      const userIsPcp = isPcpManager(user)
      const messagesToMark = messagesRef.current.filter((m) => {
        if (m.order_id !== orderId || m.read) return false
        const senderIsPcp = isPcpSender(m)
        return userIsPcp ? !senderIsPcp : senderIsPcp
      })
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
    [user],
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

      const userIsPcp = isPcpManager(user)

      const myMessages = orderMessages.filter((m) => (userIsPcp ? isPcpSender(m) : !isPcpSender(m)))
      const otherMessages = orderMessages.filter((m) =>
        userIsPcp ? !isPcpSender(m) : isPcpSender(m),
      )

      const unreadFromOthers = otherMessages.filter((m) => !m.read)
      if (unreadFromOthers.length > 0) {
        return {
          count: unreadFromOthers.length,
          unreadCount: unreadFromOthers.length,
          indicatorState: 'green',
        }
      }

      const sorted = [...orderMessages].sort(
        (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
      )
      const lastMessage = sorted[sorted.length - 1]
      const lastFromMe = userIsPcp ? isPcpSender(lastMessage) : !isPcpSender(lastMessage)

      if (lastFromMe) {
        return {
          count: myMessages.length,
          unreadCount: 0,
          indicatorState: 'blue',
        }
      }

      return {
        count: orderMessages.length,
        unreadCount: 0,
        indicatorState: 'gray',
      }
    },
    [messagesByOrder, user],
  )

  return { messagesByOrder, getOrderMessageInfo, markOrderAsRead }
}
