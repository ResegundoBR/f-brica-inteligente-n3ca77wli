import { describe, it, expect } from 'vitest'
import { calculateMinLevelAlerts, PcpMaterialMinLevel } from './material-min-levels'
import { getDeadlineUrgency } from '@/pages/pcp/suprimentos/components/ConsolidatedDemandBlock'
import { OtherOpDemandItem } from './material-consolidation'

describe('Melhoria 1: Cálculo de Déficit e Cobertura de Reservas por Programação', () => {
  it('deve calcular coberto quando o estoque disponível for maior ou igual ao total demandado pelas OPs', () => {
    const totalStock = 20
    const reservedStock = 5
    const availableStock = Math.max(0, totalStock - reservedStock) // 15
    const totalDemanded = 10 // OPs somadas necessitam de 10

    const isCovered = availableStock >= totalDemanded
    const deficit = Math.max(0, totalDemanded - availableStock)
    const surplus = Math.max(0, availableStock - totalDemanded)

    expect(availableStock).toBe(15)
    expect(isCovered).toBe(true)
    expect(deficit).toBe(0)
    expect(surplus).toBe(5)
  })

  it('deve calcular déficit (necessidade de compra) quando o disponível for inferior à demanda das OPs', () => {
    const totalStock = 12
    const reservedStock = 8
    const availableStock = Math.max(0, totalStock - reservedStock) // 4
    const totalDemanded = 14 // OPs somadas necessitam de 14

    const isCovered = availableStock >= totalDemanded
    const deficit = Math.max(0, totalDemanded - availableStock)
    const surplus = Math.max(0, availableStock - totalDemanded)

    expect(availableStock).toBe(4)
    expect(isCovered).toBe(false)
    expect(deficit).toBe(10) // 14 - 4 = 10 a comprar
    expect(surplus).toBe(0)
  })

  it('deve calcular déficit total quando o disponível for zero (esgotado ou tudo reservado)', () => {
    const totalStock = 5
    const reservedStock = 5
    const availableStock = Math.max(0, totalStock - reservedStock) // 0
    const totalDemanded = 7

    const isCovered = availableStock >= totalDemanded
    const deficit = Math.max(0, totalDemanded - availableStock)

    expect(availableStock).toBe(0)
    expect(isCovered).toBe(false)
    expect(deficit).toBe(7)
  })
})

describe('Melhoria 2: Destaques de Vencimento e Ordenação no ConsolidatedDemandBlock', () => {
  const baseDate = new Date('2026-10-01T12:00:00.000Z')

  it('deve classificar como urgente (vermelho) datas em até 7 dias da data de referência', () => {
    // 2 dias no futuro
    expect(getDeadlineUrgency('2026-10-03T00:00:00.000Z', baseDate)).toBe('urgent')
    // Exatamente 7 dias no futuro
    expect(getDeadlineUrgency('2026-10-08T00:00:00.000Z', baseDate)).toBe('urgent')
    // Vencida (passado)
    expect(getDeadlineUrgency('2026-09-28T00:00:00.000Z', baseDate)).toBe('urgent')
  })

  it('deve classificar como warning (âmbar) datas entre 8 e 14 dias', () => {
    // 8 dias no futuro
    expect(getDeadlineUrgency('2026-10-09T00:00:00.000Z', baseDate)).toBe('warning')
    // 14 dias no futuro
    expect(getDeadlineUrgency('2026-10-15T00:00:00.000Z', baseDate)).toBe('warning')
  })

  it('deve classificar como normal datas com mais de 14 dias ou sem data', () => {
    // 15 dias no futuro
    expect(getDeadlineUrgency('2026-10-16T00:00:00.000Z', baseDate)).toBe('normal')
    // 30 dias no futuro
    expect(getDeadlineUrgency('2026-10-31T00:00:00.000Z', baseDate)).toBe('normal')
    // Sem data
    expect(getDeadlineUrgency(undefined, baseDate)).toBe('normal')
    expect(getDeadlineUrgency('', baseDate)).toBe('normal')
  })

  it('deve ordenar linhas de outras demandas por vencimento crescente (urgente primeiro, sem data no fim)', () => {
    const demands: Partial<OtherOpDemandItem>[] = [
      { shortageId: '1', deliveryDate: '2026-10-25' },
      { shortageId: '2', deliveryDate: undefined },
      { shortageId: '3', deliveryDate: '2026-10-02' },
      { shortageId: '4', deliveryDate: '2026-10-10' },
      { shortageId: '5', deliveryDate: undefined },
    ]

    const sorted = [...demands].sort((a, b) => {
      if (!a.deliveryDate && !b.deliveryDate) return 0
      if (!a.deliveryDate) return 1
      if (!b.deliveryDate) return -1
      return a.deliveryDate.localeCompare(b.deliveryDate)
    })

    expect(sorted.map((s) => s.shortageId)).toEqual(['3', '4', '1', '2', '5'])
  })
})

describe('Melhoria 3: Alerta de Estoque Mínimo (disponível < mínimo)', () => {
  const minLevels: PcpMaterialMinLevel[] = [
    {
      id: 'lvl_1',
      material_code: '05100033',
      material_description: 'Niple M10',
      min_level: 20,
      created: '',
      updated: '',
    },
    {
      id: 'lvl_2',
      material_code: '14010038',
      material_description: 'Barra Chata Aço',
      min_level: 50,
      created: '',
      updated: '',
    },
    {
      id: 'lvl_3',
      material_code: '05200050',
      material_description: 'Arruela Acabamento',
      min_level: 10,
      created: '',
      updated: '',
    },
  ]

  it('deve incluir no alerta apenas componentes com disponível < mínimo, calculando a diferença exata', () => {
    const stockMap = new Map<
      string,
      { totalStock: number; reservedStock: number; availableStock: number; unit?: string }
    >()

    // Item 1: min 20, total 30, reservado 15 => disponível 15 (< 20) -> DEVE APARECER com diff 5
    stockMap.set('05100033', {
      totalStock: 30,
      reservedStock: 15,
      availableStock: 15,
      unit: 'PC',
    })

    // Item 2: min 50, total 60, reservado 5 => disponível 55 (>= 50) -> NÃO DEVE APARECER
    stockMap.set('14010038', {
      totalStock: 60,
      reservedStock: 5,
      availableStock: 55,
      unit: 'MT',
    })

    // Item 3: min 10, total 8, reservado 0 => disponível 8 (< 10) -> DEVE APARECER com diff 2
    stockMap.set('05200050', {
      totalStock: 8,
      reservedStock: 0,
      availableStock: 8,
      unit: 'PC',
    })

    const alerts = calculateMinLevelAlerts(minLevels, stockMap)

    expect(alerts).toHaveLength(2)
    // Item 1 tem diferença 5, Item 3 tem diferença 2 (ordenado pelo maior déficit)
    expect(alerts[0].code).toBe('05100033')
    expect(alerts[0].availableStock).toBe(15)
    expect(alerts[0].minLevel).toBe(20)
    expect(alerts[0].difference).toBe(5)

    expect(alerts[1].code).toBe('05200050')
    expect(alerts[1].availableStock).toBe(8)
    expect(alerts[1].minLevel).toBe(10)
    expect(alerts[1].difference).toBe(2)

    // O item 2 não pode estar na lista de alertas
    expect(alerts.find((a) => a.code === '14010038')).toBeUndefined()
  })

  it('não deve emitir alerta se o disponível for igual ao nível mínimo', () => {
    const stockMap = new Map<
      string,
      { totalStock: number; reservedStock: number; availableStock: number; unit?: string }
    >()

    // Exatamente no limite mínimo
    stockMap.set('05100033', {
      totalStock: 25,
      reservedStock: 5,
      availableStock: 20,
    })

    const alerts = calculateMinLevelAlerts([minLevels[0]], stockMap)
    expect(alerts).toHaveLength(0)
  })

  it('deve considerar disponível = 0 se o item não existir no estoque e emitir alerta com déficit total', () => {
    const emptyStockMap = new Map()
    const alerts = calculateMinLevelAlerts([minLevels[0]], emptyStockMap)

    expect(alerts).toHaveLength(1)
    expect(alerts[0].availableStock).toBe(0)
    expect(alerts[0].difference).toBe(20)
  })
})
