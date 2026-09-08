import { useState, useEffect, useCallback, useRef } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { useAuth } from '@/hooks/use-auth'
import type { Role, PcpOrderMessage, MessageSector } from '@/types'
import { isPcpSender, isPcpManager, getUserChannel } from '@/lib/message-sector'

export type UnreadMessage = PcpOrderMessage

export function useUnreadMessages() {
  const { user } = useAuth()
  const isPcp = isPcpManager(user)
  const userChannel = getUserChannel(user)

  const [unreadCount, setUnreadCount] = useState(0)
  const [pendingQuestionsCount, setPendingQuestionsCount] = useState(0)
  const [recentMessages, setRecentMessages] = useState<UnreadMessage[]>([])
  const [hasNewMessage, setHasNewMessage] = useState(false)
  const allUnreadRef = useRef<UnreadMessage[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMessages = useCallback(async () => {
    if (!pb.authStore.isValid && !user) {
      setUnreadCount(0)
      setPendingQuestionsCount(0)
      setRecentMessages([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      // Carrega mensagens recentes
      const allMessages = await pb.collection('pcp_order_messages').getFullList<UnreadMessage>({
        sort: '-created',
        expand: 'user_id.role,order_id.client_id,reply_to.user_id',
      })

      // Regra de não lidas e pendências:
      // Se for PCP:
      // - Não lidas: mensagens não lidas de outros
      // - Pendências: perguntas de status 'Pendente' feitas por outros
      // Se for setor:
      // - Não lidas: mensagens não lidas do PCP para o setor do usuário
      // - Pendências: perguntas direcionadas ao setor que ainda aguardam resposta
      const unread = isPcp
        ? allMessages.filter((m) => !isPcpSender(m) && m.user_id !== user?.id && !m.read)
        : allMessages.filter(
            (m) =>
              (!m.sector || !userChannel || m.sector === userChannel) &&
              isPcpSender(m) &&
              m.user_id !== user?.id &&
              !m.read,
          )

      const pendingQuestions = isPcp
        ? allMessages.filter(
            (m) => m.type === 'Pergunta' && m.status === 'Pendente' && !isPcpSender(m),
          )
        : allMessages.filter(
            (m) =>
              m.type === 'Pergunta' &&
              m.status === 'Pendente' &&
              (!m.sector || !userChannel || m.sector === userChannel),
          )

      allUnreadRef.current = unread
      setUnreadCount(unread.length)
      setPendingQuestionsCount(pendingQuestions.length)

      // Mostra as mais prioritárias (perguntas pendentes primeiro, depois mensagens não lidas)
      const priorityList = [
        ...pendingQuestions,
        ...unread.filter((u) => !pendingQuestions.some((p) => p.id === u.id)),
      ].slice(0, 10)

      setRecentMessages(priorityList)
    } catch (err: any) {
      console.error('[useUnreadMessages] Erro ao carregar mensagens:', err)
      setError(err?.message || 'Erro ao carregar mensagens')
    } finally {
      setLoading(false)
    }
  }, [user, isPcp, userChannel])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  useRealtime(
    'pcp_order_messages',
    (e) => {
      loadMessages()
      if (e.action === 'create' && e.record.user_id !== user?.id) {
        setHasNewMessage(true)
      }
    },
    {
      onReconnect: () => {
        loadMessages()
      },
    },
  )

  const markAllRead = useCallback(() => {
    allUnreadRef.current.forEach((m) => {
      pb.collection('pcp_order_messages')
        .update(m.id, { read: true })
        .catch(() => {})
    })
    allUnreadRef.current = []
    setUnreadCount(0)
    setHasNewMessage(false)
  }, [])

  const markOrderAsRead = useCallback((orderId: string) => {
    const remaining = allUnreadRef.current.filter((m) => m.order_id !== orderId)
    allUnreadRef.current = remaining
    setUnreadCount(remaining.length)
    setRecentMessages((prev) => prev.filter((m) => m.order_id !== orderId || m.type === 'Pergunta'))
    if (remaining.length === 0) setHasNewMessage(false)
  }, [])

  return {
    unreadCount,
    pendingQuestionsCount,
    totalBadgeCount: pendingQuestionsCount > 0 ? pendingQuestionsCount : unreadCount,
    recentMessages,
    hasNewMessage,
    loading,
    error,
    setHasNewMessage,
    markAllRead,
    markOrderAsRead,
    refresh: loadMessages,
  }
}
