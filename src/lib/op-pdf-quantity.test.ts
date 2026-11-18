import { describe, it, expect } from 'vitest'
import { extractTotalPecasQuantity, isDateLikeHeaderValue } from './op-pdf-quantity'
import type { PdfPositionedLine } from './op-pdf-parser'

// Reprodução do bug do talão real OP 000637/2026 (talaoop-f4452.pdf):
// o rótulo "Total de Peças" vale 1.0000, mas colunas vizinhas (data "14/12/2026")
// levavam o parser a extrair 12.

function positionedLine(tokens: Array<[string, number, number?]>, y: number): PdfPositionedLine {
  return {
    y,
    tokens: tokens.map(([str, x, w]) => ({ str, x, width: w ?? str.length * 5, y, height: 10 })),
    lineStr: tokens.map((t) => t[0]).join(' '),
    pageIndex: 0,
  }
}

describe('extractTotalPecasQuantity — rótulo exato "Total de Peças"', () => {
  it('ignora datas no valor (rejeita dd/mm/aaaa e fragmentos)', () => {
    expect(isDateLikeHeaderValue('14/12/2026')).toBe(true)
    expect(isDateLikeHeaderValue('22 / 09 / 2026')).toBe(true)
    expect(isDateLikeHeaderValue('2026-12-14')).toBe(true)
    expect(isDateLikeHeaderValue('12/2026')).toBe(false)
    expect(isDateLikeHeaderValue('1.0000')).toBe(false)
  })

  it('extrai 1.0000 como 1 (linha única com valor na linha abaixo)', () => {
    const lines = [
      'Pedido Cliente Datas de Entrega Total de Peças',
      '00013935 ACME 22 / 09 / 2026 1.0000',
    ]
    expect(extractTotalPecasQuantity(lines)).toBe(1)
  })

  it('não confunde valor de coluna vizinha (data) com o Total de Peças', () => {
    const lines = ['Total de Peças', '14/12/2026 12.0000']
    // Sem posicionais, cai no fallback de texto; "14/12/2026" deve ser rejeitado
    expect(extractTotalPecasQuantity(lines)).toBe(12)
  })

  it('layout em colunas (posicional): valor do rótulo, não da coluna da data', () => {
    const positioned = [
      positionedLine(
        [
          ['Datas', 300],
          ['de', 340],
          ['Entrega', 365],
          ['Total', 450],
          ['de', 485],
          ['Peças', 500],
        ],
        300,
      ),
      positionedLine(
        [
          ['00013935', 300],
          ['ACME', 360],
          ['14/12/2026', 300],
          ['1.0000', 455],
        ],
        340,
      ),
      positionedLine(
        [
          ['12', 300],
          ['PC', 360],
        ],
        380,
      ),
    ]
    expect(extractTotalPecasQuantity(['header'], positioned)).toBe(1)
  })

  it('número de pedido na coluna vizinha não vira quantidade (sem "/")', () => {
    const positioned = [
      positionedLine(
        [
          ['Total', 450],
          ['de', 485],
          ['Peças', 500],
        ],
        300,
      ),
      positionedLine(
        [
          ['000637/2026', 450],
          ['1.0000', 455],
        ],
        340,
      ),
    ]
    expect(extractTotalPecasQuantity(['header'], positioned)).toBe(1)
  })
})
