import pb from '@/lib/pocketbase/client'
import type { PcpOrderMessage, MessageSector, MessageType, MessageStatus } from '@/types'
import { isPcpSender } from '@/lib/message-sector'

export interface CreateOrderMessageInput {
  order_id: string
  user_id: string
  content: string
  sector?: MessageSector
  type?: MessageType
  status?: MessageStatus
  reply_to?: string
  read?: boolean
}

export const getOrderMessages = (orderId: string) =>
  pb.collection('pcp_order_messages').getFullList<PcpOrderMessage>({
    filter: `order_id="${orderId}"`,
    sort: 'created',
    expand: 'user_id.role,order_id,reply_to.user_id',
  })

export const createOrderMessage = async (data: CreateOrderMessageInput) => {
  const created = await pb.collection('pcp_order_messages').create<PcpOrderMessage>(data)

  // Se for resposta a uma pergunta anterior vinculada por reply_to,
  // marca a pergunta de origem como 'Respondida'
  if (data.reply_to) {
    try {
      await pb.collection('pcp_order_messages').update(data.reply_to, {
        status: 'Respondida',
      })
    } catch (err) {
      console.warn('Falha ao atualizar status da pergunta respondida', err)
    }
  }

  return created
}

export const updateOrderMessage = (id: string, data: Partial<PcpOrderMessage>) =>
  pb.collection('pcp_order_messages').update<PcpOrderMessage>(id, data)

/**
 * Marca como lidas as mensagens da conversa de uma OP direcionadas ao usuário/perfil atual.
 * - Para PCP: mensagens não lidas enviadas por outros (não PCP).
 * - Para Setor: mensagens não lidas do PCP para o setor do usuário (ou sem setor específico).
 */
import {
  markMessagesAsReadLocallyAndRemote,
  getSharedMessagesSnapshot,
} from './pcp-order-messages-store'

export const markOrderMessagesAsRead = async (
  orderId: string,
  currentUser: { id: string; role?: string; expand?: any; email?: string } | null | undefined,
  isPcp: boolean,
  userChannel?: MessageSector | null,
) => {
  if (!orderId || !currentUser) return []
  try {
    // Tenta primeiro utilizar as mensagens já em cache no store compartilhado
    const snapshot = getSharedMessagesSnapshot()
    let list = snapshot.messages.filter((m) => m.order_id === orderId && !m.read)

    // Se o store compartilhado ainda não estiver inicializado, busca pontualmente
    if (list.length === 0 && !snapshot.initialized) {
      list = await pb.collection('pcp_order_messages').getFullList<PcpOrderMessage>({
        filter: `order_id="${orderId}" && read=false`,
        expand: 'user_id.role',
      })
    }

    const toMark = list.filter((m) => {
      if (m.user_id === currentUser.id) return false
      const senderIsPcp = isPcpSender(m)
      if (isPcp) {
        return !senderIsPcp
      } else {
        const sectorMatch = !m.sector || !userChannel || m.sector === userChannel
        return senderIsPcp && sectorMatch
      }
    })

    if (toMark.length > 0) {
      await markMessagesAsReadLocallyAndRemote(toMark.map((m) => m.id))
    }

    return toMark
  } catch (err) {
    console.warn('Erro ao marcar mensagens da OP como lidas:', err)
    return []
  }
}

export const getAllMessages = () =>
  pb.collection('pcp_order_messages').getFullList<PcpOrderMessage>({
    sort: '-created',
    expand: 'user_id.role,order_id.client_id,reply_to.user_id',
  })
