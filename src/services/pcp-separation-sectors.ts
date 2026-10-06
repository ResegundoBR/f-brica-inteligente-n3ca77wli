import type { SeparationItem } from '@/services/material-separations'
import type { PcpOrderMaterial, PcpOrder } from '@/types'
import { isSameItem } from '@/services/material-consolidation'
import {
  formatOpDisplay,
  getItemAllocationKey,
  resolveOrderProductName,
} from '@/services/pcp-separation-allocations'

export const SECTOR_ORDER = ['Fabricação', 'Preparação', 'Montagem', 'Expedição'] as const
export type KnownSector = (typeof SECTOR_ORDER)[number]
export const NO_SECTOR_LABEL = 'Sem setor'

/**
 * Identifica se um código de componente é uma peça fabricada internamente durante o processo (inicia por 'FAB').
 * Peças fabricadas internamente (ex: FAB01075, FAB01090) são produzidas durante a própria fabricação
 * e não existem previamente no estoque para a separação física inicial.
 */
export function isFabricatedCode(code?: string | null): boolean {
  if (!code) return false
  return code.trim().toUpperCase().startsWith('FAB')
}

/**
 * Normaliza os valores de setor gravados na BOM (pcp_order_materials).
 * No banco real estão como FABRICAÇÃO / PREPARAÇÃO / MONTAGEM / EXPEDIÇÃO
 * ou Fabricação / Preparação / Montagem / Expedição.
 */
export function normalizeBomSector(
  rawSector?: string | null,
): KnownSector | typeof NO_SECTOR_LABEL {
  if (!rawSector) return NO_SECTOR_LABEL
  const upper = rawSector
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (upper.includes('FABRIC')) return 'Fabricação'
  if (upper.includes('PREPAR') || upper.includes('ACABAM')) return 'Preparação'
  if (upper.includes('MONTAG')) return 'Montagem'
  if (upper.includes('EXPEDIC')) return 'Expedição'

  return NO_SECTOR_LABEL
}

export interface SectorItemCard {
  /** Chave estável para React (ex: `${item.id}__${sector}`) */
  cardKey: string
  /** Item original da rodada de separação (para manipulação de status / save) */
  item: SeparationItem
  /** Setor ao qual este card pertence */
  sector: KnownSector | typeof NO_SECTOR_LABEL
  /** Quantidade solicitada restrita às OPs deste setor (ou total_quantity se sem setor) */
  sectorQuantity: number
  /** Lista de OPs deste setor que utilizam o componente */
  sectorOpNumbers: string[]
  /** Lista de order_ids deste setor */
  sectorOrderIds: string[]
  /** Rateio por OP com as OPs deste setor */
  sectorAllocations: Array<{
    orderId: string
    opNumber: string
    quantity: number | null
    unit?: string
    productName?: string
  }>
}

export interface SectorGroup {
  sector: KnownSector | typeof NO_SECTOR_LABEL
  cards: SectorItemCard[]
}

export interface BuildSectorGroupsInput {
  items: SeparationItem[]
  bomMaterials: PcpOrderMaterial[]
  orders: PcpOrder[]
}

/**
 * Agrupa os itens da rodada de separação por setor da BOM.
 * Regras:
 * 1. Ordem fixa: Fabricação -> Preparação -> Montagem -> Expedição -> Sem setor (se houver).
 * 2. O mesmo código usado em setores diferentes aparece em cada bloco com as quantidades das OPs daquele setor.
 * 3. O rateio por OP existente nos cards continua funcionando, filtrado para as OPs do setor.
 * 4. Para itens sem correspondência na BOM (ex: itens criados manualmente ou substitutos sem BOM),
 *    eles são alocados no bloco 'Sem setor' com seus dados originais.
 */
export function buildSectorGroups(input: BuildSectorGroupsInput): SectorGroup[] {
  const { items, bomMaterials, orders } = input

  // Mapa rápido de orderId -> opNumber formatado e nome do produto
  const opDisplayByOrderId = new Map<string, string>()
  const productNameByOrderId = new Map<string, string>()
  for (const ord of orders) {
    const display = ord.op_number || ord.order_number || ord.id
    opDisplayByOrderId.set(ord.id, formatOpDisplay(display))
    const prodName = resolveOrderProductName(ord)
    if (prodName) {
      productNameByOrderId.set(ord.id, prodName)
    }
  }

  // Mapa: orderId -> lista de materiais BOM dessa OP
  const bomByOrderId = new Map<string, PcpOrderMaterial[]>()
  for (const mat of bomMaterials) {
    if (!mat.order_id) continue
    const list = bomByOrderId.get(mat.order_id) || []
    list.push(mat)
    bomByOrderId.set(mat.order_id, list)
  }

  // Grupos preliminares
  const groupsMap = new Map<string, SectorItemCard[]>()
  for (const s of SECTOR_ORDER) {
    groupsMap.set(s, [])
  }
  groupsMap.set(NO_SECTOR_LABEL, [])

  for (const item of items) {
    // Componentes FAB são fabricados internamente durante o processo e não entram na separação
    if (isFabricatedCode(item.code)) {
      continue
    }

    const orderIds = item.order_ids && item.order_ids.length > 0 ? item.order_ids : []

    // Se o item não tem order_ids ou a lista de materiais BOM está vazia
    if (orderIds.length === 0 || bomMaterials.length === 0) {
      groupsMap.get(NO_SECTOR_LABEL)!.push({
        cardKey: `${item.id}__${NO_SECTOR_LABEL}`,
        item,
        sector: NO_SECTOR_LABEL,
        sectorQuantity: item.total_quantity,
        sectorOpNumbers: item.op_numbers || [],
        sectorOrderIds: item.order_ids || [],
        sectorAllocations: (item.order_ids || []).map((oId, idx) => ({
          orderId: oId,
          opNumber: opDisplayByOrderId.get(oId) || item.op_numbers?.[idx] || formatOpDisplay(oId),
          quantity: null,
          unit: item.unit,
          productName: productNameByOrderId.get(oId) || undefined,
        })),
      })
      continue
    }

    // Classificar as OPs do item por setor onde este componente aparece na BOM
    // setor -> lista de { orderId, opNumber, quantity, unit, productName }
    const sectorOpsMap = new Map<
      KnownSector | typeof NO_SECTOR_LABEL,
      Array<{
        orderId: string
        opNumber: string
        quantity: number | null
        unit?: string
        productName?: string
      }>
    >()

    let foundInAnySector = false

    for (let i = 0; i < orderIds.length; i++) {
      const oId = orderIds[i]
      const fallbackOp = item.op_numbers?.[i] ? formatOpDisplay(item.op_numbers[i]) : undefined
      const resolvedOp = opDisplayByOrderId.get(oId) || fallbackOp || formatOpDisplay(oId)

      const opBom = bomByOrderId.get(oId) || []
      const matched = opBom.filter((m) => isSameItem(item, m))

      if (matched.length > 0) {
        foundInAnySector = true
        // Um componente pode aparecer em setores específicos na BOM dessa OP
        // Agrupa por setor do material da BOM
        const bySectorInOp = new Map<
          KnownSector | typeof NO_SECTOR_LABEL,
          { qty: number; unit?: string }
        >()

        for (const m of matched) {
          const sec = normalizeBomSector(m.sector)
          const curr = bySectorInOp.get(sec) || { qty: 0, unit: m.unit || item.unit }
          curr.qty += Number(m.quantity) || 0
          bySectorInOp.set(sec, curr)
        }

        bySectorInOp.forEach((data, sec) => {
          const list = sectorOpsMap.get(sec) || []
          list.push({
            orderId: oId,
            opNumber: resolvedOp,
            quantity: data.qty,
            unit: data.unit,
          })
          sectorOpsMap.set(sec, list)
        })
      }
    }

    // Associar productName a cada alocação em sectorOpsMap
    sectorOpsMap.forEach((allocList) => {
      for (const alloc of allocList) {
        if (!alloc.productName) {
          alloc.productName = productNameByOrderId.get(alloc.orderId) || undefined
        }
      }
    })

    // Se o componente não foi localizado na BOM de nenhuma OP (ex: substituto ou divergência de código)
    if (!foundInAnySector) {
      groupsMap.get(NO_SECTOR_LABEL)!.push({
        cardKey: `${item.id}__${NO_SECTOR_LABEL}`,
        item,
        sector: NO_SECTOR_LABEL,
        sectorQuantity: item.total_quantity,
        sectorOpNumbers: item.op_numbers || [],
        sectorOrderIds: item.order_ids || [],
        sectorAllocations: orderIds.map((oId, idx) => ({
          orderId: oId,
          opNumber: opDisplayByOrderId.get(oId) || item.op_numbers?.[idx] || formatOpDisplay(oId),
          quantity: null,
          unit: item.unit,
          productName: productNameByOrderId.get(oId) || undefined,
        })),
      })
      continue
    }

    // Para cada setor encontrado onde o componente é utilizado, gerar um card com as quantidades daquele setor
    // Ordenar os setores segundo SECTOR_ORDER para manter coerência
    const itemSectors = Array.from(sectorOpsMap.keys()).sort((a, b) => {
      const idxA = a === NO_SECTOR_LABEL ? 99 : SECTOR_ORDER.indexOf(a as KnownSector)
      const idxB = b === NO_SECTOR_LABEL ? 99 : SECTOR_ORDER.indexOf(b as KnownSector)
      return idxA - idxB
    })

    for (const sec of itemSectors) {
      const allocations = sectorOpsMap.get(sec) || []
      const sectorOpNumbers = allocations.map((a) => a.opNumber)
      const sectorOrderIds = allocations.map((a) => a.orderId)

      // Soma das quantidades da BOM daquele setor
      const bomSum = allocations.reduce((sum, a) => sum + (a.quantity ?? 0), 0)
      // Se tiver apenas 1 setor no item e a soma for 0 ou divergente, fallback para item.total_quantity
      const sectorQuantity =
        itemSectors.length === 1 && bomSum === 0
          ? item.total_quantity
          : bomSum > 0
            ? bomSum
            : item.total_quantity

      const card: SectorItemCard = {
        cardKey: `${item.id}__${sec}`,
        item,
        sector: sec,
        sectorQuantity: Number(sectorQuantity.toFixed(4)),
        sectorOpNumbers,
        sectorOrderIds,
        sectorAllocations: allocations,
      }

      if (groupsMap.has(sec)) {
        groupsMap.get(sec)!.push(card)
      } else {
        groupsMap.get(NO_SECTOR_LABEL)!.push(card)
      }
    }
  }

  // Montar lista final na ordem estrita: Fabricação, Preparação, Montagem, Expedição, Sem setor
  const result: SectorGroup[] = []

  for (const s of SECTOR_ORDER) {
    const cards = groupsMap.get(s) || []
    if (cards.length > 0) {
      result.push({ sector: s, cards })
    }
  }

  const noSectorCards = groupsMap.get(NO_SECTOR_LABEL) || []
  if (noSectorCards.length > 0) {
    result.push({ sector: NO_SECTOR_LABEL, cards: noSectorCards })
  }

  return result
}
