import { describe, it } from 'vitest'
// @ts-expect-error
import nodeFs from 'node:fs'
// @ts-expect-error
import nodePath from 'node:path'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PdfPositionedLine, PdfPositionedToken, parseOpPdfDeterministic } from './op-pdf-parser'

declare const process: any

describe('Inspect real PDF tokens', () => {
  it('extracts tokens with exact coordinates from talaoop-b7677.pdf', async () => {
    const pdfPath = nodePath.resolve(process.cwd(), 'src/assets/talaoop-b7677.pdf')
    const data = new Uint8Array(nodeFs.readFileSync(pdfPath))
    const doc = await pdfjsLib.getDocument({ data }).promise

    console.log(`PDF loaded. Num pages: ${doc.numPages}`)

    const positionedPages: PdfPositionedLine[][] = []
    const pagesText: string[][] = []

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
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
        let bucket = lineBuckets.find((b: any) => Math.abs(b.y - itemY) <= Y_THRESHOLD)
        if (!bucket) {
          bucket = { y: itemY, items: [] }
          lineBuckets.push(bucket)
        }
        bucket.items.push(item)
      }

      lineBuckets.sort((a: any, b: any) => b.y - a.y)

      const pageLines: string[] = []
      const pagePositionedLines: PdfPositionedLine[] = []

      for (const bucket of lineBuckets) {
        bucket.items.sort((a: any, b: any) => a.transform[4] - b.transform[4])
        const tokens: PdfPositionedToken[] = bucket.items
          .map((it: any) => ({
            str: it.str.trim(),
            x: it.transform[4],
            y: it.transform[5],
            width: it.width,
            height: it.height,
          }))
          .filter((t: any) => t.str.length > 0)

        const lineStr = bucket.items
          .map((it: any) => it.str)
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

      console.log(`\n=== PAGE ${pageNum} (${pageLines.length} lines) ===`)
      pagePositionedLines.forEach((l, idx) => {
        console.log(
          `[P${pageNum} L${idx} y=${l.y.toFixed(1)}] "${l.lineStr}" | tokens: ${JSON.stringify(
            l.tokens.map((t) => ({ s: t.str, x: Math.round(t.x) })),
          )}`,
        )
      })
    }

    const allLines = pagesText.flat()
    const allPositionedLines = positionedPages.flat()

    const result = parseOpPdfDeterministic(allLines, allPositionedLines)
    const summary = result.components.map(
      (c, idx) =>
        `${idx + 1}. [${c.sector}] ${c.code} - ${c.description} | Qtd: ${c.quantity} ${c.unit}`,
    )
    throw new Error(
      `DEBUG_OUTPUT:\nHeader: ${JSON.stringify(result.header)}\nCount: ${result.components.length}\nItems:\n${summary.join('\n')}\nLines:\n${allLines.slice(0, 35).join('\n')}`,
    )
  })
})
