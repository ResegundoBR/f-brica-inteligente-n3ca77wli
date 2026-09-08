import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/hooks/use-auth'
import type { PcpOrderMessage } from '@/types'
import {
  type MessageChannel,
  type IndicatorState,
  isPcpSender,
  isPcpManager,
  getUserChannel,
} from '@/lib/message-sector'
import {
  subscribeToSharedMessages,
  fetchAllOrderMessages,
  markMessagesAsReadLocallyAndRemote,
  getSharedMessagesSnapshot,
} from '@/services/pcp-order-messages-store'

export interface OrderMessageInfo {
  count: number
  unreadCount: number
  pendingCount: number
  indicatorState: IndicatorState
}

export function useOrderMessages(channel?: MessageChannel) {
  const { user } = useAuth()
  const initialSnapshot = getSharedMessagesSnapshot()
  const [allMessages, setAllMessages] = useState<PcpOrderMessage[]>(initialSnapshot.messages)
  const [loading, setLoading] = useState(initialSnapshot.loading)
  const [error, setError] = useState<string | null>(initialSnapshot.error)

  const isPcp = isPcpManager(user)
  const userChannel = getUserChannel(user)
  const effectiveChannel = channel ?? (isPcp ? undefined : (userChannel ?? undefined))

  useEffect(() => {
    const unsub = subscribeToSharedMessages((msgs) => {
      const snap = getSharedMessagesSnapshot()
      setAllMessages(msgs)
      setLoading(snap.loading)
      setError(snap.error)
    })

    return () => {
      unsub()
    }
  }, [])

  const messages = useMemo(() => {
    if (!effectiveChannel) return allMessages
    return allMessages.filter((m) => m.sector === effectiveChannel)
  }, [allMessages, effectiveChannel])

  const markOrderAsRead = useCallback(
    async (orderId: string) => {
      if (!user) return
      const userIsPcp = isPcpManager(user)
      const currentChannel = getUserChannel(user)
      const messagesToMark = allMessages.filter((m) => {
        if (m.order_id !== orderId || m.read) return false
        if (m.user_id === user.id) return false
        const senderIsPcp = isPcpSender(m)
        if (userIsPcp) {
          return !senderIsPcp
        } else {
          const sectorMatch = !m.sector || !currentChannel || m.sector === currentChannel
          return senderIsPcp && sectorMatch
        }
      })
      if (messagesToMark.length > 0) {
        await markMessagesAsReadLocallyAndRemote(messagesToMark.map((m) => m.id))
      }
    },
    [allMessages, user],
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
        return { count: 0, unreadCount: 0, pendingCount: 0, indicatorState: 'none' }
      }

      const userIsPcp = isPcpManager(user)

      const myMessages = orderMessages.filter((m) => (userIsPcp ? isPcpSender(m) : !isPcpSender(m)))
      const otherMessages = orderMessages.filter((m) =>
        userIsPcp ? !isPcpSender(m) : isPcpSender(m),
      )

      // Perguntas pendentes da OP
      const pendingQuestions = orderMessages.filter(
        (m) => m.type === 'Pergunta' && m.status === 'Pendente',
      )

      // Se sou PCP e há perguntas pendentes vindas de outros, ou se sou setor e há pendências
      const relevantPending = userIsPcp
        ? pendingQuestions.filter((m) => !isPcpSender(m))
        : pendingQuestions

      if (relevantPending.length > 0) {
        return {
          count: orderMessages.length,
          unreadCount: otherMessages.filter((m) => !m.read).length,
          pendingCount: relevantPending.length,
          indicatorState: 'red', // Destaque para perguntas pendentes
        }
      }

      const unreadFromOthers = otherMessages.filter((m) => !m.read)
      if (unreadFromOthers.length > 0) {
        return {
          count: unreadFromOthers.length,
          unreadCount: unreadFromOthers.length,
          pendingCount: 0,
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
          pendingCount: 0,
          indicatorState: 'blue',
        }
      }

      return {
        count: orderMessages.length,
        unreadCount: 0,
        pendingCount: 0,
        indicatorState: 'gray',
      }
    },
    [messagesByOrder, user],
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      await fetchAllOrderMessages(false)
      setError(null)
    } catch (err: any) {
      console.warn('[useOrderMessages] Aviso discreto ao atualizar mensagens:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    messagesByOrder,
    getOrderMessageInfo,
    markOrderAsRead,
    loading,
    error,
    refresh,
  }
}
