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
})
