import { MasterComponent, Inventory } from '@/types'

export type DuplicateReason = 'code_match' | 'embedded_code' | 'description_similarity'

export interface DuplicateItemMeta {
  component: MasterComponent
  inventoryItem?: Inventory
  stockQuantity: number
  unit: string
  sourceLabel: 'Estoque' | 'Catálogo' | 'Histórico' | 'Manual'
  isInactive: boolean
}

export interface DuplicateGroup {
  id: string
  reason: DuplicateReason
  reasonLabel: string
  reasonDetail?: string
  similarityScore?: number // 0-100%
  items: DuplicateItemMeta[]
}

/**
 * Remove acentos, pontuação, múltiplos espaços e converte para minúsculas.
 */
export function normalizeDescription(text: string): string {
  if (!text) return ''
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[,;:\-_/\\#|()[\]{}"]/g, ' ') // substitui pontuações por espaço
    .replace(/\s+/g, ' ') // condensa espaços
    .trim()
}

/**
 * Remove sufixos e palavras genéricas comuns que não alteram a identidade do material.
 */
const STOP_WORDS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'em',
  'com',
  'sem',
  'para',
  'p/',
  'c/',
  's/',
  'un',
  'und',
  'pc',
  'pç',
  'ref',
  'codigo',
  'cod',
])

export function getCleanTokens(text: string): string[] {
  const norm = normalizeDescription(text)
  return norm.split(' ').filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

/**
 * Coeficiente de Similaridade Dice / Jaccard baseado em n-gramas (bigramas) e tokens.
 * Retorna valor entre 0 e 1.
 */
export function calculateTextSimilarity(strA: string, strB: string): number {
  const normA = normalizeDescription(strA)
  const normB = normalizeDescription(strB)

  if (!normA || !normB) return 0
  if (normA === normB) return 1

  // 1. Jaccard por tokens completos
  const tokensA = new Set(getCleanTokens(strA))
  const tokensB = new Set(getCleanTokens(strB))

  if (tokensA.size > 0 && tokensB.size > 0) {
    let tokenInter = 0
    tokensA.forEach((t) => {
      if (tokensB.has(t)) tokenInter++
    })
    const tokenUnion = new Set([...tokensA, ...tokensB]).size
    const tokenJaccard = tokenUnion > 0 ? tokenInter / tokenUnion : 0
    if (tokenJaccard > 0.85) {
      return tokenJaccard
    }
  }

  // 2. Bigramas de caracteres para similaridade difusa
  const getBigrams = (s: string) => {
    const bigrams = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) {
      bigrams.add(s.substring(i, i + 2))
    }
    return bigrams
  }

  const bigramsA = getBigrams(normA)
  const bigramsB = getBigrams(normB)

  if (bigramsA.size === 0 || bigramsB.size === 0) return 0

  let bigramInter = 0
  bigramsA.forEach((bg) => {
    if (bigramsB.has(bg)) bigramInter++
  })

  // Sørensen–Dice
  const dice = (2 * bigramInter) / (bigramsA.size + bigramsB.size)
  return dice
}

/**
 * Extrai possíveis códigos próprios embutidos na descrição de um registro.
 * Exemplo: "05100188 bucha de nylon..." -> retorna "05100188"
 */
export function extractEmbeddedCodes(description: string): string[] {
  if (!description) return []
  // Procura códigos numéricos ou alfanuméricos com 5 a 12 dígitos no início ou demarcados
  const matches: string[] = []

  // Regex 1: Início de linha com número ou código estilo ERP (ex: 05100188, 14020031MBR, 05310222)
  const prefixMatch = description.match(/^([0-9]{5,10}[A-Za-z0-9]*)/)
  if (prefixMatch && prefixMatch[1]) {
    matches.push(prefixMatch[1].trim())
  }

  // Regex 2: Padrões isolados no meio como "REF. 7500" ou "REF 4110P"
  const refMatch = description.match(/\b(?:REF\.?|CÓD\.?|COD\.?)\s*([A-Za-z0-9-]{4,12})\b/i)
  if (refMatch && refMatch[1]) {
    matches.push(refMatch[1].trim())
  }

  return Array.from(new Set(matches))
}

/**
 * Resolve o rótulo de origem para exibição amigável.
 */
export function resolveSourceLabel(
  source?: string,
  hasInventory?: boolean,
): 'Estoque' | 'Catálogo' | 'Histórico' | 'Manual' {
  if (source === 'catalog') return 'Catálogo'
  if (source === 'inventory' || hasInventory) return 'Estoque'
  if (source === 'imported') return 'Histórico'
  return 'Manual'
}

/**
 * Algoritmo principal de detecção de possíveis duplicatas no cadastro mestre.
 * NUNCA altera nada — agrupamento visual puro.
 */
export function detectDuplicateGroups(
  components: MasterComponent[],
  inventoryList: Inventory[],
): DuplicateGroup[] {
  // Mapear inventário por component_id e por code/description
  const invByCompId = new Map<string, Inventory>()
  const invByCode = new Map<string, Inventory>()
  const invByDesc = new Map<string, Inventory>()

  inventoryList.forEach((inv) => {
    if (inv.component_id) invByCompId.set(inv.component_id, inv)
    if (inv.code) invByCode.set(inv.code.toLowerCase().trim(), inv)
    if (inv.description) invByDesc.set(inv.description.toLowerCase().trim(), inv)
  })

  // Criar meta para cada componente
  const metaList: DuplicateItemMeta[] = components.map((comp) => {
    const inv =
      invByCompId.get(comp.id) ||
      (comp.code ? invByCode.get(comp.code.toLowerCase().trim()) : undefined) ||
      invByDesc.get(comp.description.toLowerCase().trim())

    return {
      component: comp,
      inventoryItem: inv,
      stockQuantity: inv ? Number(inv.quantity) || 0 : 0,
      unit: comp.unit || inv?.unit || 'un',
      sourceLabel: resolveSourceLabel(comp.source, !!inv),
      isInactive: comp.active === false,
    }
  })

  const groups: DuplicateGroup[] = []
  // Conjunto de pares já agrupados para não criar grupos redundantes
  const pairedKeys = new Set<string>()

  const makePairKey = (id1: string, id2: string) => {
    return [id1, id2].sort().join(':::')
  }

  // =========================================================================
  // REGRA A: Mesmo código em registros diferentes (code idêntico, excluindo vazios)
  // =========================================================================
  const byCode = new Map<string, DuplicateItemMeta[]>()
  metaList.forEach((item) => {
    const code = (item.component.code || '').trim().toUpperCase()
    // Códigos genéricos como REF-XXXXX automáticos também se repetirem contam, mas principalmente códigos reais
    if (code) {
      const list = byCode.get(code) || []
      list.push(item)
      byCode.set(code, list)
    }
  })

  byCode.forEach((items, code) => {
    if (items.length > 1) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          pairedKeys.add(makePairKey(items[i].component.id, items[j].component.id))
        }
      }
      groups.push({
        id: `code_${code}_${items[0].component.id}`,
        reason: 'code_match',
        reasonLabel: 'Mesmo Código',
        reasonDetail: `Código idêntico "${code}" compartilhado por ${items.length} itens`,
        similarityScore: 100,
        items,
      })
    }
  })

  // =========================================================================
  // REGRA C: Código próprio embutido na descrição de registro cujo código é REF-XXXXX
  // Exemplo: Registro com código "REF-3WXB4J" e descrição "05100188 bucha de nylon..."
  // quando já existe um item com código "05100188", ou outro item com "05100188" na descrição.
  // =========================================================================
  // Mapeamento de códigos de todos os itens (código direto)
  const codeToItem = new Map<string, DuplicateItemMeta[]>()
  metaList.forEach((item) => {
    const c = (item.component.code || '').trim().toLowerCase()
    if (c) {
      const arr = codeToItem.get(c) || []
      arr.push(item)
      codeToItem.set(c, arr)
    }
  })

  metaList.forEach((item) => {
    const compCode = (item.component.code || '').trim().toUpperCase()
    // Itens com prefixo REF-
    if (compCode.startsWith('REF-')) {
      const embedded = extractEmbeddedCodes(item.component.description || '')
      for (const emb of embedded) {
        const embNorm = emb.toLowerCase()
        const matchingDirect = codeToItem.get(embNorm) || []

        // Também procurar outros itens com esse mesmo código embutido
        const matchingOtherEmbedded = metaList.filter(
          (other) =>
            other.component.id !== item.component.id &&
            extractEmbeddedCodes(other.component.description || '').some(
              (oEmb) => oEmb.toLowerCase() === embNorm,
            ),
        )

        const allMatched = Array.from(
          new Map(
            [item, ...matchingDirect, ...matchingOtherEmbedded].map((it) => [it.component.id, it]),
          ).values(),
        )

        if (allMatched.length > 1) {
          // Checar se par já foi inserido
          let isNew = false
          for (let i = 0; i < allMatched.length; i++) {
            for (let j = i + 1; j < allMatched.length; j++) {
              const pair = makePairKey(allMatched[i].component.id, allMatched[j].component.id)
              if (!pairedKeys.has(pair)) {
                isNew = true
                pairedKeys.add(pair)
              }
            }
          }

          if (isNew) {
            groups.push({
              id: `embedded_${emb}_${item.component.id}`,
              reason: 'embedded_code',
              reasonLabel: 'Código Embutido na Descrição',
              reasonDetail: `Código "${emb}" detectado na descrição de item provisório (${compCode})`,
              similarityScore: 95,
              items: allMatched,
            })
          }
        }
      }
    }
  })

  // =========================================================================
  // REGRA B: Descrições praticamente idênticas (normalizada, score >= 80%)
  // =========================================================================
  // Para performance O(n^2) em até ~2000 itens:
  // Agrupamos por prefixo ou token chave para podar comparações desnecessárias.
  const tokenBuckets = new Map<string, DuplicateItemMeta[]>()
  metaList.forEach((meta) => {
    const tokens = getCleanTokens(meta.component.description || '')
    // Usar os 2 primeiros tokens significativos como baldes
    tokens.slice(0, 3).forEach((token) => {
      const list = tokenBuckets.get(token) || []
      list.push(meta)
      tokenBuckets.set(token, list)
    })
  })

  const evaluatedPairs = new Set<string>()

  tokenBuckets.forEach((bucket) => {
    if (bucket.length < 2 || bucket.length > 200) return // pula baldes gigantescos ou únicos
    for (let i = 0; i < bucket.length; i++) {
      const itemA = bucket[i]
      for (let j = i + 1; j < bucket.length; j++) {
        const itemB = bucket[j]
        const pair = makePairKey(itemA.component.id, itemB.component.id)
        if (evaluatedPairs.has(pair)) continue
        evaluatedPairs.add(pair)

        if (pairedKeys.has(pair)) continue

        const descA = itemA.component.description || ''
        const descB = itemB.component.description || ''

        const score = calculateTextSimilarity(descA, descB)
        // Score threshold: 80% (0.80)
        if (score >= 0.8) {
          pairedKeys.add(pair)
          groups.push({
            id: `sim_${itemA.component.id}_${itemB.component.id}`,
            reason: 'description_similarity',
            reasonLabel: 'Descrição Similar',
            reasonDetail: `Descrições altamente similares (${Math.round(score * 100)}% de correspondência)`,
            similarityScore: Math.round(score * 100),
            items: [itemA, itemB],
          })
        }
      }
    }
  })

  // Ordenar grupos: primeiro por score de similaridade decrescente, depois por quantidade de itens
  return groups.sort((a, b) => {
    const scoreDiff = (b.similarityScore || 0) - (a.similarityScore || 0)
    if (scoreDiff !== 0) return scoreDiff
    return b.items.length - a.items.length
  })
}
