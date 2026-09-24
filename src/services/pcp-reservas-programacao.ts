import pb from '@/lib/pocketbase/client'
import {
  getStockAvailabilityForCodes,
  ComponentStockAvailability,
  normalizeCode,
} from '@/services/material-reservations'
import { PcpOrder, PcpOrderMaterial } from '@/types'

export interface OpDemandDetail {
  orderId: string
  orderNumber: string
  opNumber: string
  clientName: string
  productName: string
  quantity: number // quantidade necessária/reservada da OP
  stage: string
  status: string
  deliveryDate?: string
  isReserved: boolean
  isProgrammed: boolean
  separationStatus?: string
  programacaoName?: string
}

export interface ComponentProgrammedReservationSummary {
  code: string
  description: string
  unit: string
  totalStock: number
  reservedStock: number
  availableStock: number
  totalDemanded: number // soma das necessidades/reservas das OPs ativas
  isCovered: boolean // availableStock >= totalDemanded (ou saldo final >= 0)
  deficit: number // max(0, totalDemanded - availableStock)
  surplus: number // max(0, availableStock - totalDemanded)
  ops: OpDemandDetail[]
}

/**
 * Normaliza data para ordenação/comparações (YYYY-MM-DD)
 */
export function normalizeDate(dateStr?: string | null): string {
  if (!dateStr) return '9999-99-99'
  return dateStr.slice(0, 10)
}

/**
 * Consolida todas as demandas e reservas ativas/programadas agrupadas por componente.
 * Fontes de dados:
 * 1. pcp_order_materials de OPs ativas (order.status != 'Concluído')
 * 2. material_reservations ativas (status = 'Ativa')
 * 3. material_separations e pcp_programacoes em andamento
 * 4. Disponibilidade real via getStockAvailabilityForCodes
 */
export async function getProgrammedReservationsOverview(filters?: {
  startDate?: string
  endDate?: string
  searchTerm?: string
}): Promise<ComponentProgrammedReservationSummary[]> {
  try {
    // 1. Carregar OPs ativas (não concluídas) com produto expandido
    const activeOrders = await pb.collection('pcp_orders').getFullList<PcpOrder>({
      filter: 'status != "Concluído"',
      expand: 'product_id,client_id',
      sort: 'delivery_date',
    })

    const ordersMap = new Map<string, PcpOrder>()
    for (const order of activeOrders) {
      ordersMap.set(order.id, order)
    }

    // 2. Carregar pcp_order_materials das OPs ativas
    // Não filtrar status != Separado ou carregar tudo para identificar tanto o que necessita quanto o que já separou
    const orderMaterials = await pb
      .collection('pcp_order_materials')
      .getFullList<PcpOrderMaterial>({
        filter: 'order_id.status != "Concluído"',
        sort: '-created',
      })

    // 3. Carregar reservas ativas de material_reservations
    let activeReservations: any[] = []
    try {
      activeReservations = await pb.collection('material_reservations').getFullList({
        filter: 'status = "Ativa"',
        expand: 'separation_id,separation_id.programacao_id',
      })
    } catch {
      activeReservations = []
    }

    // 4. Carregar separações em aberto para cruzar se necessário
    let activeSeparations: any[] = []
    try {
      activeSeparations = await pb.collection('material_separations').getFullList({
        filter: 'status != "Concluida" && status != "Cancelada"',
        expand: 'programacao_id',
      })
    } catch {
      activeSeparations = []
    }

    // Mapear programações vinculadas a order_ids
    const orderToProgramacao = new Map<string, { progName?: string; sepStatus?: string }>()
    for (const sep of activeSeparations) {
      const progName = sep.expand?.programacao_id?.name || sep.title
      const sepStatus = sep.status
      if (Array.isArray(sep.order_ids)) {
        for (const oid of sep.order_ids) {
          if (oid) {
            orderToProgramacao.set(oid, { progName, sepStatus })
          }
        }
      }
    }

    // 5. Agrupar demandas por componente (código normalizado)
    const grouped = new Map<
      string,
      {
        code: string
        description: string
        unit: string
        opsMap: Map<string, OpDemandDetail>
      }
    >()

    const registerOpItem = (params: {
      code: string
      description: string
      unit: string
      orderId: string
      qty: number
      isReserved: boolean
    }) => {
      const normCode = normalizeCode(params.code)
      if (!normCode) return

      const order = ordersMap.get(params.orderId)
      if (!order) return // OP concluída ou não ativa

      if (!grouped.has(normCode)) {
        grouped.set(normCode, {
          code: params.code.trim(),
          description: params.description.trim(),
          unit: params.unit || 'un',
          opsMap: new Map(),
        })
      }

      const compGroup = grouped.get(normCode)!
      if (!compGroup.description && params.description) {
        compGroup.description = params.description.trim()
      }

      const existingOp = compGroup.opsMap.get(params.orderId)
      if (existingOp) {
        existingOp.quantity += params.qty
        if (params.isReserved) existingOp.isReserved = true
      } else {
        const progInfo = orderToProgramacao.get(params.orderId)
        const clientName =
          order.client_name || (order.expand?.client_id as any)?.name || 'Cliente Geral'
        const productName =
          (order.expand?.product_id as any)?.name ||
          order.manual_product_name ||
          'Produto sob encomenda'

        compGroup.opsMap.set(params.orderId, {
          orderId: order.id,
          orderNumber: order.order_number || 'S/N',
          opNumber: order.op_number || '-',
          clientName,
          productName,
          quantity: params.qty,
          stage: order.stage || '-',
          status: order.status || 'Ativa',
          deliveryDate: order.delivery_date || undefined,
          isReserved: params.isReserved,
          isProgrammed: !!progInfo,
          separationStatus: progInfo?.sepStatus,
          programacaoName: progInfo?.progName,
        })
      }
    }

    // Inserir materiais da BOM das OPs ativas
    for (const mat of orderMaterials) {
      const qty = Number(mat.quantity) || 0
      if (qty <= 0) continue

      registerOpItem({
        code: mat.code || '',
        description: mat.description || '',
        unit: mat.unit || 'un',
        orderId: mat.order_id,
        qty,
        isReserved: mat.status === 'Separado',
      })
    }

    // Adicionar informações das reservas formais (caso haja OP com reserva explícita)
    for (const resv of activeReservations) {
      const sep = resv.expand?.separation_id
      const orderIds = sep?.order_ids || []
      const qty = Number(resv.quantity) || 0
      if (qty <= 0) continue

      // Se tiver vinculação direta a uma OP específica
      if (orderIds.length === 1) {
        registerOpItem({
          code: resv.code || '',
          description: resv.description || '',
          unit: 'un',
          orderId: orderIds[0],
          qty: 0, // quantidade já computada na BOM ou reserva
          isReserved: true,
        })
      }
    }

    // 6. Consultar disponibilidade de estoque em lote para todos os códigos identificados
    const allCodes = Array.from(grouped.values()).map((g) => g.code)
    const stockMap = await getStockAvailabilityForCodes(allCodes)

    // 7. Consolidar os resumos
    const results: ComponentProgrammedReservationSummary[] = []

    for (const [normCode, compGroup] of grouped.entries()) {
      const stock = stockMap.get(normCode)
      const totalStock = stock?.totalStock ?? 0
      const reservedStock = stock?.reservedStock ?? 0
      const availableStock = stock?.availableStock ?? Math.max(0, totalStock - reservedStock)

      const opsList = Array.from(compGroup.opsMap.values())

      // Aplicar filtro de período de vencimento nas OPs se informado
      let filteredOps = opsList
      if (filters?.startDate || filters?.endDate) {
        filteredOps = opsList.filter((op) => {
          if (!op.deliveryDate) return false
          const d = normalizeDate(op.deliveryDate)
          if (filters?.startDate && d < normalizeDate(filters.startDate)) return false
          if (filters?.endDate && d > normalizeDate(filters.endDate)) return false
          return true
        })
      }

      if (filteredOps.length === 0 && (filters?.startDate || filters?.endDate)) {
        continue
      }

      // Ordenar OPs da mais próxima do vencimento para a mais distante
      filteredOps.sort((a, b) => {
        const da = normalizeDate(a.deliveryDate)
        const db = normalizeDate(b.deliveryDate)
        return da.localeCompare(db)
      })

      const totalDemanded = filteredOps.reduce((sum, o) => sum + o.quantity, 0)
      const isCovered = availableStock >= totalDemanded
      const deficit = Math.max(0, totalDemanded - availableStock)
      const surplus = Math.max(0, availableStock - totalDemanded)

      // Aplicar filtro de busca se informado
      if (filters?.searchTerm?.trim()) {
        const q = filters.searchTerm.toLowerCase().trim()
        const matchCode = compGroup.code.toLowerCase().includes(q)
        const matchDesc = compGroup.description.toLowerCase().includes(q)
        const matchOp = filteredOps.some(
          (o) =>
            o.opNumber.toLowerCase().includes(q) ||
            o.orderNumber.toLowerCase().includes(q) ||
            o.clientName.toLowerCase().includes(q) ||
            o.productName.toLowerCase().includes(q),
        )
        if (!matchCode && !matchDesc && !matchOp) {
          continue
        }
      }

      results.push({
        code: compGroup.code,
        description: compGroup.description,
        unit: compGroup.unit || stock?.unit || 'un',
        totalStock,
        reservedStock,
        availableStock,
        totalDemanded,
        isCovered,
        deficit,
        surplus,
        ops: filteredOps,
      })
    }

    // Ordenar componentes: primeiro os com déficit (mais críticos), depois alfabeticamente por código
    return results.sort((a, b) => {
      if (!a.isCovered && b.isCovered) return -1
      if (a.isCovered && !b.isCovered) return 1
      if (b.deficit !== a.deficit) return b.deficit - a.deficit
      return a.code.localeCompare(b.code)
    })
  } catch (err) {
    console.error('Erro ao consolidar reservas por programação:', err)
    return []
  }
}
