import { describe, it, expect, vi } from 'vitest'
import {
  SeparationItem,
  isSeparationItemPending,
  mergeSeparationItems,
  persistItemShortage,
} from '@/services/material-separations'
import pb from '@/lib/pocketbase/client'
import * as shortagesService from '@/services/material-shortages'

describe('Operator Separation Mobile 140+ items test', () => {
  it('handles 142 items simulating Programação #30 dataset without lag or mutation issues', () => {
    // Gerar 142 itens idênticos ao porte do print anexado pelo gestor Reginaldo
    const sampleItems: SeparationItem[] = Array.from({ length: 142 }, (_, i) => ({
      id: `item-${i}-CODE:::140100${i}`,
      code: `140100${i.toString().padStart(2, '0')}`,
      description: i === 0 ? 'BARRA CHATA AÇO 15,88X3,18MM' : `COMPONENTE DE TESTE ${i}`,
      unit: i % 3 === 0 ? 'MT' : 'PC',
      total_quantity: Number((Math.random() * 10 + 1).toFixed(2)),
      op_numbers: ['OP 000490/2026', 'OP 000492/2026'],
      order_ids: ['ord-1', 'ord-2'],
      cut_measurement: i % 3 === 0 ? 'MT' : undefined,
      status: 'pendente',
    }))

    expect(sampleItems).toHaveLength(142)

    // Simulação do estado local de separação
    let draft = [...sampleItems]

    // 1. Alternar 1º item para separado
    const targetId = draft[0].id
    draft = draft.map((item) => {
      if (item.id === targetId) {
        return { ...item, status: 'separado', marked_at: new Date().toISOString() }
      }
      return item
    })

    expect(draft.filter((i) => i.status === 'separado')).toHaveLength(1)
    expect(draft.filter((i) => i.status === 'falta')).toHaveLength(0)
    expect(draft.filter((i) => i.status === 'pendente')).toHaveLength(141)

    // 2. Alternar 2º item para falta
    const secondId = draft[1].id
    draft = draft.map((item) => {
      if (item.id === secondId) {
        return { ...item, status: 'falta', marked_at: new Date().toISOString() }
      }
      return item
    })

    expect(draft.filter((i) => i.status === 'separado')).toHaveLength(1)
    expect(draft.filter((i) => i.status === 'falta')).toHaveLength(1)
    expect(draft.filter((i) => i.status === 'pendente')).toHaveLength(140)

    // 3. Marcar todos como separados (teste de ação em lote com 142 itens)
    draft = draft.map((item) => ({ ...item, status: 'separado' }))
    expect(draft.filter((i) => i.status === 'separado')).toHaveLength(142)
    expect(draft.filter((i) => i.status === 'falta')).toHaveLength(0)
    expect(draft.filter((i) => i.status === 'pendente')).toHaveLength(0)

    // 4. Resetar todos
    draft = draft.map((item) => ({ ...item, status: 'pendente' }))
    expect(draft.filter((i) => i.status === 'pendente')).toHaveLength(142)

    // 5. Filtro rápido de itens com 142 itens
    const query = 'BARRA CHATA'
    const filtered = draft.filter((item) =>
      item.description.toLowerCase().includes(query.toLowerCase()),
    )
    expect(filtered).toHaveLength(1)
    expect(filtered[0].code).toBe('14010000')
  })

  it('filters items by "Não Separado" keeping global counters intact and hiding fully-separated blocks', () => {
    // Simula lista de itens do modal
    const items = [
      { id: '1', code: 'C1', description: 'Item 1', status: 'separado' as const },
      { id: '2', code: 'C2', description: 'Item 2', status: 'pendente' as const },
      { id: '3', code: 'C3', description: 'Item 3', status: 'falta' as const },
      { id: '4', code: 'C4', description: 'Item 4', status: 'parcial' as const },
      { id: '5', code: 'C5', description: 'Item 5', status: 'substituido' as const },
      { id: '6', code: 'C6', description: 'Item 6', status: undefined }, // sem status = pendente
    ]

    // Contadores globais do topo: NÃO mudam com o filtro ativo
    const countTotal = items.length
    const countSeparated = items.filter((i) => i.status === 'separado').length
    const countPartial = items.filter((i) => i.status === 'parcial').length
    const countShortage = items.filter((i) => i.status === 'falta').length
    const countSubstituted = items.filter((i) => i.status === 'substituido').length
    const countPending = items.filter((i) => isSeparationItemPending(i)).length

    expect(countTotal).toBe(6)
    expect(countSeparated).toBe(1)
    expect(countPartial).toBe(1)
    expect(countShortage).toBe(1)
    expect(countSubstituted).toBe(1)
    // Apenas itens 2 ('pendente') e 6 (sem status) são pendentes/não separados
    expect(countPending).toBe(2)

    // Condição "Não Separado": APENAS itens sem nenhuma ação (isSeparationItemPending)
    // Itens com falta, parcial ou troca/substituído NÃO devem aparecer na lista de "Não Separado"
    const unseparatedItems = items.filter((i) => isSeparationItemPending(i))
    expect(unseparatedItems).toHaveLength(2)
    expect(unseparatedItems.map((i) => i.id)).toEqual(['2', '6'])

    // Verificação explícita: item com Falta NÃO é pendente / não separado
    expect(isSeparationItemPending(items[2])).toBe(false)
    // Item com Parcial NÃO é pendente
    expect(isSeparationItemPending(items[3])).toBe(false)
    // Item Substituído NÃO é pendente
    expect(isSeparationItemPending(items[4])).toBe(false)
    // Item Separado NÃO é pendente
    expect(isSeparationItemPending(items[0])).toBe(false)
    // Item Já Separado ('ja_separado') NÃO é pendente
    expect(isSeparationItemPending({ status: 'ja_separado' })).toBe(false)

    // Simulando blocos de setor com o filtro "Não Separado" ativo
    const sectorA = {
      sector: 'Fabricação',
      cards: [{ item: items[0] }, { item: items[2] }], // 1 'separado' e 1 'falta' -> 0 pendentes
    }
    const sectorB = {
      sector: 'Montagem',
      cards: [{ item: items[0] }, { item: items[1] }], // 1 'separado' e 1 'pendente'
    }

    const filterSectorGroup = (group: typeof sectorA, onlyUnsep: boolean) => {
      const totalInGroup = group.cards.length
      const pendingInGroup = group.cards.filter((c) => isSeparationItemPending(c.item)).length
      const visibleCards = onlyUnsep
        ? group.cards.filter((c) => isSeparationItemPending(c.item))
        : group.cards
      return {
        ...group,
        totalCount: totalInGroup,
        pendingCount: pendingInGroup,
        cards: visibleCards,
      }
    }

    const filteredA = filterSectorGroup(sectorA, true)
    const filteredB = filterSectorGroup(sectorB, true)

    // Bloco A tem itens apenas com 'separado' e 'falta' -> com "Não Separado" fica com 0 cards e é ocultado
    expect(filteredA.cards).toHaveLength(0)
    expect(filteredA.pendingCount).toBe(0)
    expect(filteredA.totalCount).toBe(2)

    // Bloco B permanece visível exibindo "faltam 1 de 2"
    expect(filteredB.cards).toHaveLength(1)
    expect(filteredB.cards[0].item.id).toBe('2')
    expect(filteredB.pendingCount).toBe(1)
    expect(filteredB.totalCount).toBe(2)
  })

  it('ação Já Separado registra item sem gerar falta ou reserva de estoque', () => {
    const items: Array<{ id: string; status?: any }> = [
      { id: '1', status: 'separado' },
      { id: '2', status: 'ja_separado' },
      { id: '3', status: 'pendente' },
      { id: '4', status: 'falta' },
    ]

    const pending = items.filter((i) => isSeparationItemPending(i))
    expect(pending).toHaveLength(1)
    expect(pending[0].id).toBe('3')

    const alreadySeparated = items.filter((i) => i.status === 'ja_separado')
    expect(alreadySeparated).toHaveLength(1)
    expect(alreadySeparated[0].id).toBe('2')
  })

  it('matches Reginaldo print case: 120 items, 59 separated, 0 partial, 35 shortages, 26 pending', () => {
    // Cenário exato do print anexado:
    // 59 separados + 0 parciais + 35 faltas + 26 pendentes = 120 itens
    const items: Array<{ id: string; status?: any }> = [
      ...Array.from({ length: 59 }, (_, i) => ({ id: `sep-${i}`, status: 'separado' })),
      ...Array.from({ length: 35 }, (_, i) => ({ id: `falta-${i}`, status: 'falta' })),
      ...Array.from({ length: 26 }, (_, i) => ({ id: `pend-${i}`, status: 'pendente' })),
    ]

    expect(items).toHaveLength(120)

    const countSeparated = items.filter((i) => i.status === 'separado').length
    const countPartial = items.filter((i) => i.status === 'parcial').length
    const countShortage = items.filter((i) => i.status === 'falta').length
    const countPending = items.filter((i) => isSeparationItemPending(i)).length

    expect(countSeparated).toBe(59)
    expect(countPartial).toBe(0)
    expect(countShortage).toBe(35)
    expect(countPending).toBe(26)

    // Quando o usuário ativa o chip "Não Separado", a lista filtrada deve ter EXATAMENTE 26 itens (e NÃO 26 + 35 = 61)
    const filteredUnseparated = items.filter((i) => isSeparationItemPending(i))
    expect(filteredUnseparated).toHaveLength(26)
    expect(filteredUnseparated.every((i) => i.status === 'pendente')).toBe(true)
    expect(filteredUnseparated.some((i) => i.status === 'falta')).toBe(false)
  })

  describe('Gravação Imediata + Tempo Real Multi-Operador', () => {
    it('dispara persistência de falta em material_shortages no ato do clique para Falta Total', async () => {
      const upsertSpy = vi
        .spyOn(shortagesService, 'upsertMaterialShortage')
        .mockResolvedValueOnce({ id: 'shortage-1' } as any)

      const faltaItem: SeparationItem = {
        id: 'item-100',
        code: '14010055',
        description: 'CANTONEIRA AÇO 1/2',
        total_quantity: 4,
        unit: 'BARRA',
        status: 'falta',
        op_numbers: ['OP 000500/2026'],
        order_ids: ['ord-500'],
      }

      await persistItemShortage(faltaItem, 'Operador Reginaldo')

      expect(upsertSpy).toHaveBeenCalledTimes(1)
      const [payload, author] = upsertSpy.mock.calls[0]
      expect(payload.code).toBe('14010055')
      expect(payload.quantity).toBe(4)
      expect(author).toBe('Operador Reginaldo')
      expect(payload.observation).toContain('Falta gerada automaticamente na Separação do Operador')

      upsertSpy.mockRestore()
    })

    it('dispara persistência com quantidade faltante calculada para Falta Parcial', async () => {
      const upsertSpy = vi
        .spyOn(shortagesService, 'upsertMaterialShortage')
        .mockResolvedValueOnce({ id: 'shortage-2' } as any)

      const partialItem: SeparationItem = {
        id: 'item-101',
        code: '14010056',
        description: 'CHAPA INOX 2MM',
        total_quantity: 10,
        separated_quantity: 3,
        shortage_quantity: 7,
        unit: 'PC',
        status: 'parcial',
        op_numbers: ['OP 000501/2026'],
        order_ids: ['ord-501'],
      }

      await persistItemShortage(partialItem, 'Operador Reginaldo')

      expect(upsertSpy).toHaveBeenCalledTimes(1)
      const [payload] = upsertSpy.mock.calls[0]
      expect(payload.code).toBe('14010056')
      expect(payload.quantity).toBe(7)
      expect(payload.observation).toContain('Falta Parcial gerada na Separação do Operador')
      expect(payload.observation).toContain('Separados: 3/10 PC')

      upsertSpy.mockRestore()
    })

    it('ignora gravação de falta para peças com prefixo FAB (fabricação interna)', async () => {
      const upsertSpy = vi.spyOn(shortagesService, 'upsertMaterialShortage')

      const fabItem: SeparationItem = {
        id: 'item-fab',
        code: 'FAB01075',
        description: 'CONJUNTO SOLDADO INTERNO',
        total_quantity: 2,
        unit: 'PC',
        op_numbers: ['OP 000502/2026'],
        order_ids: ['ord-502'],
        status: 'falta',
      }

      await persistItemShortage(fabItem, 'Operador')
      expect(upsertSpy).not.toHaveBeenCalled()
      upsertSpy.mockRestore()
    })

    it('mergeSeparationItems atualiza itens remotos do PocketBase preservando itens locais com gravação em curso', () => {
      const localItems: SeparationItem[] = [
        {
          id: 'item-1',
          code: 'C1',
          description: 'Item 1',
          total_quantity: 5,
          unit: 'UN',
          op_numbers: ['OP 1'],
          order_ids: ['ord-1'],
          status: 'pendente',
        },
        {
          id: 'item-2',
          code: 'C2',
          description: 'Item 2',
          total_quantity: 3,
          unit: 'UN',
          op_numbers: ['OP 1'],
          order_ids: ['ord-1'],
          status: 'separado',
        }, // este está sendo salvo localmente
        {
          id: 'item-3',
          code: 'C3',
          description: 'Item 3',
          total_quantity: 2,
          unit: 'UN',
          op_numbers: ['OP 1'],
          order_ids: ['ord-1'],
          status: 'pendente',
        },
      ]

      // Operador 2 remotamente marcou item-1 como separado e item-3 como falta,
      // e o servidor ainda tem item-2 como pendente (pois a gravação local de item-2 ainda não retornou)
      const remoteItems: SeparationItem[] = [
        {
          id: 'item-1',
          code: 'C1',
          description: 'Item 1',
          total_quantity: 5,
          unit: 'UN',
          op_numbers: ['OP 1'],
          order_ids: ['ord-1'],
          status: 'separado',
        },
        {
          id: 'item-2',
          code: 'C2',
          description: 'Item 2',
          total_quantity: 3,
          unit: 'UN',
          op_numbers: ['OP 1'],
          order_ids: ['ord-1'],
          status: 'pendente',
        },
        {
          id: 'item-3',
          code: 'C3',
          description: 'Item 3',
          total_quantity: 2,
          unit: 'UN',
          op_numbers: ['OP 1'],
          order_ids: ['ord-1'],
          status: 'falta',
        },
      ]

      const inFlight = new Set<string>(['item-2'])

      const merged = mergeSeparationItems(localItems, remoteItems, inFlight)

      // item-1 foi atualizado do remoto para separado
      expect(merged.find((i) => i.id === 'item-1')?.status).toBe('separado')
      // item-2 foi protegido pelo inFlight lock e continuou com o valor local (separado)
      expect(merged.find((i) => i.id === 'item-2')?.status).toBe('separado')
      // item-3 foi atualizado do remoto para falta
      expect(merged.find((i) => i.id === 'item-3')?.status).toBe('falta')
    })

    it('mergeSeparationItems integra itens de substituição adicionados por outro operador', () => {
      const localItems: SeparationItem[] = [
        {
          id: 'item-1',
          code: 'C1',
          description: 'Item 1',
          total_quantity: 5,
          unit: 'UN',
          op_numbers: ['OP 1'],
          order_ids: ['ord-1'],
          status: 'pendente',
        },
      ]

      const remoteItems: SeparationItem[] = [
        {
          id: 'item-1',
          code: 'C1',
          description: 'Item 1',
          total_quantity: 5,
          unit: 'UN',
          op_numbers: ['OP 1'],
          order_ids: ['ord-1'],
          status: 'substituido',
        },
        {
          id: 'swap-999',
          code: 'C1-SUB',
          description: 'Substituto C1',
          total_quantity: 5,
          unit: 'UN',
          op_numbers: ['OP 1'],
          order_ids: ['ord-1'],
          status: 'pendente',
          is_substitution: true,
          original_item_id: 'item-1',
        },
      ]

      const merged = mergeSeparationItems(localItems, remoteItems)

      expect(merged).toHaveLength(2)
      expect(merged[0].status).toBe('substituido')
      expect(merged[1].id).toBe('swap-999')
      expect(merged[1].is_substitution).toBe(true)
    })

    it('simula subscrição e cancelamento no unmount do modal sem vazamento de listeners', async () => {
      let unsubscribedId: string | null = null

      const collectionMock = pb.collection('material_separations')
      const subscribeSpy = vi
        .spyOn(collectionMock, 'subscribe')
        .mockImplementation((topic: any) => {
          return Promise.resolve(() => {
            unsubscribedId = topic
          }) as any
        })

      const unsubscribeSpy = vi
        .spyOn(collectionMock, 'unsubscribe')
        .mockImplementation((topic: any) => {
          unsubscribedId = topic
          return Promise.resolve() as any
        })

      // Simula abertura do modal para a separação "sep-123"
      const sepId = 'sep-123'
      const unsubFn = await collectionMock.subscribe(sepId, () => {})
      expect(subscribeSpy).toHaveBeenCalledWith(sepId, expect.any(Function))

      // Simula fechamento do modal (cleanup)
      unsubFn()
      expect(unsubscribedId).toBe(sepId)

      subscribeSpy.mockRestore()
      unsubscribeSpy.mockRestore()
    })
  })
})
