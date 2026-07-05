import { useState, useEffect, useCallback, useRef } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { useAuth } from '@/hooks/use-auth'
import type { Role } from '@/types'
import { getUserSector, getMessageSenderSector } from '@/lib/message-sector'

export interface UnreadMessage {
  id: string
  order_id: string
  user_id: string
  content: string
  read?: boolean
  created: string
  updated: string
  expand?: {
    user_id?: { id: string; name: string; expand?: { role?: Role } }
    order_id?: { id: string; order_number: string; op_number?: string }
  }
}

export function useUnreadMessages() {
  const { user } = useAuth()
  const userSector = getUserSector(user)
  const [unreadCount, setUnreadCount] = useState(0)
  const [recentMessages, setRecentMessages] = useState<UnreadMessage[]>([])
  const [hasNewMessage, setHasNewMessage] = useState(false)
  const allUnreadRef = useRef<UnreadMessage[]>([])

  const loadMessages = useCallback(async () => {
    if (!user) return
    try {
      const allMessages = await pb.collection('pcp_order_messages').getFullList<UnreadMessage>({
        sort: '-created',
        expand: 'user_id.role,order_id',
        filter: 'read=false',
      })

      const unread = allMessages.filter((m) => getMessageSenderSector(m) !== userSector)
      allUnreadRef.current = unread
      setUnreadCount(unread.length)
      setRecentMessages(unread.slice(0, 10))
    } catch {
      /* collection might not exist yet */
    }
  }, [user, userSector])

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
    allUnreadRef.current.forEach((m) => {
      pb.collection('pcp_order_messages')
        .update(m.id, { read: true })
        .catch(() => {})
    })
    setUnreadCount(0)
    setRecentMessages([])
    setHasNewMessage(false)
  }, [])

  return {
    unreadCount,
    recentMessages,
    hasNewMessage,
    setHasNewMessage,
    markAllRead,
  }
}
