import { describe, it, expect } from 'vitest'
import { fixMojibake } from './mojibake'

describe('fixMojibake', () => {
  it('corretamente normaliza dupla codificação como na aceitação do caso real', () => {
    expect(fixMojibake('FIXAÃÇÃO DE TETO EM AÃÃO - ÃØ55MM')).toBe('FIXAÇÃO DE TETO EM AÇO - Ø55MM')
  })

  it('corrige acentos comuns em português', () => {
    expect(fixMojibake('PRODUÃÃO')).toBe('PRODUÇÃO')
    expect(fixMojibake('FABRICAÃÃO')).toBe('FABRICAÇÃO')
    expect(fixMojibake('PREPARAÃÃO')).toBe('PREPARAÇÃO')
    expect(fixMojibake('EXPEDIÃÃO')).toBe('EXPEDIÇÃO')
    expect(fixMojibake('TUBULAÃÃO')).toBe('TUBULAÇÃO')
  })

  it('não altera strings normais em português já decodificadas', () => {
    expect(fixMojibake('FIXAÇÃO DE TETO EM AÇO - Ø55MM')).toBe('FIXAÇÃO DE TETO EM AÇO - Ø55MM')
    expect(fixMojibake('PARAFUSO INOX M4X10MM')).toBe('PARAFUSO INOX M4X10MM')
    expect(fixMojibake('CÚPULA DE TECIDO')).toBe('CÚPULA DE TECIDO')
  })

  it('lida com entradas vazias, nulas ou indefinidas', () => {
    expect(fixMojibake('')).toBe('')
    expect(fixMojibake(null)).toBe('')
    expect(fixMojibake(undefined)).toBe('')
  })
})
