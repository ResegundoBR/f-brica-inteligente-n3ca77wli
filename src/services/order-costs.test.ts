import { describe, it, expect } from 'vitest'
import { normalizeCategoryName, summarizeCosts } from './order-costs'

describe('order-costs dynamic categories', () => {
  it('normalizes category name removing accents and case', () => {
    expect(normalizeCategoryName('Mão de Obra')).toBe('mao de obra')
    expect(normalizeCategoryName('EMBALAGEM')).toBe('embalagem')
    expect(normalizeCategoryName('  Terceirização   ')).toBe('terceirizacao')
  })

  it('summarizes costs including custom dynamic categories', () => {
    const summary = summarizeCosts({
      automaticMaterial: 100,
      manualLines: [
        {
          id: '1',
          description: 'MO montagem',
          source: 'Manual',
          category: 'Mão de Obra',
          quantity: 2,
          unitCost: 50,
          total: 100,
        },
        {
          id: '2',
          description: 'Caixa de madeira',
          source: 'Manual',
          category: 'Embalagem',
          quantity: 1,
          unitCost: 30,
          total: 30,
        },
        {
          id: '3',
          description: 'Frete dedicado',
          source: 'Manual',
          category: 'Transporte Especial',
          quantity: 1,
          unitCost: 70,
          total: 70,
        },
      ],
      salePrice: 500,
      overheadPercent: 10,
    })

    expect(summary.materialTotal).toBe(100)
    expect(summary.manualByCategory['Mão de Obra']).toBe(100)
    expect(summary.manualByCategory['Embalagem']).toBe(30)
    expect(summary.manualByCategory['Transporte Especial']).toBe(70)

    // Direct cost = Material (100) + Mão de Obra (100) + Embalagem (30) + Transporte Especial (70) = 300
    expect(summary.directCost).toBe(300)
    // Overhead = 10% of direct cost = 30
    expect(summary.overheadValue).toBe(30)
    // Full cost = 330
    expect(summary.fullCost).toBe(330)

    // Contribution margin = 500 - 300 = 200 (40%)
    expect(summary.contributionMarginValue).toBe(200)
    expect(summary.contributionMarginPercent).toBe(40)
  })
})
