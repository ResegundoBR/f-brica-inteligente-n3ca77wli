import { describe, it, expect, vi } from 'vitest'
import { validateUnifiedCodesBatch, type UnifiedCatalogEntry } from './components'

describe('validateUnifiedCodesBatch', () => {
  it('valida existência de códigos contra o mapa em lote sem chamadas remotas adicionais', async () => {
    const mockMap = new Map<string, UnifiedCatalogEntry>()
    mockMap.set('05100004', {
      code: '05100004',
      description: 'PARAFUSO ALLEN INOX M4X10MM',
      unit: 'UN',
    })
    mockMap.set('14020031MBR', {
      code: '14020031MBR',
      description: 'DISCO MARMORE BRANCO',
      unit: 'UN',
    })

    const codes = ['05100004', '14020031mbr', '99999999', '   ']
    const result = await validateUnifiedCodesBatch(codes, mockMap)

    expect(result.get('05100004')?.exists).toBe(true)
    expect(result.get('05100004')?.entry?.description).toBe('PARAFUSO ALLEN INOX M4X10MM')

    expect(result.get('14020031mbr')?.exists).toBe(true)
    expect(result.get('14020031mbr')?.entry?.code).toBe('14020031MBR')

    expect(result.get('99999999')?.exists).toBe(false)
    expect(result.get('99999999')?.entry).toBeUndefined()

    expect(result.get('   ')?.exists).toBe(false)
  })
})
