import pb from '@/lib/pocketbase/client'
import type { PcpOrderMessage, MessageSector, MessageType, MessageStatus } from '@/types'

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

export const getAllMessages = () =>
  pb.collection('pcp_order_messages').getFullList<PcpOrderMessage>({
    sort: '-created',
    expand: 'user_id.role,order_id.client_id,reply_to.user_id',
  })
