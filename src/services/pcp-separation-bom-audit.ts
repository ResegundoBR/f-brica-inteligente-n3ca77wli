import pb from '@/lib/pocketbase/client'
import { safeUnwrapJson } from '@/lib/safe-json'
import { normalizeKey } from '@/services/material-consolidation'
import { isFabricatedCode } from '@/services/pcp-separation-sectors'

export type AuditClassification = 'FALTA ESCONDIDA' | 'FALTA A MENOR' | 'SEPARADO A MENOR' | 'OK'

export interface OpInvolvement {
  orderId: string
  opNumber: string
  orderNumber?: string
  clientName?: string
  productName?: string
  opQuantity: number
  itemQuantity: number
  isConcluded: boolean
}

export interface ExistingAuditShortageInfo {
  id: string
  code: string
  description: string
  quantity: number
  received_quantity: number
  sector: string
  status: string
  created: string
  observation?: string
  order_id?: string
}

export interface SeparationAuditItem {
  code: string
  description: string
  sector: string
  unit: string
  expectedQuantity: number
  separatedQuantity: number
  registeredShortageQuantity: number
  difference: number
  classification: AuditClassification
  involvedOps: OpInvolvement[]
  // Rastreabilidade do Hub e faltas existentes
  existingShortages?: ExistingAuditShortageInfo[]
  sentToHubAt?: string
  sentToHubShortageId?: string
}

export interface SeparationAuditReport {
  separationId: string
  separationTitle: string
  separationDate?: string
  separationStatus: string
  programacaoSeq?: number
  items: SeparationAuditItem[]
  totals: {
    totalItems: number
    totalExpected: number
    totalSeparated: number
    totalShortageRegistered: number
    faltaEscondidaCount: number
    faltaAMenorCount: number
    separadoAMenorCount: number
    okCount: number
  }
}

export const TARGET_SEPARATIONS = [
  { id: 'x8h82tpd8m5ezrj', label: 'Separação #1 (Prog #30 - 21/09)' },
  { id: 'tdqp6jw2q6vbkuw', label: 'Separação #2 (Prog 2 - 25/09)' },
  { id: '9jpjfi61ca121h1', label: 'Separação #3 (Prog #3 - 06/10)' },
  { id: 'hbifdk2k7u7rm5q', label: 'Separação #4 (08/10 - Em Separação)' },
]

export const ACTIVE_SHORTAGE_STATUSES = [
  'Pendente',
  'Cotação',
  'Compra',
  'Recebido_Parcial',
] as const

// Unidades lineares legítimas com fração (cabos, barras, tubos, etc.)
export function isLinearOrContinuousUnit(unitStr?: string): boolean {
  const u = (unitStr || '').trim().toUpperCase()
  return (
    u === 'MT' ||
    u === 'M' ||
    u === 'MTR' ||
    u === 'METRO' ||
    u === 'METROS' ||
    u === 'KG' ||
    u === 'G' ||
    u === 'L' ||
    u === 'LT' ||
    u === 'LITRO' ||
    u === 'LITROS' ||
    u === 'ML' ||
    u === 'M2' ||
    u === 'M²' ||
    u === 'M3' ||
    u === 'M³'
  )
}

// Verifica se é estritamente peça / unidade contável que NUNCA pode ter fração (PC, UN, etc.)
export function isPieceUnit(unitStr?: string): boolean {
  const u = (unitStr || '').trim().toUpperCase()
  if (!u) return false
  if (isLinearOrContinuousUnit(u)) return false
  return (
    u === 'PC' ||
    u === 'PÇ' ||
    u === 'PECA' ||
    u === 'PEÇA' ||
    u === 'UN' ||
    u === 'UND' ||
    u === 'UNID' ||
    u === 'UNIDADE' ||
    u === 'CJ' ||
    u === 'CONJ' ||
    u === 'CONJUNTO' ||
    u === 'PAR' ||
    u === 'PARES' ||
    u === 'KIT' ||
    u === 'RL' ||
    u === 'ROLO' ||
    u === 'CX' ||
    u === 'CAIXA' ||
    u === 'PT' ||
    u === 'PCT' ||
    u === 'PACOTE'
  )
}

/**
 * Normaliza o setor da composição ou do material para os 4 padrões do PCP.
 */
export function normalizeSector(raw?: string | null): string {
  if (!raw) return 'FABRICAÇÃO'
  const s = raw.trim().toUpperCase()
  if (s.includes('PREPAR') || s.includes('ACABAM')) return 'PREPARAÇÃO'
  if (s.includes('MONTAG')) return 'MONTAGEM'
  if (s.includes('EXPED') || s.includes('EMBAL')) return 'EXPEDIÇÃO'
  return 'FABRICAÇÃO'
}

/**
 * Regra de classificação de integridade de acordo com a especificação da tarefa:
 * 1. FALTA ESCONDIDA:
 *    esperado - separado - falta registrada > 0
 *    (ou seja: havia demanda esperada que não foi separada e ninguém pediu a diferença em Suprimentos)
 * 2. FALTA A MENOR:
 *    falta registrada > 0 E falta registrada < (esperado - separado)
 *    (a falta foi solicitada, mas com quantidade insuficiente para cobrir o que falta)
 * 3. SEPARADO A MENOR:
 *    separado < esperado e falta registrada == 0
 *    (separado abaixo do esperado e nenhuma falta cobrindo)
 * 4. OK:
 *    Caso contrário (coberto integralmente por separado + falta registrada, ou separado >= esperado)
 */
export function classifyAuditItem(params: {
  expected: number
  separated: number
  registeredShortage: number
}): { classification: AuditClassification; difference: number } {
  const { expected, separated, registeredShortage } = params
  const round = (v: number) => Math.round(v * 10000) / 10000

  const diffUncovered = round(expected - separated - registeredShortage)
  const diffMissing = round(expected - separated)

  // Tolerância de ponto flutuante
  const EPSILON = 0.0001

  if (diffUncovered > EPSILON) {
    if (registeredShortage > EPSILON) {
      // Havia uma falta registrada, mas foi a menor
      return { classification: 'FALTA A MENOR', difference: diffUncovered }
    } else if (separated > EPSILON && separated < expected) {
      // Separou uma parte, mas a diferença ficou a descoberto sem pedido
      return { classification: 'SEPARADO A MENOR', difference: diffUncovered }
    } else {
      // Nada foi separado ou nada foi pedido: falta escondida
      return { classification: 'FALTA ESCONDIDA', difference: diffUncovered }
    }
  }

  return { classification: 'OK', difference: 0 }
}

/**
 * Gera o relatório de auditoria BOM para uma ou mais separações.
 */
export async function generateSeparationBomAudit(
  separationIds: string[],
): Promise<SeparationAuditReport[]> {
  if (!separationIds || separationIds.length === 0) return []

  const reports: SeparationAuditReport[] = []

  for (const sepId of separationIds) {
    // 1. Carregar a separação
    let sep: any = null
    try {
      sep = await pb.collection('material_separations').getOne(sepId, {
        expand: 'programacao_id',
      })
    } catch (e) {
      console.warn(`[AUDITORIA BOM] Separação ${sepId} não encontrada:`, e)
      continue
    }

    const rawOrderIds = safeUnwrapJson<string[]>(sep.order_ids) || []
    const orderIds = Array.isArray(rawOrderIds) ? rawOrderIds.filter(Boolean) : []

    // 2. Carregar todas as OPs envolvidas nesta separação
    let orders: any[] = []
    if (orderIds.length > 0) {
      try {
        const filterStr = orderIds.map((id) => `id = "${id}"`).join(' || ')
        orders = await pb.collection('pcp_orders').getFullList({
          filter: filterStr,
          expand: 'product_id',
        })
      } catch (err) {
        console.error(`[AUDITORIA BOM] Erro ao buscar ordens para separação ${sepId}:`, err)
      }
    }

    const ordersById = new Map<string, any>()
    for (const o of orders) {
      ordersById.set(o.id, o)
    }

    // 3. Carregar linhas de pcp_order_materials das OPs envolvidas
    let orderMaterials: any[] = []
    if (orderIds.length > 0) {
      try {
        const filterStr = orderIds.map((id) => `order_id = "${id}"`).join(' || ')
        orderMaterials = await pb.collection('pcp_order_materials').getFullList({
          filter: filterStr,
        })
      } catch (err) {
        console.error(`[AUDITORIA BOM] Erro ao buscar pcp_order_materials:`, err)
      }
    }

    // 4. Carregar solicitações de falta vinculadas a essas OPs E também solicitações sem OP (gerais / Auditoria BOM)
    let shortages: any[] = []
    if (orderIds.length > 0) {
      try {
        const activeFilter = ACTIVE_SHORTAGE_STATUSES.map((s) => `status = "${s}"`).join(' || ')
        const ordersFilter = orderIds.map((id) => `order_id = "${id}"`).join(' || ')
        // Busca com order_id vinculado às OPs da separação OU sem order_id (solicitações gerais/criadas via Hub)
        const combinedFilter = `(${ordersFilter} || order_id = "" || order_id = null) && (${activeFilter})`
        shortages = await pb.collection('material_shortages').getFullList({
          filter: combinedFilter,
        })
      } catch (err) {
        console.error(`[AUDITORIA BOM] Erro ao buscar material_shortages:`, err)
      }
    }

    // 5. Itens gravados na separação (items, separated_items, shortage_items)
    const rawItems = safeUnwrapJson<any[]>(sep.items) || []
    const sepItems = Array.isArray(rawItems) ? rawItems : []

    const rawSeparated = safeUnwrapJson<any[]>(sep.separated_items) || []
    const sepSeparatedItems = Array.isArray(rawSeparated) ? rawSeparated : []

    // Mapear itens gravados na separação por chave normalizada (código + setor)
    // Para identificar quanto o operador marcou como SEPARADO
    const separatedQtyByCodeAndSector = new Map<string, number>()
    const recordedItemInfoByCode = new Map<
      string,
      { description: string; unit: string; sector: string }
    >()

    // Varrer todos os itens da separação
    for (const it of sepItems) {
      if (!it || !it.code) continue
      if (isFabricatedCode(it.code)) continue

      const codeKey = normalizeKey(it.code)
      const desc = it.description || ''
      const unit = it.unit || 'UN'
      const status = String(it.status || '').toLowerCase()

      let sepQty = 0
      if (status === 'separado' || status === 'ja_separado') {
        sepQty = Number(it.total_quantity) || 0
      } else if (status === 'parcial') {
        sepQty = Number(it.separated_quantity) || 0
      }

      if (!recordedItemInfoByCode.has(codeKey)) {
        recordedItemInfoByCode.set(codeKey, { description: desc, unit, sector: 'FABRICAÇÃO' })
      }

      // Adicionar à quantidade separada acumulada do código
      const cur = separatedQtyByCodeAndSector.get(codeKey) || 0
      separatedQtyByCodeAndSector.set(codeKey, cur + sepQty)
    }

    // Também verificar separated_items caso itens tenham sido movidos para lá
    for (const sit of sepSeparatedItems) {
      if (!sit || !sit.code) continue
      if (isFabricatedCode(sit.code)) continue
      const codeKey = normalizeKey(sit.code)
      const qty = Number(sit.total_quantity || sit.separated_quantity) || 0
      const cur = separatedQtyByCodeAndSector.get(codeKey) || 0
      // se não foi contado ainda ou se separated_items for a fonte direta
      if (qty > cur) {
        separatedQtyByCodeAndSector.set(codeKey, qty)
      }
    }

    // 6. CALCULAR ESPERADO POR ITEM E POR SETOR
    // Para cada item de cada OP:
    // - Se OP Concluída: recomputar da composição do produto (products.data.composition) × order.quantity
    // - Se OP Não Concluída: ler direto de pcp_order_materials (já reparado na 0.0.430)
    // chave de consolidação: `${codeKey}:::${sectorKey}`
    interface Consolidator {
      code: string
      description: string
      sector: string
      unit: string
      expectedQuantity: number
      involvedOps: Map<string, OpInvolvement>
    }

    const consolidatedMap = new Map<string, Consolidator>()

    // Auxiliar para registrar demanda esperada
    const addExpectedDemand = (params: {
      code: string
      description: string
      sector: string
      unit: string
      qty: number
      order: any
      isConcluded: boolean
    }) => {
      const { code, description, sector, unit, qty, order, isConcluded } = params
      if (!code || isFabricatedCode(code)) return
      if (qty <= 0) return

      const codeKey = normalizeKey(code)
      const secNorm = normalizeSector(sector)
      const itemKey = `${codeKey}:::${secNorm}`

      let group = consolidatedMap.get(itemKey)
      if (!group) {
        group = {
          code: code.trim(),
          description: description.trim() || 'Material',
          sector: secNorm,
          unit: unit || 'UN',
          expectedQuantity: 0,
          involvedOps: new Map(),
        }
        consolidatedMap.set(itemKey, group)
      }

      group.expectedQuantity += qty

      const opNum = order.op_number ? String(order.op_number) : order.id
      const prodName =
        order.expand?.product_id?.name || order.manual_product_name || 'Produto não especificado'

      const existingOp = group.involvedOps.get(order.id)
      if (existingOp) {
        existingOp.itemQuantity += qty
      } else {
        group.involvedOps.set(order.id, {
          orderId: order.id,
          opNumber: opNum,
          orderNumber: order.order_number || '',
          clientName: order.client_name || '',
          productName: prodName,
          opQuantity: Number(order.quantity) || 1,
          itemQuantity: qty,
          isConcluded,
        })
      }
    }

    // Iterar pelas ordens desta separação
    for (const order of orders) {
      const isConcluded = order.status === 'Concluído'
      const opQty = Number(order.quantity) || 1

      // REGRA DE AUDITORIA BOM:
      // Priorizar SEMPRE a linha de pcp_order_materials quando ela existir para esta OP.
      // Se não houver linha em pcp_order_materials para o item na OP, recomputar a partir
      // da composição do produto (products.data.composition) × opQty.
      // Ao recomputar por composição, quando a unidade for PC / contável (não linear),
      // SEMPRE arredondar a quantidade para CIMA (Math.ceil) — nunca fracionar peça!
      const opMats = orderMaterials.filter((m) => m.order_id === order.id)
      const hasOpMats = opMats.length > 0

      if (hasOpMats) {
        // Priorizar as linhas reais registradas na OP
        for (const m of opMats) {
          const mCode = (m.code || '').trim()
          if (!mCode || isFabricatedCode(mCode)) continue
          let mQty = Number(m.quantity) || 0

          // Se por resíduo anterior a linha de PC veio fracionária, arredonda para cima
          const mUnit = m.unit || 'UN'
          if (isPieceUnit(mUnit) && mQty > 0 && Math.floor(mQty) !== mQty) {
            mQty = Math.ceil(mQty)
          }

          addExpectedDemand({
            code: mCode,
            description: m.description || '',
            sector: m.sector || 'FABRICAÇÃO',
            unit: mUnit,
            qty: mQty,
            order,
            isConcluded,
          })
        }
      } else {
        // Se a OP não possui registros em pcp_order_materials, recomputar da composição do produto
        const product = order.expand?.product_id
        const rawComp = safeUnwrapJson<any[]>(product?.data?.composition) || []
        const composition = Array.isArray(rawComp) ? rawComp : []

        if (composition.length > 0) {
          for (const c of composition) {
            const compCode = (c.code || '').trim()
            if (!compCode || isFabricatedCode(compCode)) continue
            const compUnit = c.unit || 'UN'
            const compQtyPerUnit = Number(c.quantity) || 1

            let expectedTotal = compQtyPerUnit * opQty
            // Arredondar peças contáveis (PC, UN, etc.) SEMPRE para cima — nunca fracionar peça!
            // Para unidades lineares (MT, KG, etc.), mantém a fração precisa de 4 casas
            if (isPieceUnit(compUnit)) {
              expectedTotal = Math.ceil(expectedTotal)
            } else {
              expectedTotal = Math.round(expectedTotal * 10000) / 10000
            }

            addExpectedDemand({
              code: compCode,
              description: c.description || '',
              sector: c.etapa || 'FABRICAÇÃO',
              unit: compUnit,
              qty: expectedTotal,
              order,
              isConcluded,
            })
          }
        }
      }
    }

    // 7. Agrupar FALTAS REGISTRADAS (material_shortages):
    // Casamento duplo e seguro (sem contar em dobro):
    // 1o nível: Faltas vinculadas diretamente a uma OP desta separação (order_id in orderIds)
    // 2o nível (fallback): Faltas SEM OP vinculada cujo código normalizado + setor coincidam com o item da BOM.
    // Garantir que cada registro de falta seja somado no máximo UMA vez.
    const orderIdSet = new Set(orderIds)
    const matchedShortageIds = new Set<string>()

    // Mapeamentos indexados
    // a) Faltas vinculadas por OP: codeKey -> shortages[]
    // b) Faltas avulsas (sem OP ou order_id vazio): `${codeKey}:::${sectorKey}` -> shortages[]
    const shortagesWithOpByCode = new Map<string, any[]>()
    const shortagesWithoutOpByItemKey = new Map<string, any[]>()
    const existingShortagesByItemKey = new Map<string, ExistingAuditShortageInfo[]>()

    for (const sh of shortages) {
      if (!sh.code) continue
      const cKey = normalizeKey(sh.code)
      const shSectorNorm = normalizeSector(sh.sector)
      const hasOrderMatch = sh.order_id && orderIdSet.has(sh.order_id)

      if (hasOrderMatch) {
        const list = shortagesWithOpByCode.get(cKey) || []
        list.push(sh)
        shortagesWithOpByCode.set(cKey, list)
      } else if (!sh.order_id || sh.order_id === '') {
        // Sem OP: agrupa por código normalizado + setor normalizado
        const itemKey = `${cKey}:::${shSectorNorm}`
        const list = shortagesWithoutOpByItemKey.get(itemKey) || []
        list.push(sh)
        shortagesWithoutOpByItemKey.set(itemKey, list)
      }
    }

    // 8. Montar a lista final auditada para este relatório
    const items: SeparationAuditItem[] = []

    for (const group of consolidatedMap.values()) {
      const codeKey = normalizeKey(group.code)
      const secNorm = group.sector
      const itemKey = `${codeKey}:::${secNorm}`
      const expected = Math.round(group.expectedQuantity * 10000) / 10000

      // Separado gravado para este código
      const totalSeparatedForCode = separatedQtyByCodeAndSector.get(codeKey) || 0
      const separated = Math.min(expected, totalSeparatedForCode)

      // Calcular falta registrada para este item (com casamento prioritário por OP e fallback por código+setor sem OP)
      let itemRegisteredShortage = 0
      const existingShortagesForThisItem: ExistingAuditShortageInfo[] = []

      // 1o nível: Faltas casadas por OP (pertencentes às OPs envolvidas no grupo)
      const opShortageList = shortagesWithOpByCode.get(codeKey) || []
      for (const sh of opShortageList) {
        if (!sh || matchedShortageIds.has(sh.id)) continue
        // Verificar se a OP da falta está entre as OPs deste grupo
        if (sh.order_id && group.involvedOps.has(sh.order_id)) {
          matchedShortageIds.add(sh.id)
          const shQty = Number(sh.quantity) || 0
          const recQty = Number(sh.received_quantity) || 0
          itemRegisteredShortage += shQty + recQty

          existingShortagesForThisItem.push({
            id: sh.id,
            code: sh.code,
            description: sh.description || '',
            quantity: shQty,
            received_quantity: recQty,
            sector: sh.sector || 'Suprimentos',
            status: sh.status,
            created: sh.created,
            observation: sh.observation || '',
            order_id: sh.order_id || undefined,
          })
        }
      }

      // 2o nível (fallback): Faltas SEM OP vinculada cujo código + setor coincidam
      const unlinkedShortageList = shortagesWithoutOpByItemKey.get(itemKey) || []
      for (const sh of unlinkedShortageList) {
        if (!sh || matchedShortageIds.has(sh.id)) continue
        matchedShortageIds.add(sh.id)
        const shQty = Number(sh.quantity) || 0
        const recQty = Number(sh.received_quantity) || 0
        itemRegisteredShortage += shQty + recQty

        existingShortagesForThisItem.push({
          id: sh.id,
          code: sh.code,
          description: sh.description || '',
          quantity: shQty,
          received_quantity: recQty,
          sector: sh.sector || 'Suprimentos',
          status: sh.status,
          created: sh.created,
          observation: sh.observation || '',
          order_id: undefined,
        })
      }

      const registeredShortage = Math.round(itemRegisteredShortage * 10000) / 10000

      const { classification, difference } = classifyAuditItem({
        expected,
        separated,
        registeredShortage,
      })

      // Identificar se foi enviada ao Hub:
      // Pode ser identificada pela tag de observação da Auditoria BOM
      // OU por qualquer solicitação vinculada existente que cubra a falta
      const targetSepTag = `separação #${sep.expand?.programacao_id?.seq_number ?? sepId}`
      const auditCreatedShortage =
        existingShortagesForThisItem.find(
          (s) =>
            (s.observation || '').includes('Auditoria BOM') &&
            ((s.observation || '').toLowerCase().includes(targetSepTag.toLowerCase()) ||
              (s.observation || '').includes(sepId)),
        ) || existingShortagesForThisItem[0]

      const isSentToHub = Boolean(auditCreatedShortage)

      items.push({
        code: group.code,
        description: group.description,
        sector: group.sector,
        unit: group.unit,
        expectedQuantity: expected,
        separatedQuantity: Math.round(separated * 10000) / 10000,
        registeredShortageQuantity: registeredShortage,
        difference: Math.round(difference * 10000) / 10000,
        classification,
        involvedOps: Array.from(group.involvedOps.values()),
        existingShortages: existingShortagesForThisItem,
        sentToHubAt: auditCreatedShortage?.created,
        sentToHubShortageId: auditCreatedShortage?.id,
      })
    }

    // Ordenar itens por código dentro de cada separação conforme Tarefa (1)
    items.sort((a, b) => a.code.localeCompare(b.code))

    // Totais do rodapé
    const totals = {
      totalItems: items.length,
      totalExpected: items.reduce((acc, it) => acc + it.expectedQuantity, 0),
      totalSeparated: items.reduce((acc, it) => acc + it.separatedQuantity, 0),
      totalShortageRegistered: items.reduce((acc, it) => acc + it.registeredShortageQuantity, 0),
      faltaEscondidaCount: items.filter((it) => it.classification === 'FALTA ESCONDIDA').length,
      faltaAMenorCount: items.filter((it) => it.classification === 'FALTA A MENOR').length,
      separadoAMenorCount: items.filter((it) => it.classification === 'SEPARADO A MENOR').length,
      okCount: items.filter((it) => it.classification === 'OK').length,
    }

    reports.push({
      separationId: sep.id,
      separationTitle: sep.title || `Separação ${sep.id}`,
      separationDate: sep.date || sep.created,
      separationStatus: sep.status,
      programacaoSeq: sep.expand?.programacao_id?.seq_number,
      items,
      totals,
    })
  }

  return reports
}
