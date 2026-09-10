import pb from '@/lib/pocketbase/client'
import { PcpRework } from '@/types'

export interface CreateReworkInput {
  order_id: string
  origin_sector: string
  origin_stage: string
  target_sector: string
  target_stage?: string
  description: string
  signaled_by?: string
  signaled_at?: string
}

export async function createRework(input: CreateReworkInput): Promise<PcpRework> {
  const signaledAt = input.signaled_at || new Date().toISOString()
  const record = await pb.collection('pcp_reworks').create<PcpRework>({
    order_id: input.order_id,
    origin_sector: input.origin_sector,
    origin_stage: input.origin_stage,
    target_sector: input.target_sector,
    target_stage: input.target_stage,
    description: input.description,
    status: 'Pendente',
    signaled_by: input.signaled_by,
    signaled_at: signaledAt,
  })
  return record
}

export async function getActiveReworkForOrder(orderId: string): Promise<PcpRework | null> {
  try {
    const records = await pb.collection('pcp_reworks').getFullList<PcpRework>({
      filter: `order_id = "${orderId}" && status != "Concluído"`,
      sort: '-created',
      expand: 'signaled_by,executed_by,order_id',
    })
    return records[0] || null
  } catch {
    return null
  }
}

export async function startRework(reworkId: string, executedBy?: string): Promise<PcpRework> {
  const startedAt = new Date().toISOString()
  const updateData: Record<string, any> = {
    status: 'Em Andamento',
    started_at: startedAt,
  }
  if (executedBy) {
    updateData.executed_by = executedBy
  }
  return await pb.collection('pcp_reworks').update<PcpRework>(reworkId, updateData)
}

export async function finishRework(reworkId: string, executedBy?: string): Promise<PcpRework> {
  const current = await pb.collection('pcp_reworks').getOne<PcpRework>(reworkId)
  const finishedAt = new Date().toISOString()

  // Tempo total até a OP voltar à origem (a partir de quando foi sinalizada)
  const signaledTime = current.signaled_at
    ? new Date(current.signaled_at).getTime()
    : new Date(current.created).getTime()
  const durationMinutes = Math.max(
    1,
    Math.round((new Date(finishedAt).getTime() - signaledTime) / (1000 * 60)),
  )

  const updateData: Record<string, any> = {
    status: 'Concluído',
    finished_at: finishedAt,
    duration_minutes: durationMinutes,
  }
  if (executedBy && !current.executed_by) {
    updateData.executed_by = executedBy
  }

  return await pb.collection('pcp_reworks').update<PcpRework>(reworkId, updateData)
}

export async function getAllReworks(): Promise<PcpRework[]> {
  try {
    return await pb.collection('pcp_reworks').getFullList<PcpRework>({
      sort: '-created',
      expand: 'signaled_by,executed_by,order_id,order_id.client_id,order_id.product_id',
    })
  } catch {
    return []
  }
}
