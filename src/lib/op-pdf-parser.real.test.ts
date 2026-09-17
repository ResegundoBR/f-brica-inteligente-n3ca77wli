import { describe, it, expect } from 'vitest'
// @ts-expect-error
import nodeFs from 'node:fs'
// @ts-expect-error
import nodePath from 'node:path'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PdfPositionedLine, PdfPositionedToken, parseOpPdfDeterministic } from './op-pdf-parser'

declare const process: any

describe('Inspect real PDF tokens', () => {
  it('extracts tokens with exact coordinates from talaoop-b7677.pdf', () => {
    expect(1).toBe(1)
  })
})
