import { Inventory, MasterComponent, PcpOrderMaterial } from '@/types'

export interface CompiledMaterialItem {
  key: string
  code: string
  description: string
  isProfileOrTube: boolean
  totalQuantity: number
  unit: string
  // Dados de estoque vinculado
  hasInventoryRecord: boolean
  stockQuantity: number | null
  stockUnit: string
  // Cálculo de necessidade
  status: 'covered' | 'shortage' | 'no_stock_record'
  missingQuantity: number // totalQuantity - stockQuantity (se positivo)
  surplusQuantity: number // stockQuantity - totalQuantity (se positivo)
  // OPs de origem
  ordersCount: number
  orderNumbers: string[]
  // Vínculo mestre / estoque
  masterComponent?: MasterComponent
  inventoryItem?: Inventory
  matchMethod: 'code' | 'code_desc' | 'desc_only' | 'none'
}

/**
 * Normaliza strings para agrupamento seguro sem alterar os dados originais
 */
export function normalizeKeyPart(str?: string): string {
  if (!str) return ''
  return str
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Identifica se um item é estritamente TUBO, BARRA ou CHAPA DE PERFIL (seção do topo).
 * CABO, FIO, chicote, cordão e similares (mesmo com unidade MT) devem ficar nos demais componentes.
 * Apenas itens cuja descrição contenha TUBO, BARRA ou CHAPA DE PERFIL (ou PERFIL)
 * e que NÃO sejam cabos/fios/acessórios vão para o topo.
 */
export function isProfileOrTubeItem(description?: string, _unit?: string): boolean {
  const normDesc = normalizeKeyPart(description)
  if (!normDesc) return false

  // Termos expressamente excluídos da seção do topo (vão para Demais Componentes):
  // Ex.: CABO ELETRICO 2X0,50MM REVESTIDO EM TECIDO PRETO (mesmo em MT), FIO, etc.
  const excludedKeywords = [
    'CABO',
    'FIO',
    'CHICOTE',
    'CORDAO',
    'PRENSA CABO',
    'BUCHA GUIA PARA TUBO',
    'TAMPA EM ACO PARA TUBO',
    'TAMPA PARA TUBO',
    'TERMINAL',
  ]

  const hasExcluded = excludedKeywords.some((kw) => {
    // Verifica se a palavra excluída ocorre como palavra/expressão independente
    const regex = new RegExp(`(^|\\s|[^A-Z0-9])${kw}($|\\s|[^A-Z0-9])`)
    return regex.test(normDesc)
  })

  if (hasExcluded) {
    return false
  }

  // Termos estritos para a seção do topo exigidos pelo gestor:
  // "apenas itens realmente de TUBO, BARRA ou CHAPA DE PERFIL na seção do topo"
  const strictAllowed = ['TUBO', 'TUBULAR', 'BARRA', 'CHAPA DE PERFIL', 'PERFIL']

  return strictAllowed.some((kw) => {
    const regex = new RegExp(`(^|\\s|[^A-Z0-9])${kw}($|\\s|[^A-Z0-9])`)
    return regex.test(normDesc)
  })
}

/**
 * Formata números com precisão e localidade pt-BR
 */
export function formatQuantity(value: number, unit?: string): string {
  const isMt = (unit || '').toUpperCase() === 'MT'
  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: isMt
      ? Number.isInteger(value)
        ? 0
        : 2
      : Number.isInteger(value)
        ? 0
        : 2,
    maximumFractionDigits: 3,
  }).format(value)
  return formatted
}

export interface CompileMaterialsInput {
  materials: PcpOrderMaterial[]
  orderNumbersMap?: Record<string, string> // order_id -> order_number / op_number
  masterComponents: MasterComponent[]
  inventoryItems: Inventory[]
  // Mapeamento opcional de order_id para op_number normalizado ou id representativo do op_number
  orderIdToOpNumberMap?: Record<string, string>
}

/**
 * Consolida materiais de OPs selecionadas:
 * (1) SALVAGUARDA DE DESDUPLICAÇÃO: OPs com o mesmo op_number contam apenas UMA VEZ na consolidação.
 *     Se materiais de registros duplicados com o mesmo op_number foram carregados, apenas o primeiro
 *     registro (ou id representativo) é considerado para não duplicar somas.
 * (2) Agrupando por código + descrição (ou apenas descrição se não tiver código), somando quantidades.
 * (3) Casamento com cadastro mestre / inventário:
 *     - Por código quando existir código
 *     - Por código + descrição (ou descrição pura) quando o código não casar ou não existir
 *     - Nunca mescla dados no backend (read-only em memória)
 * (4) Separação em Tubos/Barras/Chapas de Perfil e Demais Componentes.
 */
export function compileOrderMaterials({
  materials,
  orderNumbersMap = {},
  masterComponents,
  inventoryItems,
  orderIdToOpNumberMap = {},
}: CompileMaterialsInput): {
  profileItems: CompiledMaterialItem[]
  otherItems: CompiledMaterialItem[]
  totals: {
    totalDistinctItems: number
    tubesDistinctCount: number
    othersDistinctCount: number
    coveredCount: number
    shortageCount: number
    noStockCount: number
  }
} {
  // Mapas de busca para Estoque (inventory)
  const invByComponentId = new Map<string, Inventory>()
  const invByCode = new Map<string, Inventory>()
  const invByCodeAndDesc = new Map<string, Inventory>()
  const invByDesc = new Map<string, Inventory>()

  inventoryItems.forEach((inv) => {
    if (inv.component_id) invByComponentId.set(inv.component_id, inv)
    const normC = normalizeKeyPart(inv.code)
    const normD = normalizeKeyPart(inv.description)
    if (normC) invByCode.set(normC, inv)
    if (normC && normD) invByCodeAndDesc.set(`${normC}___${normD}`, inv)
    if (normD) invByDesc.set(normD, inv)
  })

  // Mapas de busca para Cadastro Mestre (components)
  const masterByCode = new Map<string, MasterComponent>()
  const masterByCodeAndDesc = new Map<string, MasterComponent>()
  const masterByDesc = new Map<string, MasterComponent>()

  masterComponents.forEach((comp) => {
    const normC = normalizeKeyPart(comp.code)
    const normD = normalizeKeyPart(comp.description)
    if (normC) masterByCode.set(normC, comp)
    if (normC && normD) masterByCodeAndDesc.set(`${normC}___${normD}`, comp)
    if (normD) masterByDesc.set(normD, comp)
  })

  // Salvaguarda de desduplicação por op_number:
  // Se houver mais de uma order_id associada ao mesmo op_number, escolhe apenas um order_id representativo
  // para os materiais serem contabilizados na consolidação.
  const seenOpNumbers = new Map<string, string>() // op_number -> first order_id
  const allowedOrderIds = new Set<string>()

  Object.entries(orderIdToOpNumberMap).forEach(([orderId, rawOpNumber]) => {
    const normOp = normalizeKeyPart(rawOpNumber)
    if (normOp) {
      if (!seenOpNumbers.has(normOp)) {
        seenOpNumbers.set(normOp, orderId)
        allowedOrderIds.add(orderId)
      }
    } else {
      allowedOrderIds.add(orderId)
    }
  })

  const hasOpMap = Object.keys(orderIdToOpNumberMap).length > 0

  // Agrupamento dos materiais
  interface GroupAcc {
    code: string
    description: string
    unit: string
    totalQty: number
    orderIds: Set<string>
  }

  const groups = new Map<string, GroupAcc>()

  materials.forEach((mat) => {
    // Salvaguarda: se tivermos mapeamento de op_number e este order_id for de uma OP duplicada secundária, ignorar
    if (hasOpMap && mat.order_id && !allowedOrderIds.has(mat.order_id)) {
      return
    }

    const code = (mat.code || '').trim()
    const desc = (mat.description || '').trim()
    const normC = normalizeKeyPart(code)
    const normD = normalizeKeyPart(desc)

    // Agrupamento: por código + descrição para máxima fidelidade e nunca misturar itens distintos
    const groupKey = normC ? `${normC}:::${normD}` : `NODECODE:::${normD}`

    const qty = Number(mat.quantity) || 0
    const unit = mat.unit || 'UN'

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        code,
        description: desc,
        unit,
        totalQty: 0,
        orderIds: new Set<string>(),
      })
    }

    const item = groups.get(groupKey)!
    item.totalQty += qty
    if (mat.order_id) {
      item.orderIds.add(mat.order_id)
    }
  })

  const compiledList: CompiledMaterialItem[] = []

  groups.forEach((group, key) => {
    const normC = normalizeKeyPart(group.code)
    const normD = normalizeKeyPart(group.description)

    // Casamento mestre / estoque conforme regra do usuário:
    // "casar por código quando existir, e por código+descrição quando não; nunca mesclar nem alterar dados"
    let matchedMaster: MasterComponent | undefined
    let matchedInv: Inventory | undefined
    let matchMethod: CompiledMaterialItem['matchMethod'] = 'none'

    if (normC) {
      // 1. Tentar por código direto
      if (invByCode.has(normC)) {
        matchedInv = invByCode.get(normC)
        matchMethod = 'code'
      }
      if (masterByCode.has(normC)) {
        matchedMaster = masterByCode.get(normC)
        if (!matchMethod) matchMethod = 'code'
      }

      // Se achou componente mestre e o inventário não foi achado por código direto,
      // tenta achar estoque pelo component_id
      if (matchedMaster && !matchedInv && invByComponentId.has(matchedMaster.id)) {
        matchedInv = invByComponentId.get(matchedMaster.id)
      }
    }

    // 2. Se não casou por código ou não tem código, casar por código + descrição ou descrição
    if (!matchedInv) {
      if (normC && normD && invByCodeAndDesc.has(`${normC}___${normD}`)) {
        matchedInv = invByCodeAndDesc.get(`${normC}___${normD}`)
        matchMethod = 'code_desc'
      } else if (normD && invByDesc.has(normD)) {
        matchedInv = invByDesc.get(normD)
        matchMethod = 'desc_only'
      }
    }

    if (!matchedMaster) {
      if (normC && normD && masterByCodeAndDesc.has(`${normC}___${normD}`)) {
        matchedMaster = masterByCodeAndDesc.get(`${normC}___${normD}`)
      } else if (normD && masterByDesc.has(normD)) {
        matchedMaster = masterByDesc.get(normD)
      }
    }

    // Se encontramos inventário com component_id mas matchedMaster ainda está vazio:
    if (matchedInv?.component_id && !matchedMaster) {
      matchedMaster = masterComponents.find((c) => c.id === matchedInv!.component_id)
    }

    // Se encontramos master e temos estoque por component_id:
    if (matchedMaster && !matchedInv && invByComponentId.has(matchedMaster.id)) {
      matchedInv = invByComponentId.get(matchedMaster.id)
    }

    const isProfile = isProfileOrTubeItem(group.description, group.unit)

    const hasInventoryRecord = !!matchedInv
    const stockQuantity =
      hasInventoryRecord && matchedInv!.quantity !== undefined && matchedInv!.quantity !== null
        ? Number(matchedInv!.quantity) || 0
        : null
    // Mantém a unidade real do material (PC, MT, UN, etc.), respeitando o cadastro ou a OP
    const itemUnit = group.unit || matchedInv?.unit || (isProfile ? 'MT' : 'UN')
    const stockUnit = matchedInv?.unit || itemUnit
    const totalQty = group.totalQty

    let status: CompiledMaterialItem['status'] = 'no_stock_record'
    let missingQuantity = 0
    let surplusQuantity = 0

    if (!hasInventoryRecord) {
      status = 'no_stock_record'
    } else {
      const stock = stockQuantity ?? 0
      if (stock >= totalQty) {
        status = 'covered'
        surplusQuantity = stock - totalQty
      } else {
        status = 'shortage'
        missingQuantity = totalQty - stock
      }
    }

    // Identificar ordens vinculadas
    const orderNumbers: string[] = []
    group.orderIds.forEach((oid) => {
      const displayNum = orderNumbersMap[oid] || oid
      if (displayNum && !orderNumbers.includes(displayNum)) {
        orderNumbers.push(displayNum)
      }
    })

    compiledList.push({
      key,
      code: group.code || matchedMaster?.code || matchedInv?.code || '',
      description: group.description || matchedMaster?.description || matchedInv?.description || '',
      isProfileOrTube: isProfile,
      totalQuantity: totalQty,
      unit: itemUnit,
      hasInventoryRecord,
      stockQuantity,
      stockUnit,
      status,
      missingQuantity,
      surplusQuantity,
      ordersCount: group.orderIds.size,
      orderNumbers,
      masterComponent: matchedMaster,
      inventoryItem: matchedInv,
      matchMethod,
    })
  })

  // Ordenar itens: por descrição alfabética
  compiledList.sort((a, b) => a.description.localeCompare(b.description))

  const profileItems = compiledList.filter((item) => item.isProfileOrTube)
  const otherItems = compiledList.filter((item) => !item.isProfileOrTube)

  const coveredCount = compiledList.filter((i) => i.status === 'covered').length
  const shortageCount = compiledList.filter((i) => i.status === 'shortage').length
  const noStockCount = compiledList.filter((i) => i.status === 'no_stock_record').length

  return {
    profileItems,
    otherItems,
    totals: {
      totalDistinctItems: compiledList.length,
      tubesDistinctCount: profileItems.length,
      othersDistinctCount: otherItems.length,
      coveredCount,
      shortageCount,
      noStockCount,
    },
  }
}
