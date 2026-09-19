import { Inventory, MasterComponent, PcpOrderMaterial, Product, PcpOrder } from '@/types'

export interface CompiledMaterialItem {
  key: string
  code: string
  description: string
  isProfileOrTube: boolean
  totalQuantity: number
  unit: string
  cutMeasurement?: string | null
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
  orderIds?: string[]
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
 * Remove resíduos de títulos de setor e cabeçalhos de tabela do PDF da descrição.
 * Exemplo:
 * - '* P R E P A R A O *' ou '* M O N T A G E M *'
 * - 'COD PRODUTO DESCRICAO PRODUTO QTD UN SEPARACAO PRODUCAO'
 */
export function cleanMaterialDescription(raw?: string): string {
  if (!raw) return ''
  let text = raw.trim()
  if (!text) return ''

  // 1. Remover sequências de asteriscos com títulos de setor (com letras espaçadas ou juntas)
  // ex: "* P R E P A R A O *", "* M O N T A G E M *", "* FABRICAÇÃO *"
  text = text.replace(/\*\s*(?:[A-ZÀ-ÿ]\s+){2,}[A-ZÀ-ÿ]\s*\*/gi, ' ')
  text = text.replace(
    /\*\s*(?:FABRICA[CÇ]?[AÃ]?O|PREPARA[CÇ]?[AÃ]?O|MONTAGEM|EXPEDI[CÇ]?[AÃ]?O|ACABAMENTO|PINTURA|EMBALAGEM|SEPARA[CÇ]?[AÃ]?O)\s*\*/gi,
    ' ',
  )

  // 2. Remover cabeçalhos do parser do PDF e ERP
  // ex: "CÓD PRODUTO DESCRIÇÃO PRODUTO QTD UN SEPARAÇÃO PRODUÇÃO" e variações com/sem acento
  const headerPatterns = [
    /C[OÓ]D(?:IGO)?\s+PRODUTO\s+DESCRI[CÇ][AÃ]O\s+PRODUTO\s+QTD\s+UN\s+SEPARA[CÇ][AÃ]O\s+PRODU[CÇ][AÃ]O/gi,
    /C[OÓ]D(?:IGO)?\s+PRODUTO\s+DESCRI[CÇ][AÃ]O\s+PRODUTO/gi,
    /PRODUTO\s*\/\s*DESCRI[CÇ][AÃ]O\s+PRODUTO/gi,
    /QTD\s+UN\s+SEPARA[CÇ][AÃ]O\s+PRODU[CÇ][AÃ]O/gi,
    /SEPARA[CÇ][AÃ]O\s+PRODU[CÇ][AÃ]O/gi,
    /SOLICITA[CÇ][AÃ]O\s+DE\s+MATERIAIS/gi,
    /DOCUMENTO\s+DE\s+ESTOQUE/gi,
    /TOTAL\s+DE\s+PE[CÇ]AS/gi,
    /OPERA[CÇ][OÕ]ES\s+E\s+SEUS\s+MATERIAIS/gi,
  ]

  for (const pat of headerPatterns) {
    text = text.replace(pat, ' ')
  }

  // 3. Remover resíduos como asteriscos soltos e traços no início ou fim
  text = text
    .replace(/^[\s*\-_–—:]+/, '')
    .replace(/[\s*\-_–—:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()

  return text
}

/**
 * Verifica se um item é linear (código ou descrição contendo TUBO, BARRA, PERFIL, CABO)
 */
export function isLinearMaterial(code?: string, description?: string): boolean {
  const normC = normalizeKeyPart(code)
  const normD = normalizeKeyPart(description)
  const linearRegex = /\b(TUBO|TUBULAR|BARRA|PERFIL|CABO)\b/i
  return linearRegex.test(normC) || linearRegex.test(normD)
}

/**
 * Converte valor de medida de corte (string ou número) para metros (MT).
 * Exemplos aceitos:
 * - "0.500" -> 0.500 MT
 * - "0,500" -> 0.500 MT
 * - "0,500M" ou "0,500 M" -> 0.500 MT
 * - "500MM" ou "500 MM" -> 0.500 MT
 * - "50CM" ou "50 CM" -> 0.500 MT
 * - "2M" -> 2.0 MT
 * Retorna null se não houver medida válida > 0.
 */
export function parseCutMeasurementToMeters(raw?: string | number): number | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw === 'number') {
    return raw > 0 ? raw : null
  }
  const clean = String(raw).trim()
  if (!clean) return null

  // Se tem unidade explícita: MM, CM, M, MT
  const matchWithUnit = clean.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(MM|CM|M|MT)?$/i)
  if (matchWithUnit) {
    const numPart = parseFloat(matchWithUnit[1].replace(',', '.'))
    const unitPart = (matchWithUnit[2] || '').toUpperCase()
    if (isNaN(numPart) || numPart <= 0) return null

    if (unitPart === 'MM') {
      return numPart / 1000
    }
    if (unitPart === 'CM') {
      return numPart / 100
    }
    // M ou MT ou sem unidade (se sem unidade, verificar escala)
    if (unitPart === 'M' || unitPart === 'MT') {
      return numPart
    }
    // Sem unidade: se for >= 10, é quase certamente em milímetros (ex: 500, 225, 1000)
    // Se for < 10, é em metros (ex: 0.5, 0.475, 1.2)
    if (numPart >= 10) {
      return numPart / 1000
    }
    return numPart
  }

  // Tenta extrair qualquer padrão numérico com unidade dentro do texto (ex: "0,500MM")
  const subMatch = clean.match(/([0-9]+(?:[.,][0-9]+)?)\s*(MM|CM|M|MT)/i)
  if (subMatch) {
    const numPart = parseFloat(subMatch[1].replace(',', '.'))
    const unitPart = subMatch[2].toUpperCase()
    if (!isNaN(numPart) && numPart > 0) {
      if (unitPart === 'MM') return numPart / 1000
      if (unitPart === 'CM') return numPart / 100
      return numPart
    }
  }

  // Fallback: tenta ler como número puro
  const pureNum = parseFloat(clean.replace(',', '.'))
  if (!isNaN(pureNum) && pureNum > 0) {
    if (pureNum >= 10) return pureNum / 1000
    return pureNum
  }

  return null
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
  // Produtos e ordens para consulta da medida de corte cadastrada na composição
  products?: Product[]
  orders?: PcpOrder[]
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
export function compileOrderMaterials(input: CompileMaterialsInput): {
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
  const {
    materials,
    orderNumbersMap = {},
    masterComponents,
    inventoryItems,
    orderIdToOpNumberMap = {},
  } = input
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

  // Cache de mapa de OPs e Produtos para consulta de composição
  const ordersMap = new Map<string, PcpOrder>()
  if (input.orders) {
    input.orders.forEach((o) => ordersMap.set(o.id, o))
  }

  const productsMap = new Map<string, Product>()
  if (input.products) {
    input.products.forEach((p) => productsMap.set(p.id, p))
  }

  // Agrupamento dos materiais
  // Requisito 2: AGRUPAR O COMPILADO POR CÓDIGO
  // Itens com o mesmo código devem aparecer em UMA única linha, somando o Total Programado,
  // unindo as OPs que utilizam (ex.: 'OP 494, OP 495') e mantendo a descrição mais limpa/mais curta.
  interface GroupAcc {
    code: string
    description: string
    allDescriptions: string[]
    unit: string
    totalQty: number
    orderIds: Set<string>
    isLinear: boolean
  }

  const groups = new Map<string, GroupAcc>()

  materials.forEach((mat) => {
    // Salvaguarda: se tivermos mapeamento de op_number e este order_id for de uma OP duplicada secundária, ignorar
    if (hasOpMap && mat.order_id && !allowedOrderIds.has(mat.order_id)) {
      return
    }

    const rawCode = (mat.code || '').trim()
    const cleanedDesc = cleanMaterialDescription(mat.description) || (mat.description || '').trim()
    const normC = normalizeKeyPart(rawCode)
    const normD = normalizeKeyPart(cleanedDesc)

    // Agrupamento por código quando existir código (ex: FAB01270, 14010036, 06080013),
    // senão por descrição limpa
    const groupKey = normC ? `CODE:::${normC}` : `NOCODE:::${normD}`

    const rawQty = Number(mat.quantity) || 0
    let unit = (mat.unit || 'UN').trim()

    // Requisito 4: TUBOS/lineares em METROS
    // Para itens lineares (código/descrição contendo TUBO, BARRA, PERFIL, CABO)
    // que possuem medida de corte cadastrada na composição, o Total Programado deve
    // ser calculado em MT (medida de corte × quantidade por peça × quantidade da OP),
    // exibindo 'X MT' em vez de 'PC' — itens sem medida de corte continuam como estão hoje.
    const isLinear = isLinearMaterial(rawCode, cleanedDesc)
    let calculatedQty = rawQty

    if (isLinear && mat.order_id) {
      const op = ordersMap.get(mat.order_id)
      const prod = op?.product_id ? productsMap.get(op.product_id) : undefined
      const composition = prod?.data?.composition

      if (Array.isArray(composition)) {
        // Localiza o item na composição técnica daquele produto pelo código ou descrição
        const compItem = composition.find((c) => {
          const compCode = (c.code || '').trim()
          if (normC && compCode && normalizeKeyPart(compCode) === normC) return true
          const compDesc = cleanMaterialDescription(c.description)
          if (normD && compDesc && normalizeKeyPart(compDesc) === normD) return true
          return false
        })

        if (compItem) {
          const cutInMeters = parseCutMeasurementToMeters(compItem.measurements)
          if (cutInMeters !== null && cutInMeters > 0) {
            // Encontrou medida de corte cadastrada na composição!
            // Total em MT = medida de corte (em metros) × quantidade por peça × quantidade da OP
            const compItemQty = Number(compItem.quantity) || 1
            const opQty = Number(op?.quantity) || 1
            calculatedQty = cutInMeters * compItemQty * opQty
            unit = 'MT'
          }
        }
      }
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        code: rawCode,
        description: cleanedDesc,
        allDescriptions: [cleanedDesc],
        unit,
        totalQty: 0,
        orderIds: new Set<string>(),
        isLinear,
      })
    }

    const item = groups.get(groupKey)!
    item.totalQty += calculatedQty
    item.allDescriptions.push(cleanedDesc)

    // Se encontramos unidade MT para um item linear, a unidade do grupo vira MT
    if (unit.toUpperCase() === 'MT') {
      item.unit = 'MT'
    }

    // Mantém a descrição mais limpa/mais curta entre as ocorrências
    if (cleanedDesc) {
      if (
        !item.description ||
        (cleanedDesc.length < item.description.length && cleanedDesc.length > 2)
      ) {
        item.description = cleanedDesc
      }
    }

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

    // Identificar ordens vinculadas e ordenar numericamente
    const orderNumbers: string[] = []
    group.orderIds.forEach((oid) => {
      const displayNum = orderNumbersMap[oid] || oid
      if (displayNum && !orderNumbers.includes(displayNum)) {
        orderNumbers.push(displayNum)
      }
    })

    // Ordenar as OPs vinculadas (ex: "OP 494", "OP 495")
    orderNumbers.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0
      return numA - numB
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
      orderIds: Array.from(group.orderIds),
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
