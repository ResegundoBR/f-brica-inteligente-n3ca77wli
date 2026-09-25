import pb from '@/lib/pocketbase/client'
import { normalizeCode } from './material-reservations'

export interface PcpMaterialMinLevel {
  id: string
  material_code: string
  material_description?: string
  min_level: number
  updated_by?: string
  created: string
  updated: string
  expand?: {
    updated_by?: {
      id: string
      name?: string
      email?: string
    }
  }
}

/**
 * Busca todos os níveis mínimos cadastrados
 */
export async function getMaterialMinLevels(): Promise<PcpMaterialMinLevel[]> {
  try {
    // 1. Busca componentes e inventário com min_quantity definido (> 0)
    const [comps, invs, legacyLevels] = await Promise.all([
      pb
        .collection('components')
        .getFullList<any>({
          filter: 'min_quantity > 0',
          sort: 'code',
        })
        .catch(() => []),
      pb
        .collection('inventory')
        .getFullList<any>({
          filter: 'min_quantity > 0',
          sort: 'code',
        })
        .catch(() => []),
      pb
        .collection('pcp_material_min_levels')
        .getFullList<PcpMaterialMinLevel>({
          sort: 'material_code',
          expand: 'updated_by',
        })
        .catch(() => []),
    ])

    const resultMap = new Map<string, PcpMaterialMinLevel>()

    // Unifica legacyLevels primeiro
    for (const lvl of legacyLevels) {
      const code = (lvl.material_code || '').trim()
      const norm = normalizeCode(code)
      if (norm && Number(lvl.min_level) > 0) {
        resultMap.set(norm, {
          id: lvl.id,
          material_code: code,
          material_description: lvl.material_description || '',
          min_level: Number(lvl.min_level) || 0,
          updated_by: lvl.updated_by,
          created: lvl.created,
          updated: lvl.updated,
          expand: lvl.expand,
        })
      }
    }

    // Sobrepõe ou complementa com inventory
    for (const inv of invs) {
      const code = (inv.code || '').trim()
      const norm = normalizeCode(code)
      const minVal = Number(inv.min_quantity) || 0
      if (norm && minVal > 0) {
        const existing = resultMap.get(norm)
        resultMap.set(norm, {
          id: existing?.id || inv.id,
          material_code: code || existing?.material_code || '',
          material_description: inv.description || existing?.material_description || '',
          min_level: minVal,
          updated_by: existing?.updated_by,
          created: existing?.created || inv.created,
          updated: inv.updated || existing?.updated || '',
          expand: existing?.expand,
        })
      }
    }

    // Sobrepõe ou complementa com components
    for (const comp of comps) {
      const code = (comp.code || '').trim()
      const norm = normalizeCode(code)
      const minVal = Number(comp.min_quantity) || 0
      if (norm && minVal > 0) {
        const existing = resultMap.get(norm)
        resultMap.set(norm, {
          id: existing?.id || comp.id,
          material_code: code || existing?.material_code || '',
          material_description: comp.description || existing?.material_description || '',
          min_level: minVal,
          updated_by: existing?.updated_by,
          created: existing?.created || comp.created,
          updated: comp.updated || existing?.updated || '',
          expand: existing?.expand,
        })
      }
    }

    return Array.from(resultMap.values()).sort((a, b) =>
      a.material_code.localeCompare(b.material_code),
    )
  } catch (err) {
    console.error('Erro ao buscar níveis mínimos de materiais:', err)
    return []
  }
}

/**
 * Retorna um Map indexado pelo código normalizado com o registro de nível mínimo
 */
export async function getMaterialMinLevelsMap(): Promise<Map<string, PcpMaterialMinLevel>> {
  const list = await getMaterialMinLevels()
  const map = new Map<string, PcpMaterialMinLevel>()
  for (const item of list) {
    const norm = normalizeCode(item.material_code)
    if (norm) {
      map.set(norm, item)
    }
  }
  return map
}

/**
 * Define ou atualiza o nível mínimo de um componente (upsert por código)
 */
export async function setMaterialMinLevel(input: {
  code: string
  description?: string
  min_level: number
}): Promise<PcpMaterialMinLevel> {
  const norm = normalizeCode(input.code)
  if (!norm) {
    throw new Error('Código do material é obrigatório.')
  }

  const currentUserId = pb.authStore.record?.id

  // Procurar registro existente
  let existingId: string | null = null
  try {
    const records = await pb
      .collection('pcp_material_min_levels')
      .getFullList<PcpMaterialMinLevel>({
        filter: `material_code = "${input.code.trim()}"`,
        limit: 1,
      })
    if (records.length > 0) {
      existingId = records[0].id
    }
  } catch {
    // ignorar erro
  }

  const payload: Record<string, unknown> = {
    material_code: input.code.trim(),
    min_level: Math.max(0, Number(input.min_level) || 0),
    updated_by: currentUserId || null,
  }
  if (input.description?.trim()) {
    payload.material_description = input.description.trim()
  }

  let savedRecord: PcpMaterialMinLevel
  if (existingId) {
    savedRecord = await pb
      .collection('pcp_material_min_levels')
      .update<PcpMaterialMinLevel>(existingId, payload, { expand: 'updated_by' })
  } else {
    savedRecord = await pb
      .collection('pcp_material_min_levels')
      .create<PcpMaterialMinLevel>(payload, { expand: 'updated_by' })
  }

  // Sincroniza diretamente no cadastro do componente e estoque para consistência imediata
  try {
    const cleanCode = input.code.trim().replace(/["'\\]/g, '')
    const [matchingComps, matchingInvs] = await Promise.all([
      pb
        .collection('components')
        .getFullList<any>({
          filter: `code = "${cleanCode}"`,
        })
        .catch(() => []),
      pb
        .collection('inventory')
        .getFullList<any>({
          filter: `code = "${cleanCode}"`,
        })
        .catch(() => []),
    ])

    for (const comp of matchingComps) {
      await pb
        .collection('components')
        .update(comp.id, {
          min_quantity: Math.max(0, Number(input.min_level) || 0),
        })
        .catch(() => {})
    }

    for (const inv of matchingInvs) {
      await pb
        .collection('inventory')
        .update(inv.id, {
          min_quantity: Math.max(0, Number(input.min_level) || 0),
        })
        .catch(() => {})
    }
  } catch {
    /* intentionally ignored */
  }

  return savedRecord
}

export interface MaterialMinLevelAlertItem {
  code: string
  description: string
  totalStock: number
  reservedStock: number
  availableStock: number
  minLevel: number
  difference: number // minLevel - availableStock (quanto falta para atingir o mínimo)
  unit: string
  minLevelRecordId?: string
}

/**
 * Calcula a lista de alertas de estoque mínimo:
 * itens cujo DISPONÍVEL (total - reservado) está estritamente ABAIXO do nível mínimo cadastrado.
 * disponível < minLevel => difference = minLevel - disponível
 * Itens com disponível >= minLevel NÃO aparecem.
 */
export function calculateMinLevelAlerts(
  minLevels: PcpMaterialMinLevel[],
  stockAvailabilityMap: Map<
    string,
    { totalStock: number; reservedStock: number; availableStock: number; unit?: string }
  >,
): MaterialMinLevelAlertItem[] {
  const alerts: MaterialMinLevelAlertItem[] = []

  for (const item of minLevels) {
    const norm = normalizeCode(item.material_code)
    if (!norm) continue

    const stock = stockAvailabilityMap.get(norm)
    const totalStock = stock?.totalStock ?? 0
    const reservedStock = stock?.reservedStock ?? 0
    const availableStock = stock?.availableStock ?? Math.max(0, totalStock - reservedStock)
    const unit = stock?.unit || 'un'
    const minLevel = Number(item.min_level) || 0

    // Regra: DISPONÍVEL < NÍVEL MÍNIMO
    if (availableStock < minLevel) {
      alerts.push({
        code: item.material_code,
        description: item.material_description || '',
        totalStock,
        reservedStock,
        availableStock,
        minLevel,
        difference: minLevel - availableStock,
        unit,
        minLevelRecordId: item.id,
      })
    }
  }

  // Ordenar pelo maior déficit primeiro
  return alerts.sort((a, b) => b.difference - a.difference)
}
