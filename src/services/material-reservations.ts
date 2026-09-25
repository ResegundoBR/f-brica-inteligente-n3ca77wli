import pb from '@/lib/pocketbase/client'
import { MaterialReservation } from '@/types'
import { SeparationItem } from './material-separations'

export interface ComponentStockAvailability {
  code: string
  totalStock: number
  reservedStock: number
  availableStock: number
  unit: string
  inventoryId?: string
}

/**
 * Normaliza código para comparação insensível a maiúsculas/minúsculas e espaços.
 */
export function normalizeCode(code?: string | null): string {
  return (code || '').trim().toLowerCase()
}

/**
 * Busca todas as reservas ATIVAS no PocketBase.
 * Reservas ativas são vinculadas a rodadas que ainda não foram finalizadas ou canceladas.
 */
export async function getActiveReservations(): Promise<MaterialReservation[]> {
  try {
    const list = await pb.collection('material_reservations').getFullList<MaterialReservation>({
      filter: 'status = "Ativa"',
      sort: '-created',
    })
    return list
  } catch (err) {
    console.error('Erro ao buscar reservas ativas:', err)
    return []
  }
}

/**
 * Calcula o mapa de reservas ativas agrupadas por código normalizado.
 * Soma as reservas de TODAS as rodadas em aberto.
 */
export async function getActiveReservationsMap(): Promise<Map<string, number>> {
  const reservations = await getActiveReservations()
  const map = new Map<string, number>()
  for (const r of reservations) {
    const norm = normalizeCode(r.code)
    if (!norm) continue
    const current = map.get(norm) || 0
    map.set(norm, current + (Number(r.quantity) || 0))
  }
  return map
}

/**
 * Retorna a disponibilidade de estoque para uma lista de códigos de componentes.
 * disponível = max(0, quantity - reservado_total)
 * Considera as reservas de TODAS as rodadas em aberto.
 */
export async function getStockAvailabilityForCodes(
  codes: string[],
): Promise<Map<string, ComponentStockAvailability>> {
  const result = new Map<string, ComponentStockAvailability>()
  const cleanCodes = Array.from(new Set(codes.map((c) => normalizeCode(c)).filter(Boolean)))
  if (cleanCodes.length === 0) return result

  try {
    const [invList, reservationsMap] = await Promise.all([
      pb.collection('inventory').getFullList({
        sort: 'code',
      }),
      getActiveReservationsMap(),
    ])

    const invByCode = new Map<string, any>()
    for (const item of invList) {
      const norm = normalizeCode(item.code)
      if (norm) {
        invByCode.set(norm, item)
      }
    }

    for (const code of cleanCodes) {
      const inv = invByCode.get(code)
      const totalStock = inv ? Number(inv.quantity) || 0 : 0
      const reservedStock = reservationsMap.get(code) || 0
      const availableStock = Math.max(0, totalStock - reservedStock)

      result.set(code, {
        code,
        totalStock,
        reservedStock,
        availableStock,
        unit: inv?.unit || 'un',
        inventoryId: inv?.id,
      })
    }
  } catch (err) {
    console.error('Erro ao calcular disponibilidade de estoque:', err)
  }

  return result
}

/**
 * Registra a reserva de um item separado em uma rodada.
 * Se já houver reserva ATIVA para este item na rodada, atualiza se necessário.
 * Se houver reserva cancelada/liberada para este item na rodada, reativa.
 */
export async function reserveSeparatedItem(
  separationId: string,
  item: SeparationItem,
): Promise<MaterialReservation | null> {
  const normCode = normalizeCode(item.code)
  if (!normCode) return null

  const currentUserId = pb.authStore.record?.id

  try {
    // 1. Localizar item no inventory por código
    let inventoryId: string | undefined = undefined
    try {
      const invList = await pb.collection('inventory').getFullList({
        filter: `code ~ "${item.code.trim()}"`,
        limit: 10,
      })
      const matched = invList.find((i) => normalizeCode(i.code) === normCode)
      if (matched) {
        inventoryId = matched.id
      }
    } catch (_) {
      // Ignora erro de busca
    }

    // 2. Verificar se já existe reserva deste item nesta rodada
    const existing = await pb.collection('material_reservations').getFullList<MaterialReservation>({
      filter: `separation_id = "${separationId}" && item_id = "${item.id}"`,
      limit: 1,
    })

    const qty =
      item.status === 'parcial' && item.separated_quantity !== undefined
        ? Number(item.separated_quantity) || 0
        : Number(item.total_quantity) || 0

    if (qty <= 0) {
      // Se quantidade a separar for 0, libera eventual reserva existente
      if (existing.length > 0) {
        await releaseSeparatedItem(separationId, item.id)
      }
      return null
    }

    if (existing.length > 0) {
      const rec = existing[0]
      if (rec.status === 'Ativa' && rec.quantity === qty) {
        return rec
      }
      return await pb.collection('material_reservations').update<MaterialReservation>(rec.id, {
        status: 'Ativa',
        quantity: qty,
        code: item.code,
        description: item.description,
        inventory_id: inventoryId || rec.inventory_id || null,
      })
    }

    // 3. Criar nova reserva
    return await pb.collection('material_reservations').create<MaterialReservation>({
      separation_id: separationId,
      item_id: item.id,
      code: item.code,
      description: item.description,
      quantity: qty,
      status: 'Ativa',
      inventory_id: inventoryId || null,
      created_by: currentUserId || null,
    })
  } catch (err) {
    console.error(`Erro ao criar reserva para item ${item.code}:`, err)
    return null
  }
}

/**
 * Libera a reserva de um item (ao desmarcar ou mudar para pendente/falta).
 */
export async function releaseSeparatedItem(separationId: string, itemId: string): Promise<void> {
  try {
    const existing = await pb.collection('material_reservations').getFullList<MaterialReservation>({
      filter: `separation_id = "${separationId}" && item_id = "${itemId}" && status = "Ativa"`,
    })

    for (const rec of existing) {
      await pb.collection('material_reservations').update(rec.id, {
        status: 'Liberada',
      })
    }
  } catch (err) {
    console.error(`Erro ao liberar reserva do item ${itemId}:`, err)
  }
}

/**
 * Libera todas as reservas de uma rodada (ex.: quando a rodada é cancelada ou descartada).
 */
export async function releaseAllSeparationReservations(separationId: string): Promise<void> {
  try {
    const activeList = await pb
      .collection('material_reservations')
      .getFullList<MaterialReservation>({
        filter: `separation_id = "${separationId}" && status = "Ativa"`,
      })

    for (const rec of activeList) {
      await pb.collection('material_reservations').update(rec.id, {
        status: 'Liberada',
      })
    }
  } catch (err) {
    console.error(`Erro ao liberar reservas da separação ${separationId}:`, err)
  }
}

/**
 * Sincroniza as reservas ativas da rodada com base na lista atual de itens.
 * - Para cada item com status === 'separado': garante que a reserva está Ativa.
 * - Para cada item com status !== 'separado' (pendente ou falta): garante que a reserva foi Liberada.
 */
export async function syncSeparationReservations(
  separationId: string,
  items: SeparationItem[],
): Promise<void> {
  for (const item of items) {
    if (
      item.status === 'separado' ||
      (item.status === 'parcial' && (item.separated_quantity ?? 0) > 0)
    ) {
      await reserveSeparatedItem(separationId, item)
    } else {
      await releaseSeparatedItem(separationId, item.id)
    }
  }
}
