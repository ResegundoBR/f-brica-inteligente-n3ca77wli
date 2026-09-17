import { describe, it, expect } from 'vitest'
// @ts-expect-error
import nodeFs from 'node:fs'
// @ts-expect-error
import nodePath from 'node:path'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PdfPositionedLine, PdfPositionedToken, parseOpPdfDeterministic } from './op-pdf-parser'

declare const process: any

async function extractTokensFromPdfBuffer(
  buffer: ArrayBuffer,
): Promise<{ pages: string[][]; positionedPages: PdfPositionedLine[][] }> {
  const pdf = await (pdfjsLib as any).getDocument({ data: buffer }).promise

  const pagesText: string[][] = []
  const positionedPages: PdfPositionedLine[][] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()

    const items = textContent.items as Array<{
      str: string
      transform: number[]
      width: number
      height: number
    }>

    const lineBuckets: { y: number; items: typeof items }[] = []
    const Y_THRESHOLD = 3.5

    for (const item of items) {
      if (!item.str && item.str !== ' ') continue
      const itemY = item.transform[5]
      let bucket = lineBuckets.find((b) => Math.abs(b.y - itemY) <= Y_THRESHOLD)
      if (!bucket) {
        bucket = { y: itemY, items: [] }
        lineBuckets.push(bucket)
      }
      bucket.items.push(item)
    }

    lineBuckets.sort((a, b) => b.y - a.y)

    const pageLines: string[] = []
    const pagePositionedLines: PdfPositionedLine[] = []

    for (const bucket of lineBuckets) {
      bucket.items.sort((a, b) => a.transform[4] - b.transform[4])
      const tokens: PdfPositionedToken[] = bucket.items
        .map((it) => ({
          str: it.str.trim(),
          x: it.transform[4],
          y: it.transform[5],
          width: it.width,
          height: it.height,
        }))
        .filter((t) => t.str.length > 0)

      const lineStr = bucket.items
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (lineStr) {
        pageLines.push(lineStr)
        pagePositionedLines.push({
          y: bucket.y,
          tokens,
          lineStr,
          pageIndex: pageNum - 1,
        })
      }
    }
    pagesText.push(pageLines)
    positionedPages.push(pagePositionedLines)
  }

  return { pages: pagesText, positionedPages }
}

describe('Real PDF parser validation (src/assets/talaoop-b7677.pdf)', () => {
  it('extracts tokens and parses OP 000494/2026 with exact 20 components', async () => {
    const pdfPath = nodePath.resolve(process.cwd(), 'src/assets/talaoop-b7677.pdf')
    expect(nodeFs.existsSync(pdfPath)).toBe(true)

    const fileBuffer = nodeFs.readFileSync(pdfPath)
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    )

    const { pages, positionedPages } = await extractTokensFromPdfBuffer(arrayBuffer)
    const allLines = pages.flat()
    const allPositionedLines = positionedPages.flat()

    const parsed = parseOpPdfDeterministic(allLines, allPositionedLines)

    // Expected Header:
    // Número da OP 000494/2026; Pedido 00014002 (ou 14002); Data de Entrega 03/11/2026; Cliente 4LIGHT; Quantidade = 1
    expect(parsed.header.op_number).toBe('000494/2026')
    expect(['14002', '00014002']).toContain(parsed.header.order_number)
    expect(parsed.header.client_name).toBe('4LIGHT')
    expect(parsed.header.delivery_date).toBe('2026-11-03')
    expect(parsed.header.quantity).toBe(1)

    // Expected Components: 20 total
    expect(parsed.components).toHaveLength(20)

    const fabricacao = parsed.components.filter((c) => c.sector === 'FABRICAÇÃO')
    const preparacao = parsed.components.filter((c) => c.sector === 'PREPARAÇÃO')
    const montagem = parsed.components.filter((c) => c.sector === 'MONTAGEM')
    const expedicao = parsed.components.filter((c) => c.sector === 'EXPEDIÇÃO')

    expect(fabricacao).toHaveLength(6)
    expect(preparacao).toHaveLength(4)
    expect(montagem).toHaveLength(9)
    expect(expedicao).toHaveLength(1)

    // Check specific codes
    expect(fabricacao.map((c) => c.code)).toEqual([
      '05200055',
      '05310022',
      '05330124',
      '10010058',
      '14010033',
      '14010036',
    ])

    expect(preparacao.map((c) => c.code)).toEqual(['FAB01005', 'FAB01139', 'FAB01208', 'FAB01297'])

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

    expect(expedicao.map((c) => c.code)).toEqual(['11120024'])
  })
})
