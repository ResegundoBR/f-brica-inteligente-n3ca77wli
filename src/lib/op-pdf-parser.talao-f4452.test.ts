import { describe, it, expect } from 'vitest'
// @ts-expect-error
import nodeFs from 'node:fs'
// @ts-expect-error
import nodePath from 'node:path'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PdfPositionedLine, PdfPositionedToken, parseOpPdfDeterministic } from './op-pdf-parser'

declare const process: any

// Reprodução do bug: talão real OP 000637/2026 (Total de Peças = 1.0000).
// O parser preenchia 12 (token vizinho da coluna ao lado) em vez de 1.
describe('Real PDF parser bugfix (src/assets/talaoop-f4452.pdf)', () => {
  it('extracts quantity 1 (not 12) for OP 000637/2026', async () => {
    const pdfPath = nodePath.resolve(process.cwd(), 'src/assets/talaoop-f4452.pdf')
    expect(nodeFs.existsSync(pdfPath)).toBe(true)

    const fileBuffer = nodeFs.readFileSync(pdfPath)
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    )

    const pdf = await (pdfjsLib as any).getDocument({ data: arrayBuffer }).promise
    const pages: string[][] = []
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
          pagePositionedLines.push({ y: bucket.y, tokens, lineStr, pageIndex: pageNum - 1 })
        }
      }
      pages.push(pageLines)
      positionedPages.push(pagePositionedLines)
    }

    const allLines = pages.flat()
    const allPositionedLines = positionedPages.flat()
    // Diagnóstico visível no runner de testes
    console.log('F4452 LINES:')
    allLines.forEach((l, i) => console.log(`  [${i}] ${l}`))

    const parsed = parseOpPdfDeterministic(allLines, allPositionedLines)
    console.log('F4452 HEADER:', parsed.header)
    console.log(
      'F4452 COMPONENTS:',
      parsed.components.map((c) => ({ code: c.code, qty: c.quantity, unit: c.unit })),
    )

    expect(parsed.header.op_number).toBe('000637/2026')
    expect(parsed.header.quantity).toBe(1)
    // Bucha 12 PC / tubo 3.58 MT do PDF sem divisão indevida
    const bucha = parsed.components.find((c) => c.code === '05310221')
    expect(bucha).toBeDefined()
    expect(bucha!.quantity).toBe(12)
    const tubo = parsed.components.find((c) => c.code === '14010041')
    expect(tubo).toBeDefined()
    expect(tubo!.quantity).toBe(3.58)
  })
})
