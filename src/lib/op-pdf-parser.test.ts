import { describe, it, expect } from 'vitest'
import {
  parseOpPdfDeterministic,
  collapseSpacedLetters,
  normalizeSector,
  PdfPositionedLine,
  isLinearUnit,
  extractCutMeasurementFromDescription,
} from './op-pdf-parser'

// @ts-expect-error
import nodeFs from 'node:fs'
// @ts-expect-error
import nodePath from 'node:path'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

declare const process: any

describe('Direct test of real PDF in op-pdf-parser.test.ts', () => {
  it('runs against talaoop-b7677.pdf', async () => {
    const pdfPath = nodePath.resolve(process.cwd(), 'src/assets/talaoop-b7677.pdf')
    const data = new Uint8Array(nodeFs.readFileSync(pdfPath))
    const doc = await pdfjsLib.getDocument({ data }).promise
    expect(doc.numPages).toBe(2)
    throw new Error('TEST_EXECUTES')
  })
})

describe('collapseSpacedLetters and normalizeSector', () => {
  it('collapses single spaced letters in ERP sector titles', () => {
    expect(collapseSpacedLetters('* F A B R I C A O *')).toBe('* FABRICAO *')
    expect(collapseSpacedLetters('* P R E P A R A O *')).toBe('* PREPARAO *')
    expect(collapseSpacedLetters('* M O N T A G E M *')).toBe('* MONTAGEM *')
    expect(collapseSpacedLetters('* E X P E D I O *')).toBe('* EXPEDIO *')
  })

  it('normalizes sector names even with spaced letters or missing accents', () => {
    expect(normalizeSector('* F A B R I C A O *')).toBe('FABRICAÇÃO')
    expect(normalizeSector('* P R E P A R A O *')).toBe('PREPARAÇÃO')
    expect(normalizeSector('* M O N T A G E M *')).toBe('MONTAGEM')
    expect(normalizeSector('* E X P E D I O *')).toBe('EXPEDIÇÃO')
  })
})

describe('OP 000494/2026 parser validation', () => {
  // Simulates positioned tokens from the real OP 000494/2026 PDF
  // Header: Pedido 14002, OP 000494/2026, Cliente 4LIGHT, Produto 03180007LT - PENDENTE TOGETHER I - HASTE FIXA LATONA, Qtd 1, Entrega 10/11/2026
  const samplePdfLines: PdfPositionedLine[] = [
    // Header page
    {
      y: 800,
      tokens: [
        { str: 'ORDEM DE PRODUÇÃO', x: 200, y: 800, width: 150, height: 12 },
        { str: 'OP: 000494/2026', x: 450, y: 800, width: 90, height: 12 },
      ],
      lineStr: 'ORDEM DE PRODUÇÃO OP: 000494/2026',
    },
    {
      y: 770,
      tokens: [
        { str: 'PEDIDO', x: 20, y: 770, width: 40, height: 10 },
        { str: 'CLIENTE', x: 100, y: 770, width: 50, height: 10 },
        { str: 'DATA DE ENTREGA', x: 300, y: 770, width: 90, height: 10 },
        { str: 'TOTAL DE PEÇAS', x: 450, y: 770, width: 80, height: 10 },
      ],
      lineStr: 'PEDIDO CLIENTE DATA DE ENTREGA TOTAL DE PEÇAS',
    },
    {
      y: 755,
      tokens: [
        { str: '14002', x: 20, y: 755, width: 40, height: 10 },
        { str: '4LIGHT', x: 100, y: 755, width: 60, height: 10 },
        { str: '10/11/2026', x: 300, y: 755, width: 60, height: 10 },
        { str: '1', x: 450, y: 755, width: 20, height: 10 },
      ],
      lineStr: '14002 4LIGHT 10/11/2026 1',
    },
    {
      y: 730,
      tokens: [
        { str: 'CÓDIGO (SKU)', x: 20, y: 730, width: 70, height: 10 },
        { str: 'DESCRIÇÃO DO SKU', x: 150, y: 730, width: 100, height: 10 },
      ],
      lineStr: 'CÓDIGO (SKU) DESCRIÇÃO DO SKU',
    },
    {
      y: 715,
      tokens: [
        { str: '03180007LT', x: 20, y: 715, width: 70, height: 10 },
        { str: 'PENDENTE TOGETHER I - HASTE FIXA LATONA', x: 150, y: 715, width: 250, height: 10 },
      ],
      lineStr: '03180007LT PENDENTE TOGETHER I - HASTE FIXA LATONA',
    },
    {
      y: 680,
      tokens: [{ str: 'OPERAÇÕES E SEUS MATERIAIS', x: 20, y: 680, width: 200, height: 12 }],
      lineStr: 'OPERAÇÕES E SEUS MATERIAIS',
    },
    {
      y: 660,
      tokens: [
        { str: 'CÓD PRODUTO', x: 20, y: 660, width: 70, height: 10 },
        { str: 'DESCRIÇÃO PRODUTO', x: 120, y: 660, width: 150, height: 10 },
        { str: 'QTD', x: 520, y: 660, width: 30, height: 10 },
        { str: 'UN', x: 620, y: 660, width: 20, height: 10 },
      ],
      lineStr: 'CÓD PRODUTO DESCRIÇÃO PRODUTO QTD UN',
    },

    // --- SETOR FABRICAÇÃO (6 itens) ---
    {
      y: 640,
      tokens: [{ str: '* F A B R I C A O *', x: 20, y: 640, width: 120, height: 10 }],
      lineStr: '* F A B R I C A O *',
    },
    {
      y: 620,
      tokens: [
        { str: '05200055', x: 20, y: 620, width: 50, height: 10 },
        { str: 'CANOPLA ALUMINIO 125MM', x: 120, y: 620, width: 150, height: 10 },
        { str: '1.0000', x: 520, y: 620, width: 40, height: 10 },
        { str: 'PC', x: 620, y: 620, width: 20, height: 10 },
      ],
      lineStr: '05200055 CANOPLA ALUMINIO 125MM 1.0000 PC',
    },
    {
      y: 600,
      tokens: [
        { str: '05310022', x: 20, y: 600, width: 50, height: 10 },
        { str: 'BUCHA EM AÇO Ø22,23X10MM', x: 120, y: 600, width: 160, height: 10 },
        { str: '4.0000', x: 520, y: 600, width: 40, height: 10 },
        { str: 'PC', x: 620, y: 620, width: 20, height: 10 },
      ],
      lineStr: '05310022 BUCHA EM AÇO Ø22,23X10MM 4.0000 PC',
    },
    {
      y: 580,
      tokens: [
        { str: '05330124', x: 20, y: 580, width: 50, height: 10 },
        { str: 'HASTE PARA CANOPLA', x: 120, y: 580, width: 140, height: 10 },
        { str: '1.0000', x: 520, y: 580, width: 40, height: 10 },
        { str: 'PC', x: 620, y: 580, width: 20, height: 10 },
      ],
      lineStr: '05330124 HASTE PARA CANOPLA 1.0000 PC',
    },
    {
      y: 560,
      tokens: [
        { str: '10010058', x: 20, y: 560, width: 50, height: 10 },
        { str: 'EROSÃO - BOCA DE LOBO', x: 120, y: 560, width: 150, height: 10 },
        { str: '1.0000', x: 520, y: 560, width: 40, height: 10 },
        { str: 'PC', x: 620, y: 560, width: 20, height: 10 },
      ],
      lineStr: '10010058 EROSÃO - BOCA DE LOBO 1.0000 PC',
    },
    {
      y: 540,
      tokens: [
        { str: '14010033', x: 20, y: 540, width: 50, height: 10 },
        { str: 'TUBO REDONDO AÇO Ø19,05MM', x: 120, y: 540, width: 170, height: 10 },
        { str: '0.0900', x: 520, y: 540, width: 40, height: 10 },
        { str: 'MT', x: 620, y: 540, width: 20, height: 10 },
      ],
      lineStr: '14010033 TUBO REDONDO AÇO Ø19,05MM 0.0900 MT',
    },
    {
      y: 520,
      tokens: [
        { str: '14010036', x: 20, y: 520, width: 50, height: 10 },
        { str: 'TUBO REDONDO AÇO Ø22,23MM', x: 120, y: 520, width: 170, height: 10 },
        { str: '2.0000', x: 520, y: 520, width: 40, height: 10 },
        { str: 'MT', x: 620, y: 520, width: 20, height: 10 },
      ],
      lineStr: '14010036 TUBO REDONDO AÇO Ø22,23MM 2.0000 MT',
    },

    // --- SETOR PREPARAÇÃO (4 itens) ---
    {
      y: 500,
      tokens: [{ str: '* P R E P A R A O *', x: 20, y: 500, width: 120, height: 10 }],
      lineStr: '* P R E P A R A O *',
    },
    {
      y: 480,
      tokens: [
        { str: 'FAB01005', x: 20, y: 480, width: 50, height: 10 },
        { str: 'ALOJAMENTO G9', x: 120, y: 480, width: 140, height: 10 },
        { str: '2.0000', x: 520, y: 480, width: 40, height: 10 },
        { str: 'PC', x: 620, y: 480, width: 20, height: 10 },
      ],
      lineStr: 'FAB01005 ALOJAMENTO G9 2.0000 PC',
    },
    {
      y: 460,
      tokens: [
        { str: 'FAB01139', x: 20, y: 460, width: 50, height: 10 },
        { str: 'ESTRUTURA TOGETHER I', x: 120, y: 460, width: 150, height: 10 },
        { str: '1.0000', x: 520, y: 460, width: 40, height: 10 },
        { str: 'PC', x: 620, y: 460, width: 20, height: 10 },
      ],
      lineStr: 'FAB01139 ESTRUTURA TOGETHER I 1.0000 PC',
    },
    {
      y: 440,
      tokens: [
        { str: 'FAB01208', x: 20, y: 440, width: 50, height: 10 },
        { str: 'HASTE PARA CANOPLA', x: 120, y: 440, width: 140, height: 10 },
        { str: '1.0000', x: 520, y: 440, width: 40, height: 10 },
        { str: 'PC', x: 620, y: 440, width: 20, height: 10 },
      ],
      lineStr: 'FAB01208 HASTE PARA CANOPLA 1.0000 PC',
    },
    {
      y: 420,
      tokens: [
        { str: 'FAB01297', x: 20, y: 420, width: 50, height: 10 },
        { str: 'CANOPLA 125 - 2 FUROS', x: 120, y: 420, width: 160, height: 10 },
        { str: '1.0000', x: 520, y: 420, width: 40, height: 10 },
        { str: 'PC', x: 620, y: 420, width: 20, height: 10 },
      ],
      lineStr: 'FAB01297 CANOPLA 125 - 2 FUROS 1.0000 PC',
    },

    // --- SETOR MONTAGEM (9 itens) ---
    {
      y: 400,
      tokens: [{ str: '* M O N T A G E M *', x: 20, y: 400, width: 120, height: 10 }],
      lineStr: '* M O N T A G E M *',
    },
    {
      y: 380,
      tokens: [
        { str: '05080023BR', x: 20, y: 380, width: 60, height: 10 },
        { str: 'CABO FLEXIVEL 0,50MM BRANCO', x: 120, y: 380, width: 170, height: 10 },
        { str: '2.0000', x: 520, y: 380, width: 40, height: 10 },
        { str: 'MT', x: 620, y: 380, width: 20, height: 10 },
      ],
      lineStr: '05080023BR CABO FLEXIVEL 0,50MM BRANCO 2.0000 MT',
    },
    {
      y: 360,
      tokens: [
        { str: '05080023PT', x: 20, y: 360, width: 60, height: 10 },
        { str: 'CABO FLEXIVEL 0,50MM PRETO', x: 120, y: 360, width: 170, height: 10 },
        { str: '2.0000', x: 520, y: 360, width: 40, height: 10 },
        { str: 'MT', x: 620, y: 360, width: 20, height: 10 },
      ],
      lineStr: '05080023PT CABO FLEXIVEL 0,50MM PRETO 2.0000 MT',
    },
    {
      y: 340,
      tokens: [
        { str: '05090029', x: 20, y: 340, width: 50, height: 10 },
        { str: 'SOQUETE G9 PORCELANA', x: 120, y: 340, width: 150, height: 10 },
        { str: '2.0000', x: 520, y: 340, width: 40, height: 10 },
        { str: 'PC', x: 620, y: 340, width: 20, height: 10 },
      ],
      lineStr: '05090029 SOQUETE G9 PORCELANA 2.0000 PC',
    },
    {
      y: 320,
      tokens: [
        { str: '05100003', x: 20, y: 320, width: 50, height: 10 },
        { str: 'NIPLE M10X25MM', x: 120, y: 320, width: 130, height: 10 },
        { str: '1.0000', x: 520, y: 320, width: 40, height: 10 },
        { str: 'PC', x: 620, y: 320, width: 20, height: 10 },
      ],
      lineStr: '05100003 NIPLE M10X25MM 1.0000 PC',
    },
    {
      y: 300,
      tokens: [
        { str: '05100004', x: 20, y: 300, width: 50, height: 10 },
        { str: 'PARAFUSO ALLEN M4X10MM', x: 120, y: 300, width: 150, height: 10 },
        { str: '2.0000', x: 520, y: 300, width: 40, height: 10 },
        { str: 'PC', x: 620, y: 300, width: 20, height: 10 },
      ],
      lineStr: '05100004 PARAFUSO ALLEN M4X10MM 2.0000 PC',
    },
    {
      y: 280,
      tokens: [
        { str: '05100063', x: 20, y: 280, width: 50, height: 10 },
        { str: 'PARAFUSO ALLEN M4X08MM', x: 120, y: 280, width: 150, height: 10 },
        { str: '1.0000', x: 520, y: 280, width: 40, height: 10 },
        { str: 'PC', x: 620, y: 280, width: 20, height: 10 },
      ],
      lineStr: '05100063 PARAFUSO ALLEN M4X08MM 1.0000 PC',
    },
    {
      y: 260,
      tokens: [
        { str: '05100088', x: 20, y: 260, width: 50, height: 10 },
        { str: 'NIPLE M10X100MM', x: 120, y: 260, width: 130, height: 10 },
        { str: '2.0000', x: 520, y: 260, width: 40, height: 10 },
        { str: 'PC', x: 620, y: 260, width: 20, height: 10 },
      ],
      lineStr: '05100088 NIPLE M10X100MM 2.0000 PC',
    },
    {
      y: 240,
      tokens: [
        { str: '05120017', x: 20, y: 240, width: 50, height: 10 },
        { str: 'ABRACADEIRA NYLON', x: 120, y: 240, width: 140, height: 10 },
        { str: '3.0000', x: 520, y: 240, width: 40, height: 10 },
        { str: 'PT', x: 620, y: 240, width: 20, height: 10 },
      ],
      lineStr: '05120017 ABRACADEIRA NYLON 3.0000 PT',
    },
    {
      y: 220,
      tokens: [
        { str: '06080013', x: 20, y: 220, width: 50, height: 10 },
        { str: 'ARRUELA BORRACHA', x: 120, y: 220, width: 130, height: 10 },
        { str: '4.0000', x: 520, y: 220, width: 40, height: 10 },
        { str: 'PC', x: 620, y: 220, width: 20, height: 10 },
      ],
      lineStr: '06080013 ARRUELA BORRACHA 4.0000 PC',
    },

    // --- SETOR EXPEDIÇÃO (1 item) ---
    {
      y: 200,
      tokens: [{ str: '* E X P E D I O *', x: 20, y: 200, width: 120, height: 10 }],
      lineStr: '* E X P E D I O *',
    },
    {
      y: 180,
      tokens: [
        { str: '11120024', x: 20, y: 180, width: 50, height: 10 },
        { str: 'GLOBO VIDRO Ø25CM', x: 120, y: 180, width: 140, height: 10 },
        { str: '2.0000', x: 520, y: 180, width: 40, height: 10 },
        { str: 'PC', x: 620, y: 180, width: 20, height: 10 },
      ],
      lineStr: '11120024 GLOBO VIDRO Ø25CM 2.0000 PC',
    },
  ]

  it('correctly extracts header data for OP 000494/2026', () => {
    const rawLines = samplePdfLines.map((l) => l.lineStr)
    const result = parseOpPdfDeterministic(rawLines, samplePdfLines)

    expect(result.header.order_number).toBe('14002')
    expect(result.header.op_number).toBe('000494/2026')
    expect(result.header.client_name).toBe('4LIGHT')
    expect(result.header.delivery_date).toBe('2026-11-10')
    expect(result.header.quantity).toBe(1)
  })

  it('extracts EXACTLY 20 components in the correct sectors with positional strategy', () => {
    const rawLines = samplePdfLines.map((l) => l.lineStr)
    const result = parseOpPdfDeterministic(rawLines, samplePdfLines)

    expect(result.components).toHaveLength(20)

    const fabricacao = result.components.filter((c) => c.sector === 'FABRICAÇÃO')
    const preparacao = result.components.filter((c) => c.sector === 'PREPARAÇÃO')
    const montagem = result.components.filter((c) => c.sector === 'MONTAGEM')
    const expedicao = result.components.filter((c) => c.sector === 'EXPEDIÇÃO')

    expect(fabricacao).toHaveLength(6)
    expect(preparacao).toHaveLength(4)
    expect(montagem).toHaveLength(9)
    expect(expedicao).toHaveLength(1)

    // FABRICAÇÃO (6 itens)
    expect(fabricacao.map((c) => c.code)).toEqual([
      '05200055',
      '05310022',
      '05330124',
      '10010058',
      '14010033',
      '14010036',
    ])

    // PREPARAÇÃO (4 itens)
    expect(preparacao.map((c) => c.code)).toEqual(['FAB01005', 'FAB01139', 'FAB01208', 'FAB01297'])

    // MONTAGEM (9 itens)
    expect(montagem.map((c) => c.code)).toEqual([
      '05080023BR',
      '05080023PT',
      '05090029',
      '05100003',
      '05100004',
      '05100063',
      '05100088',
      '05120017',
      '06080013',
    ])

    // EXPEDIÇÃO (1 item)
    expect(expedicao.map((c) => c.code)).toEqual(['11120024'])
  })

  it('extracts EXACTLY 20 components in fallback text accumulator strategy', () => {
    const textLines = [
      'ORDEM DE PRODUÇÃO OP: 000494/2026',
      'PEDIDO: 14002   CLIENTE: 4LIGHT   ENTREGA: 10/11/2026   QTD: 1',
      '03180007LT PENDENTE TOGETHER I - HASTE FIXA LATONA',
      'OPERAÇÕES E SEUS MATERIAIS',
      'CÓD PRODUTO | DESCRIÇÃO PRODUTO | QTD | UN',
      '* F A B R I C A O *',
      '05200055 | CANOPLA ALUMINIO 125MM | 1 | PC',
      '05310022 | BUCHA EM AÇO Ø22,23X10MM | 4 | PC',
      '05330124 | HASTE PARA CANOPLA | 1 | PC',
      '10010058 | EROSÃO - BOCA DE LOBO | 1 | PC',
      '14010033 | TUBO REDONDO AÇO Ø19,05MM | 0.09 | MT',
      '14010036 | TUBO REDONDO AÇO Ø22,23MM | 2 | MT',
      '* P R E P A R A O *',
      'FAB01005 | ALOJAMENTO G9 | 2 | PC',
      'FAB01139 | ESTRUTURA TOGETHER I | 1 | PC',
      'FAB01208 | HASTE PARA CANOPLA | 1 | PC',
      'FAB01297 | CANOPLA 125 - 2 FUROS | 1 | PC',
      '* M O N T A G E M *',
      '05080023BR | CABO FLEXIVEL 0,50MM BRANCO | 2 | MT',
      '05080023PT | CABO FLEXIVEL 0,50MM PRETO | 2 | MT',
      '05090029 | SOQUETE G9 PORCELANA | 2 | PC',
      '05100003 | NIPLE M10X25MM | 1 | PC',
      '05100004 | PARAFUSO ALLEN M4X10MM | 2 | PC',
      '05100063 | PARAFUSO ALLEN M4X08MM | 1 | PC',
      '05100088 | NIPLE M10X100MM | 2 | PC',
      '05120017 | ABRACADEIRA NYLON | 3 | PT',
      '06080013 | ARRUELA BORRACHA | 4 | PC',
      '* E X P E D I O *',
      '11120024 | GLOBO VIDRO Ø25CM | 2 | PC',
    ]

    const result = parseOpPdfDeterministic(textLines)
    expect(result.components).toHaveLength(20)

    const fabricacao = result.components.filter((c) => c.sector === 'FABRICAÇÃO')
    const preparacao = result.components.filter((c) => c.sector === 'PREPARAÇÃO')
    const montagem = result.components.filter((c) => c.sector === 'MONTAGEM')
    const expedicao = result.components.filter((c) => c.sector === 'EXPEDIÇÃO')

    expect(fabricacao).toHaveLength(6)
    expect(preparacao).toHaveLength(4)
    expect(montagem).toHaveLength(9)
    expect(expedicao).toHaveLength(1)
  })

  it('keeps cut measurement rules strictly intact: linear items vs PC/UN', () => {
    // Linear in MT
    expect(isLinearUnit('MT')).toBe(true)
    expect(isLinearUnit('M')).toBe(true)
    // Non-linear
    expect(isLinearUnit('PC')).toBe(false)
    expect(isLinearUnit('UN')).toBe(false)
    expect(isLinearUnit('PT')).toBe(false)

    // Linear descriptions with cut measurement
    expect(extractCutMeasurementFromDescription('TUBO Ø22,23X100MM - UPPER P', 'MT')).toBe('0,100M')
    // Non-linear descriptions with dimensions must NOT extract cut measurement when unit is PC/UN
    expect(extractCutMeasurementFromDescription('BUCHA EM AÇO Ø22,23X10MM', 'PC')).toBe('')
    expect(extractCutMeasurementFromDescription('PARAFUSO ALLEN M4X10MM', 'PC')).toBe('')
    expect(extractCutMeasurementFromDescription('CANOPLA ALUMINIO 125MM', 'PC')).toBe('')
  })
})
