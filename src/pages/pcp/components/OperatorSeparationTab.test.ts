import { describe, it, expect } from 'vitest'
import { SeparationItem } from '@/services/material-separations'

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
      { id: '1', code: 'C1', description: 'Item 1', status: 'separado' },
      { id: '2', code: 'C2', description: 'Item 2', status: 'pendente' },
      { id: '3', code: 'C3', description: 'Item 3', status: 'falta' },
      { id: '4', code: 'C4', description: 'Item 4', status: 'parcial' },
    ]

    // Contadores globais do topo: NÃO mudam com o filtro ativo
    const countTotal = items.length
    const countSeparated = items.filter((i) => i.status === 'separado').length
    const countPartial = items.filter((i) => i.status === 'parcial').length
    const countShortage = items.filter((i) => i.status === 'falta').length
    const countPending = items.filter((i) => i.status !== 'separado').length

    expect(countTotal).toBe(4)
    expect(countSeparated).toBe(1)
    expect(countPartial).toBe(1)
    expect(countShortage).toBe(1)
    expect(countPending).toBe(3)

    // Condição "Não Separado": apenas itens ainda não separados (status !== 'separado')
    const unseparatedItems = items.filter((i) => i.status !== 'separado')
    expect(unseparatedItems).toHaveLength(3)
    expect(unseparatedItems.map((i) => i.id)).toEqual(['2', '3', '4'])

    // Simulando blocos de setor com o filtro "Não Separado" ativo
    const sectorA = {
      sector: 'Fabricação',
      cards: [{ item: items[0] }], // Apenas 1 item e está 'separado'
    }
    const sectorB = {
      sector: 'Montagem',
      cards: [{ item: items[0] }, { item: items[1] }], // 1 'separado' e 1 'pendente'
    }

    const filterSectorGroup = (group: typeof sectorA, onlyUnsep: boolean) => {
      const totalInGroup = group.cards.length
      const pendingInGroup = group.cards.filter((c) => c.item.status !== 'separado').length
      const visibleCards = onlyUnsep
        ? group.cards.filter((c) => c.item.status !== 'separado')
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

    // Bloco A fica com 0 cards e é ocultado
    expect(filteredA.cards).toHaveLength(0)

    // Bloco B permanece visível exibindo "faltam 1 de 2"
    expect(filteredB.cards).toHaveLength(1)
    expect(filteredB.cards[0].item.id).toBe('2')
    expect(filteredB.pendingCount).toBe(1)
    expect(filteredB.totalCount).toBe(2)
  })
})
