import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '@/hooks/use-auth'
import type { PcpOrderMessage } from '@/types'
import { isPcpSender, isPcpManager, getUserChannel } from '@/lib/message-sector'
import {
  subscribeToSharedMessages,
  fetchAllOrderMessages,
  markMessagesAsReadLocallyAndRemote,
  getSharedMessagesSnapshot,
} from '@/services/pcp-order-messages-store'

export type UnreadMessage = PcpOrderMessage

export function useUnreadMessages() {
  const { user } = useAuth()
  const isPcp = isPcpManager(user)
  const userChannel = getUserChannel(user)

  const initialSnapshot = getSharedMessagesSnapshot()
  const [allMessages, setAllMessages] = useState<UnreadMessage[]>(initialSnapshot.messages)
  const [loading, setLoading] = useState(initialSnapshot.loading)
  const [error, setError] = useState<string | null>(initialSnapshot.error)
  const [hasNewMessage, setHasNewMessage] = useState(false)
  const prevMessagesCountRef = useRef(initialSnapshot.messages.length)

  // Assina a fonte centralizada compartilhada
  useEffect(() => {
    const unsub = subscribeToSharedMessages((msgs) => {
      const snap = getSharedMessagesSnapshot()
      // Detecta se uma nova mensagem foi criada por outro usuário
      if (msgs.length > prevMessagesCountRef.current && prevMessagesCountRef.current > 0) {
        const newest = msgs[0]
        if (newest && newest.user_id !== user?.id) {
          setHasNewMessage(true)
        }
      }
      prevMessagesCountRef.current = msgs.length
      setAllMessages(msgs)
      setLoading(snap.loading)
      setError(snap.error)
    })

    return () => {
      unsub()
    }
  }, [user?.id])

  // Regra de não lidas e pendências calculadas de forma memoizada a partir do pool compartilhado
  const { unread, pendingQuestions, recentMessages } = useMemo(() => {
    if (!user) {
      return {
        unread: [] as UnreadMessage[],
        pendingQuestions: [] as UnreadMessage[],
        recentMessages: [] as UnreadMessage[],
      }
    }

    // Regra de não lidas e pendências:
    // Se for PCP:
    // - Não lidas: mensagens não lidas de outros
    // - Pendências: perguntas de status 'Pendente' feitas por outros
    // Se for setor:
    // - Não lidas: mensagens não lidas do PCP para o setor do usuário
    // - Pendências: perguntas direcionadas ao setor que ainda aguardam resposta
    const unreadMsgs = isPcp
      ? allMessages.filter((m) => !isPcpSender(m) && m.user_id !== user.id && !m.read)
      : allMessages.filter(
          (m) =>
            (!m.sector || !userChannel || m.sector === userChannel) &&
            isPcpSender(m) &&
            m.user_id !== user.id &&
            !m.read,
        )

    const pending = isPcp
      ? allMessages.filter(
          (m) => m.type === 'Pergunta' && m.status === 'Pendente' && !isPcpSender(m),
        )
      : allMessages.filter(
          (m) =>
            m.type === 'Pergunta' &&
            m.status === 'Pendente' &&
            (!m.sector || !userChannel || m.sector === userChannel),
        )

    const priorityList = [
      ...pending,
      ...unreadMsgs.filter((u) => !pending.some((p) => p.id === u.id)),
    ].slice(0, 10)

    return {
      unread: unreadMsgs,
      pendingQuestions: pending,
      recentMessages: priorityList,
    }
  }, [allMessages, user, isPcp, userChannel])

  const unreadCount = unread.length
  const pendingQuestionsCount = pendingQuestions.length

  const markAllRead = useCallback(async () => {
    if (unread.length === 0) return
    const ids = unread.map((m) => m.id)
    await markMessagesAsReadLocallyAndRemote(ids)
    setHasNewMessage(false)
  }, [unread])

  const markOrderAsRead = useCallback(
    async (orderId: string) => {
      const orderUnread = unread.filter((m) => m.order_id === orderId)
      if (orderUnread.length > 0) {
        await markMessagesAsReadLocallyAndRemote(orderUnread.map((m) => m.id))
      }
      if (unread.length <= orderUnread.length) {
        setHasNewMessage(false)
      }
    },
    [unread],
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      await fetchAllOrderMessages(true)
      setError(null)
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar mensagens')
    } finally {
      setLoading(false)
    }
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
    refresh,
  }
}
