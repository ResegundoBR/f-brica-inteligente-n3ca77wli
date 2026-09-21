import pb from '@/lib/pocketbase/client'
import { MaterialSeparation } from './material-separations'

export type ProgramacaoStatus = 'Em produção' | 'Encerrada'

export interface ProgramacaoOrderItem {
  order_id: string
  order_number: string
  client_name: string
  product_name: string
  op_number?: string
  quantity?: number
  formatted_label: string // 'Número do pedido — Nome do cliente — Nome do Produto / OP'
}

export interface PcpProgramacaoRecord {
  id: string
  seq_number: number
  name: string
  status: ProgramacaoStatus
  generation_date: string
  orders_list: ProgramacaoOrderItem[]
  compiled_items: any[]
  orders_count: number
  ops_count: number
  items_count: number
  separation_id?: string
  created_by?: string
  closed_by?: string
  closed_at?: string
  notes?: string
  created: string
  updated: string
  expand?: {
    separation_id?: MaterialSeparation
    created_by?: { id: string; name?: string; email?: string }
    closed_by?: { id: string; name?: string; email?: string }
  }
}

export interface CreateProgramacaoInput {
  orders_list: ProgramacaoOrderItem[]
  compiled_items: any[]
  separation_id?: string
  notes?: string
}

/**
 * Obtém o próximo número sequencial de programação (#1, #2, #3, ...)
 */
export async function getNextProgramacaoSeqNumber(): Promise<number> {
  try {
    const records = await pb.collection('pcp_programacoes').getList<PcpProgramacaoRecord>(1, 1, {
      sort: '-seq_number',
      fields: 'seq_number',
    })
    if (records.items.length > 0 && typeof records.items[0].seq_number === 'number') {
      return records.items[0].seq_number + 1
    }
    return 1
  } catch (err) {
    console.error('Erro ao buscar seq_number de programação:', err)
    return 1
  }
}

/**
 * Cria uma Programação oficial
 */
export async function createProgramacao(
  input: CreateProgramacaoInput,
): Promise<PcpProgramacaoRecord> {
  const currentUserId = pb.authStore.record?.id
  const seqNumber = await getNextProgramacaoSeqNumber()

  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = now.getFullYear()
  const formattedDate = `${day}/${month}/${year}`

  const name = `Programação #${seqNumber} / ${formattedDate}`

  // Calcular contadores
  const uniqueOrderNumbers = new Set(input.orders_list.map((o) => o.order_number).filter(Boolean))
  const uniqueOpNumbers = new Set(input.orders_list.map((o) => o.op_number).filter(Boolean))

  const payload = {
    seq_number: seqNumber,
    name,
    status: 'Em produção' as ProgramacaoStatus,
    generation_date: now.toISOString(),
    orders_list: input.orders_list,
    compiled_items: input.compiled_items,
    orders_count: uniqueOrderNumbers.size || input.orders_list.length,
    ops_count: uniqueOpNumbers.size || input.orders_list.length,
    items_count: input.compiled_items.length,
    separation_id: input.separation_id || null,
    created_by: currentUserId || null,
    notes: input.notes || '',
  }

  const record = await pb.collection('pcp_programacoes').create<PcpProgramacaoRecord>(payload)

  // Se uma rodada de separação foi atrelada, atualizar nela o relation programacao_id
  if (input.separation_id) {
    try {
      await pb.collection('material_separations').update(input.separation_id, {
        programacao_id: record.id,
      })
    } catch (err) {
      console.error('Erro ao vincular programacao_id na separacao:', err)
    }
  }

  return record
}

/**
 * Encerra manualmente uma programação (Status MANUAL, sem encerramento automático).
 */
export async function closeProgramacao(programacaoId: string): Promise<PcpProgramacaoRecord> {
  const currentUserId = pb.authStore.record?.id
  const payload = {
    status: 'Encerrada' as ProgramacaoStatus,
    closed_by: currentUserId || null,
    closed_at: new Date().toISOString(),
  }

  const record = await pb
    .collection('pcp_programacoes')
    .update<PcpProgramacaoRecord>(programacaoId, payload, {
      expand: 'separation_id,created_by,closed_by',
    })
  return record
}

/**
 * Lista todas as programações cadastradas
 */
export async function getProgramacoes(filter?: string): Promise<PcpProgramacaoRecord[]> {
  try {
    const records = await pb.collection('pcp_programacoes').getFullList<PcpProgramacaoRecord>({
      filter: filter || '',
      sort: '-seq_number',
      expand: 'separation_id,created_by,closed_by',
    })
    return records
  } catch (err) {
    console.error('Erro ao listar programações:', err)
    return []
  }
}

/**
 * Busca programação por ID
 */
export async function getProgramacaoById(id: string): Promise<PcpProgramacaoRecord | null> {
  try {
    const record = await pb.collection('pcp_programacoes').getOne<PcpProgramacaoRecord>(id, {
      expand: 'separation_id,created_by,closed_by',
    })
    return record
  } catch (err) {
    console.error('Erro ao buscar programação por ID:', err)
    return null
  }
}
