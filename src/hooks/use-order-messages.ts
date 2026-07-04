import { useState, useEffect, useCallback, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { PcpOrderMessage } from '@/types'

const STORAGE_KEY = 'pcp_order_messages_read'

function getReadTimestamps(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function setReadTimestamp(orderId: string, timestamp: string) {
  const data = getReadTimestamps()
  data[orderId] = timestamp
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export interface OrderMessageInfo {
  count: number
  unreadCount: number
}

export function useOrderMessages() {
  const [messages, setMessages] = useState<PcpOrderMessage[]>([])
  const [readTimestamps, setReadTimestamps] = useState<Record<string, string>>({})

  const loadMessages = useCallback(async () => {
    try {
      const res = await pb.collection('pcp_order_messages').getFullList<PcpOrderMessage>({
        sort: 'created',
      })
      setMessages(res)
    } catch {
      /* intentionally ignored */
    }
  }, [])

  useEffect(() => {
    setReadTimestamps(getReadTimestamps())
    loadMessages()
  }, [loadMessages])

  useRealtime('pcp_order_messages', loadMessages)

  const markOrderAsRead = useCallback((orderId: string) => {
    const now = new Date().toISOString()
    setReadTimestamp(orderId, now)
    setReadTimestamps(getReadTimestamps())
  }, [])

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
      const readTime = readTimestamps[orderId]
      const unreadCount = readTime
        ? orderMessages.filter((m) => new Date(m.created) > new Date(readTime)).length
        : orderMessages.length
      return { count: orderMessages.length, unreadCount }
    },
    [messagesByOrder, readTimestamps],
  )

  return { messagesByOrder, getOrderMessageInfo, markOrderAsRead }
}
