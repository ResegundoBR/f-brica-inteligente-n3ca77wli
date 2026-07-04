import { useState, useEffect, useCallback } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { useAuth } from '@/hooks/use-auth'

export interface UnreadMessage {
  id: string
  order_id: string
  user_id: string
  content: string
  created: string
  updated: string
  expand?: {
    user_id?: { id: string; name: string }
    order_id?: { id: string; order_number: string; op_number?: string }
  }
}

export function useUnreadMessages() {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [recentMessages, setRecentMessages] = useState<UnreadMessage[]>([])
  const [hasNewMessage, setHasNewMessage] = useState(false)

  const storageKey = `pcp_msg_last_read_${user?.id || 'anon'}`

  const loadMessages = useCallback(async () => {
    if (!user) return
    try {
      const allMessages = await pb.collection('pcp_order_messages').getFullList<UnreadMessage>({
        sort: '-created',
        expand: 'user_id,order_id',
      })

      const lastReadStr = localStorage.getItem(storageKey)
      const lastRead = lastReadStr ? new Date(lastReadStr) : new Date(0)

      const unread = allMessages.filter(
        (m) => m.user_id !== user.id && new Date(m.created) > lastRead,
      )
      setUnreadCount(unread.length)
      setRecentMessages(unread.slice(0, 10))
    } catch {
      /* collection might not exist yet */
    }
  }, [user, storageKey])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  useRealtime('pcp_order_messages', (e) => {
    loadMessages()
    if (e.action === 'create' && e.record.user_id !== user?.id) {
      setHasNewMessage(true)
    }
  })

  const markAllRead = useCallback(() => {
    localStorage.setItem(storageKey, new Date().toISOString())
    setUnreadCount(0)
    setRecentMessages([])
    setHasNewMessage(false)
  }, [storageKey])

  return {
    unreadCount,
    recentMessages,
    hasNewMessage,
    setHasNewMessage,
    markAllRead,
  }
}
