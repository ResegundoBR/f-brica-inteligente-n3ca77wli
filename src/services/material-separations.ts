import { pb } from '@/lib/pocketbase/client'

export type SeparationStatus = 'Pendente' | 'Em_Separacao' | 'Concluida' | 'Cancelada'

export type SeparationItemStatus = 'pendente' | 'separado' | 'falta'

export interface SeparationItem {
  id: string // unique item id within the separation round
  code: string
  description: string
  total_quantity: number
  unit: string
  cut_measurement?: string | null
  op_numbers: string[]
  order_ids: string[]
  status?: SeparationItemStatus
  marked_at?: string
  marked_by?: string
  notes?: string
}

export interface MaterialSeparation {
  id: string
  title?: string
  status: SeparationStatus
  date?: string
  op_numbers: string[]
  order_ids: string[]
  items: SeparationItem[]
  separated_items?: SeparationItem[]
  shortage_items?: SeparationItem[]
  separated_count: number
  shortage_count: number
  total_items_count: number
  created_by?: string
  finished_by?: string
  finished_at?: string
  notes?: string
  created: string
  updated: string
  expand?: {
    created_by?: { id: string; name?: string; email?: string }
    finished_by?: { id: string; name?: string; email?: string }
  }
}

export interface CreateSeparationInput {
  title?: string
  date?: string
  op_numbers: string[]
  order_ids: string[]
  items: SeparationItem[]
  notes?: string
}

export async function getSeparations(filter?: string): Promise<MaterialSeparation[]> {
  try {
    const records = await pb.collection('material_separations').getFullList<MaterialSeparation>({
      filter: filter || '',
      sort: '-created',
      expand: 'created_by,finished_by',
    })
    return records
  } catch (err) {
    console.error('Erro ao listar separações:', err)
    return []
  }
}

export async function getSeparationById(id: string): Promise<MaterialSeparation | null> {
  try {
    const record = await pb.collection('material_separations').getOne<MaterialSeparation>(id, {
      expand: 'created_by,finished_by',
    })
    return record
  } catch (err) {
    console.error('Erro ao buscar separação:', err)
    return null
  }
}

export async function createSeparation(input: CreateSeparationInput): Promise<MaterialSeparation> {
  const currentUserId = pb.authStore.record?.id
  const payload = {
    title:
      input.title ||
      `Separação ${input.op_numbers.length} OPs - ${new Date().toLocaleDateString('pt-BR')}`,
    status: 'Pendente' as SeparationStatus,
    date: input.date || new Date().toISOString(),
    op_numbers: input.op_numbers,
    order_ids: input.order_ids,
    items: input.items.map((item) => ({
      ...item,
      status: item.status || 'pendente',
    })),
    separated_items: [],
    shortage_items: [],
    separated_count: 0,
    shortage_count: 0,
    total_items_count: input.items.length,
    created_by: currentUserId || null,
    notes: input.notes || '',
  }

  const record = await pb.collection('material_separations').create<MaterialSeparation>(payload)
  return record
}

export async function updateSeparationItems(
  separationId: string,
  items: SeparationItem[],
  status?: SeparationStatus,
): Promise<MaterialSeparation> {
  const separated = items.filter((i) => i.status === 'separado')
  const shortages = items.filter((i) => i.status === 'falta')

  const payload: Record<string, unknown> = {
    items,
    separated_count: separated.length,
    shortage_count: shortages.length,
    separated_items: separated,
    shortage_items: shortages,
  }

  if (status) {
    payload.status = status
  }

  const record = await pb
    .collection('material_separations')
    .update<MaterialSeparation>(separationId, payload)
  return record
}

export interface FinalizeSeparationResult {
  separation: MaterialSeparation
  shortagesCreatedCount: number
}

/**
 * Finaliza a rodada de separação:
 * - Grava os itens marcados como 'separado' em separated_items (kit separado da rodada)
 * - Para cada item marcado como 'falta', cria automaticamente um registro em material_shortages
 * - Atualiza o status da rodada para 'Concluida' com finished_by e finished_at
 */
export async function finalizeSeparation(
  separationId: string,
  items: SeparationItem[],
): Promise<FinalizeSeparationResult> {
  const currentUserId = pb.authStore.record?.id
  const separated = items.filter((i) => i.status === 'separado')
  const shortages = items.filter((i) => i.status === 'falta')

  // Criar faltas no material_shortages para cada item marcado como falta
  // Respeitando exatamente o schema de material_shortages:
  // code, description, quantity, sector, status, order_id, request_type, priority, requested_by, observation
  let shortagesCreatedCount = 0
  for (const item of shortages) {
    try {
      const primaryOrderId = item.order_ids?.[0] || null
      const primaryOp =
        item.op_numbers?.[0] || (item.op_numbers?.length ? item.op_numbers.join(', ') : 'Separação')
      const opsLabel =
        item.op_numbers?.length > 1
          ? ` (OPs: ${item.op_numbers.join(', ')})`
          : primaryOp
            ? ` (OP: ${primaryOp})`
            : ''

      const observation =
        `Falta gerada automaticamente na Separação do Operador${opsLabel}. Qtd: ${item.total_quantity} ${item.unit || 'UN'}.${item.cut_measurement ? ` Medida de corte: ${item.cut_measurement}.` : ''} ${item.notes || ''}`.trim()

      const shortagePayload: Record<string, unknown> = {
        code: item.code || '',
        description: `${item.description || 'Material sem descrição'}${opsLabel}`,
        quantity: Number(item.total_quantity) || 1,
        sector: 'Suprimentos',
        status: 'Pendente',
        request_type: 'Materiais',
        priority: 'Urgente',
        requested_by: currentUserId || null,
        observation: observation,
      }

      if (primaryOrderId) {
        shortagePayload.order_id = primaryOrderId
      }

      await pb.collection('material_shortages').create(shortagePayload)
      shortagesCreatedCount += 1
    } catch (err) {
      console.error('Erro ao gerar falta para item de separação:', item, err)
    }
  }

  // Atualizar rodada para Concluída
  const payload = {
    status: 'Concluida' as SeparationStatus,
    items,
    separated_items: separated,
    shortage_items: shortages,
    separated_count: separated.length,
    shortage_count: shortages.length,
    finished_by: currentUserId || null,
    finished_at: new Date().toISOString(),
  }

  const updatedSeparation = await pb
    .collection('material_separations')
    .update<MaterialSeparation>(separationId, payload)

  return {
    separation: updatedSeparation,
    shortagesCreatedCount,
  }
}
