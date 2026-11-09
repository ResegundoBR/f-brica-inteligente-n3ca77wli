import { describe, it, expect } from 'vitest'
import { CONSUMPTION_CATEGORIES, REQUESTING_SECTORS } from './InternalConsumptionDialog'

describe('InternalConsumptionDialog constants and formatting logic', () => {
  it('defines the required consumption categories and requesting sectors', () => {
    expect(CONSUMPTION_CATEGORIES).toContain('Consumível')
    expect(CONSUMPTION_CATEGORIES).toContain('Insumo')
    expect(CONSUMPTION_CATEGORIES).toContain('Ferramental')
    expect(CONSUMPTION_CATEGORIES).toContain('EPI')
    expect(CONSUMPTION_CATEGORIES).toContain('Manutenção')
    expect(CONSUMPTION_CATEGORIES).toContain('Uso Interno')
    expect(CONSUMPTION_CATEGORIES).toContain('Outro')

    expect(REQUESTING_SECTORS).toContain('Serralheria')
    expect(REQUESTING_SECTORS).toContain('Montagem')
    expect(REQUESTING_SECTORS).toContain('Pintura')
    expect(REQUESTING_SECTORS).toContain('Manutenção')
    expect(REQUESTING_SECTORS).toContain('Expedição')
    expect(REQUESTING_SECTORS).toContain('Administrativo')
    expect(REQUESTING_SECTORS).toContain('Outro')
  })

  it('builds formatted reason string correctly with category, optional sector and description', () => {
    const buildReason = (category: string, sector = '', desc = '') => {
      const parts = [`Consumo interno — ${category}`]
      if (sector.trim()) {
        parts.push(sector.trim())
      }
      if (desc.trim()) {
        parts.push(desc.trim())
      }
      return parts.join(' — ')
    }

    expect(buildReason('Ferramental', 'Manutenção', 'Troca de pastilha de corte')).toBe(
      'Consumo interno — Ferramental — Manutenção — Troca de pastilha de corte',
    )
    expect(buildReason('EPI', 'Pintura')).toBe('Consumo interno — EPI — Pintura')
    expect(buildReason('Consumível')).toBe('Consumo interno — Consumível')
    expect(buildReason('Insumo', '', 'Fita isolante')).toBe(
      'Consumo interno — Insumo — Fita isolante',
    )
  })
})
