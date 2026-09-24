import pb from '@/lib/pocketbase/client'
import { PcpRework } from '@/types'
import { normalizeStage } from '@/lib/pcp-utils'

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
  const originStage = normalizeStage(input.origin_stage)
  const targetStage = input.target_stage ? normalizeStage(input.target_stage) : undefined
  const record = await pb.collection('pcp_reworks').create<PcpRework>({
    order_id: input.order_id,
    origin_sector: input.origin_sector,
    origin_stage: originStage,
    target_sector: input.target_sector,
    target_stage: targetStage,
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
    if (!records[0]) return null
    return {
      ...records[0],
      origin_stage: normalizeStage(records[0].origin_stage),
      target_stage: records[0].target_stage ? normalizeStage(records[0].target_stage) : undefined,
    }
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
    const records = await pb.collection('pcp_reworks').getFullList<PcpRework>({
      sort: '-created',
      expand: 'signaled_by,executed_by,order_id,order_id.client_id,order_id.product_id',
    })
    return records.map((r) => ({
      ...r,
      origin_stage: normalizeStage(r.origin_stage),
      target_stage: r.target_stage ? normalizeStage(r.target_stage) : undefined,
    }))
  } catch {
    return []
  }
}
