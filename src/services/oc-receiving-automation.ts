import pb from '@/lib/pocketbase/client'
import { OrdemCompra, OrdemCompraItem, MaterialShortage } from '@/types'
import { updateOrdemCompraStatus } from '@/services/ordens-compra'
import { toast as sonnerToast } from 'sonner'

export interface CheckAndUpdateOcsResult {
  updatedOcNumbers: string[]
  updatedOcIds: string[]
}

/**
 * Para uma lista de IDs de material_shortages que tiveram recebimento realizado:
 * 1. Busca em 'ordem_compra_itens' todos os itens vinculados a estes material_shortages.
 * 2. Identifica as Ordens de Compra (OCs) afetadas que ainda NÃO estejam como 'Recebida' ou 'Cancelada'.
 * 3. Para cada OC afetada, carrega TODOS os seus itens (ordem_compra_itens).
 * 4. Para cada item da OC:
 *    - Se possuir material_shortage_id vinculado, busca o shortage correspondente e verifica:
 *      shortage.received_quantity >= shortage.quantity (com quantity > 0)
 *    - Se NÃO possuir material_shortage_id vinculado ou se o shortage não foi encontrado,
 *      trata como não totalmente recebido via solicitações (portanto não fecha automaticamente).
 * 5. Se TODOS os itens daquela OC estiverem totalmente recebidos:
 *    - Atualiza o status da OC para 'Recebida' (updateOrdemCompraStatus(oc.id, 'Recebida'))
 *    - Emite o toast: 'OC Nº X marcada como Recebida automaticamente' (via sonner e fallback toast customizado)
 * 6. Se qualquer item da OC for parcial ou pendente, a OC NÃO tem seu status alterado para 'Recebida'.
 */
export async function checkAndUpdateAffectedOcs(
  affectedShortageIds: string[],
  options?: {
    customToast?: (opts: { title: string; description: string }) => void
  },
): Promise<CheckAndUpdateOcsResult> {
  const result: CheckAndUpdateOcsResult = {
    updatedOcNumbers: [],
    updatedOcIds: [],
  }

  const uniqueShortageIds = Array.from(new Set(affectedShortageIds.filter(Boolean)))
  if (uniqueShortageIds.length === 0) return result

  try {
    // 1. Buscar os itens de OC vinculados aos shortageIds afetados
    // Criamos filtro por chunks se houver muitos ids
    const filterParts = uniqueShortageIds.map((id) => `material_shortage_id = "${id}"`)
    const itemsFilter = filterParts.join(' || ')

    const linkedItems = await pb.collection('ordem_compra_itens').getFullList<OrdemCompraItem>({
      filter: `(${itemsFilter})`,
      fields: 'id,oc_id,material_shortage_id',
    })

    const ocIds = Array.from(new Set(linkedItems.map((it) => it.oc_id).filter(Boolean)))
    if (ocIds.length === 0) return result

    for (const ocId of ocIds) {
      // Carregar a OC atual
      const oc = await pb
        .collection('ordens_de_compra')
        .getOne<OrdemCompra>(ocId)
        .catch(() => null)
      if (!oc) continue

      // Se já está Recebida ou Cancelada, ignorar
      if (oc.status === 'Recebida' || oc.status === 'Cancelada') continue

      // Buscar todos os itens desta OC
      const allOcItems = await pb.collection('ordem_compra_itens').getFullList<OrdemCompraItem>({
        filter: `oc_id = "${ocId}"`,
      })

      if (allOcItems.length === 0) continue

      // Para verificar se todos estão recebidos, precisamos do estado atual dos material_shortages
      const ocShortageIds = Array.from(
        new Set(
          allOcItems
            .map((it) => it.material_shortage_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
      )

      // Se nem todos os itens da OC possuem material_shortage_id, a OC tem itens sem rastreio de solicitação
      if (ocShortageIds.length < allOcItems.length) {
        continue
      }

      // Buscar os material_shortages atualizados
      const sFilter = ocShortageIds.map((id) => `id = "${id}"`).join(' || ')
      const shortageRecords = await pb
        .collection('material_shortages')
        .getFullList<MaterialShortage>({
          filter: `(${sFilter})`,
          fields: 'id,quantity,received_quantity,status',
        })

      const shortageMap = new Map<string, MaterialShortage>()
      for (const s of shortageRecords) {
        shortageMap.set(s.id, s)
      }

      // Verificar se TODOS os itens da OC estão totalmente recebidos
      // (received_quantity >= quantity, com quantity > 0)
      let allItemsFullyReceived = true
      for (const ocItem of allOcItems) {
        if (!ocItem.material_shortage_id) {
          allItemsFullyReceived = false
          break
        }
        const s = shortageMap.get(ocItem.material_shortage_id)
        if (!s) {
          allItemsFullyReceived = false
          break
        }

        const totalQty = Number(s.quantity) || 0
        const recQty = Number(s.received_quantity) || 0

        // Regra do prompt: received_quantity >= quantity
        if (totalQty <= 0 || recQty < totalQty) {
          allItemsFullyReceived = false
          break
        }
      }

      if (allItemsFullyReceived) {
        await updateOrdemCompraStatus(oc.id, 'Recebida')
        result.updatedOcIds.push(oc.id)
        const ocDisplay = oc.oc_number || oc.id
        result.updatedOcNumbers.push(ocDisplay)

        const msg = `OC Nº ${ocDisplay} marcada como Recebida automaticamente`
        sonnerToast.success(msg)
        if (options?.customToast) {
          options.customToast({
            title: 'Ordem de Compra Recebida',
            description: msg,
          })
        }
      }
    }
  } catch (err) {
    console.error('Erro ao verificar e atualizar status das OCs afetadas:', err)
  }

  return result
}
