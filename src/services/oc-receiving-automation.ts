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
    // 1. Identificar OCs candidatas a partir de shortages informados ou IDs de OC diretos
    // uniqueShortageIds pode conter IDs de material_shortages ou oc_id diretamente
    const filterParts = uniqueShortageIds.map(
      (id) => `material_shortage_id = "${id}" || oc_id = "${id}"`,
    )
    const itemsFilter = filterParts.join(' || ')

    const linkedItems = await pb.collection('ordem_compra_itens').getFullList<OrdemCompraItem>({
      filter: `(${itemsFilter})`,
      fields: 'id,oc_id,material_shortage_id',
    })

    const ocIdsFromShortages = linkedItems.map((it) => it.oc_id).filter(Boolean)
    // Também incluir os IDs que possam ser da própria ordens_de_compra
    const ocIds = Array.from(new Set([...ocIdsFromShortages, ...uniqueShortageIds]))
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

      // Buscar os material_shortages vinculados aos itens que os possuírem
      const ocShortageIds = Array.from(
        new Set(
          allOcItems
            .map((it) => it.material_shortage_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
      )

      const shortageMap = new Map<string, MaterialShortage>()
      if (ocShortageIds.length > 0) {
        const sFilter = ocShortageIds.map((id) => `id = "${id}"`).join(' || ')
        const shortageRecords = await pb
          .collection('material_shortages')
          .getFullList<MaterialShortage>({
            filter: `(${sFilter})`,
            fields: 'id,quantity,received_quantity,status',
          })
        for (const s of shortageRecords) {
          shortageMap.set(s.id, s)
        }
      }

      // Verificar se TODOS os itens da OC estão totalmente recebidos:
      // - Item com shortage: shortage.received_quantity >= shortage.quantity (ou ocItem.received_quantity >= ocItem.quantity)
      // - Item avulso (sem shortage): ocItem.received_quantity >= ocItem.quantity
      let allItemsFullyReceived = true
      for (const ocItem of allOcItems) {
        const ocItemTotal = Number(ocItem.quantity) || 0
        const ocItemDirectRcvd = Number(ocItem.received_quantity) || 0

        if (ocItem.material_shortage_id) {
          const s = shortageMap.get(ocItem.material_shortage_id)
          const shortageTotal = s ? Number(s.quantity) || 0 : 0
          const shortageRcvd = s ? Number(s.received_quantity) || 0 : 0
          const isShortageFullyReceived =
            shortageTotal > 0 && shortageRcvd >= shortageTotal - 0.0001
          const isItemFullyReceived = ocItemTotal > 0 && ocItemDirectRcvd >= ocItemTotal - 0.0001
          if (!isShortageFullyReceived && !isItemFullyReceived) {
            allItemsFullyReceived = false
            break
          }
        } else {
          // Item avulso sem shortage: verifica pelo received_quantity do item da OC
          if (ocItemTotal <= 0 || ocItemDirectRcvd < ocItemTotal - 0.0001) {
            allItemsFullyReceived = false
            break
          }
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
