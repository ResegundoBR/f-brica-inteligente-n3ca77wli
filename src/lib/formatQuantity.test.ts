import { describe, it, expect } from 'vitest'
import { formatQuantity, parseQuantityInput } from './pcp-utils'

describe('formatQuantity', () => {
  it('formata números inteiros sem casas decimais extras', () => {
    expect(formatQuantity(0)).toBe('0')
    expect(formatQuantity(10)).toBe('10')
    expect(formatQuantity(1500)).toBe('1.500')
    expect(formatQuantity('10')).toBe('10')
  })

  it('trata valores nulos, indefinidos e vazios', () => {
    expect(formatQuantity(null)).toBe('0')
    expect(formatQuantity(undefined)).toBe('0')
    expect(formatQuantity('')).toBe('0')
    expect(formatQuantity('abc')).toBe('0')
  })

  it('formata dízimas e imprecisões de ponto flutuante em até 2 casas decimais', () => {
    // Casos reais relatados pelo usuário
    expect(formatQuantity(183.44639999999998)).toBe('183,45')
    expect(formatQuantity(401.75360000000006)).toBe('401,75')
    expect(formatQuantity(5.808400000000001)).toBe('5,81')
    expect(formatQuantity(585.2)).toBe('585,2')
  })

  it('respeita strings numéricas com vírgula ou ponto', () => {
    expect(formatQuantity('183.45')).toBe('183,45')
    expect(formatQuantity('183,45')).toBe('183,45')
  })
})

describe('parseQuantityInput', () => {
  it('aceita vírgula como decimal', () => {
    expect(parseQuantityInput('5,73')).toBe(5.73)
    expect(parseQuantityInput('0,541')).toBe(0.541)
    expect(parseQuantityInput('10,5')).toBe(10.5)
  })

  it('evita que 5.730 vire 5730 quando digitado com intenção de decimal', () => {
    expect(parseQuantityInput('5.730')).toBe(5.73)
    expect(parseQuantityInput('5.73')).toBe(5.73)
    expect(parseQuantityInput('1.459')).toBe(1.459)
    expect(parseQuantityInput('0.541')).toBe(0.541)
  })

  it('aceita separador de milhar quando o padrão for claramente milhar com decimal ou formato clássico', () => {
    expect(parseQuantityInput('1.234,56')).toBe(1234.56)
    expect(parseQuantityInput('10.000')).toBe(10000)
    expect(parseQuantityInput('100.000')).toBe(100000)
  })

  it('trata valores vazios e numéricos diretos', () => {
    expect(parseQuantityInput('')).toBe(0)
    expect(parseQuantityInput(null)).toBe(0)
    expect(parseQuantityInput(12.34)).toBe(12.34)
  })
})
