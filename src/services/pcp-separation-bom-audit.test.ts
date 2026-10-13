import { describe, it, expect } from 'vitest'
import { classifyAuditItem, normalizeSector } from './pcp-separation-bom-audit'
import { safeUnwrapJson } from '@/lib/safe-json'

describe('safeUnwrapJson', () => {
  it('retorna null se entrada for nula ou indefinida', () => {
    expect(safeUnwrapJson(null)).toBeNull()
    expect(safeUnwrapJson(undefined)).toBeNull()
  })

  it('retorna objeto normal diretamente', () => {
    const obj = { a: 1, b: 'test' }
    expect(safeUnwrapJson(obj)).toEqual(obj)
  })

  it('deserializa JSON string comum', () => {
    const str = JSON.stringify([{ code: '14010038', qty: 2 }])
    expect(safeUnwrapJson(str)).toEqual([{ code: '14010038', qty: 2 }])
  })

  it('deserializa byte-array serializado do Goja', () => {
    const original = JSON.stringify([{ code: '06080040', total: 4 }])
    const bytes = Array.from(original).map((c) => c.charCodeAt(0))
    expect(safeUnwrapJson(bytes)).toEqual([{ code: '06080040', total: 4 }])
  })

  it('deserializa JSON com dupla serialização', () => {
    const nested = JSON.stringify(JSON.stringify(['op1', 'op2']))
    expect(safeUnwrapJson(nested)).toEqual(['op1', 'op2'])
  })
})

describe('normalizeSector', () => {
  it('normaliza variações para os setores padrão', () => {
    expect(normalizeSector('FABRICAÇÃO')).toBe('FABRICAÇÃO')
    expect(normalizeSector('PREPARAÇÃO')).toBe('PREPARAÇÃO')
    expect(normalizeSector('Acabamento')).toBe('PREPARAÇÃO')
    expect(normalizeSector('Montagem')).toBe('MONTAGEM')
    expect(normalizeSector('Expedição')).toBe('EXPEDIÇÃO')
    expect(normalizeSector('Embalagem')).toBe('EXPEDIÇÃO')
    expect(normalizeSector(null)).toBe('FABRICAÇÃO')
  })
})

describe('classifyAuditItem', () => {
  it('classifica como OK quando tudo foi separado', () => {
    const result = classifyAuditItem({
      expected: 10,
      separated: 10,
      registeredShortage: 0,
    })
    expect(result.classification).toBe('OK')
    expect(result.difference).toBe(0)
  })

  it('classifica como OK quando a falta registrada cobre a diferença', () => {
    const result = classifyAuditItem({
      expected: 10,
      separated: 6,
      registeredShortage: 4,
    })
    expect(result.classification).toBe('OK')
    expect(result.difference).toBe(0)
  })

  it('classifica como OK quando a falta registrada + recebido excede o esperado', () => {
    const result = classifyAuditItem({
      expected: 5,
      separated: 2,
      registeredShortage: 4,
    })
    expect(result.classification).toBe('OK')
    expect(result.difference).toBe(0)
  })

  it('classifica como FALTA ESCONDIDA quando ninguém separou nem pediu nada', () => {
    const result = classifyAuditItem({
      expected: 10,
      separated: 0,
      registeredShortage: 0,
    })
    expect(result.classification).toBe('FALTA ESCONDIDA')
    expect(result.difference).toBe(10)
  })

  it('classifica como FALTA A MENOR quando há falta registrada mas insuficiente', () => {
    const result = classifyAuditItem({
      expected: 10,
      separated: 4,
      registeredShortage: 2,
    })
    expect(result.classification).toBe('FALTA A MENOR')
    expect(result.difference).toBe(4) // 10 - 4 - 2 = 4
  })

  it('classifica como SEPARADO A MENOR quando separou uma parte e não há nenhuma falta registrada', () => {
    const result = classifyAuditItem({
      expected: 10,
      separated: 6,
      registeredShortage: 0,
    })
    expect(result.classification).toBe('SEPARADO A MENOR')
    expect(result.difference).toBe(4)
  })
})
