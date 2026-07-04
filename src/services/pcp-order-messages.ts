import pb from '@/lib/pocketbase/client'

export interface PcpOrderMessage {
  id: string
  order_id: string
  user_id: string
  content: string
  created: string
  updated: string
  expand?: {
    user_id?: { id: string; name: string }
    order_id?: { id: string; order_number: string }
  }
}

export const getOrderMessages = (orderId: string) =>
  pb.collection('pcp_order_messages').getFullList<PcpOrderMessage>({
    filter: `order_id="${orderId}"`,
    sort: 'created',
    expand: 'user_id',
  })

export const createOrderMessage = (data: { order_id: string; user_id: string; content: string }) =>
  pb.collection('pcp_order_messages').create(data)

export const getAllMessages = () =>
  pb.collection('pcp_order_messages').getFullList<PcpOrderMessage>({
    sort: '-created',
    expand: 'user_id,order_id',
  })
