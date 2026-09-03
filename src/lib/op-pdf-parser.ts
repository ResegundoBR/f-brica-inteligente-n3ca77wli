import type { CompositionItem, Product, PcpOrderMaterialSector } from '@/types'

export interface ExtractedOpHeader {
  order_number?: string
  op_number?: string
  delivery_date?: string
  quantity?: number
  client_name?: string
  product_code?: string
  product_name?: string
  observations?: string
}

export interface ExtractedOpComponent {
  id: string
  sector: PcpOrderMaterialSector
  code: string
  description: string
  quantity: number
  unit: string
  measurements?: string
}

export interface ParsedOpPdfResult {
  header: ExtractedOpHeader
  components: ExtractedOpComponent[]
  rawText: string
  pageCount: number
}

export type ComparisonStatus = 'same' | 'divergent' | 'new' | 'removed'

export interface ComponentComparisonRow {
  id: string
  code: string
  sector: PcpOrderMaterialSector
  pdfItem?: ExtractedOpComponent
  catalogItem?: CompositionItem
  status: ComparisonStatus
  divergenceReasons?: string[]
  applyToOp: boolean
  updateCatalog: boolean
  resolvedSector: PcpOrderMaterialSector
  resolvedCode: string
  resolvedDescription: string
  resolvedQuantity: number
  resolvedUnit: string
  resolvedMeasurements?: string
}

export interface PdfPositionedToken {
  str: string
  x: number
  y: number
  width: number
  height: number
}

export interface PdfPositionedLine {
  y: number
  tokens: PdfPositionedToken[]
  lineStr: string
}

export interface PdfExtractionResult {
  text: string
  pages: string[][]
  pageCount: number
  positionedPages?: PdfPositionedLine[][]
}

let pdfjsPromise: Promise<any> | null = null

async function getPdfjs(): Promise<any> {
  if (pdfjsPromise) return pdfjsPromise

  pdfjsPromise = (async () => {
    if ((window as any).pdfjsLib) {
      return (window as any).pdfjsLib
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
      script.onload = () => {
        const lib = (window as any).pdfjsLib
        if (lib) {
          lib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
          resolve(lib)
        } else {
          reject(new Error('Falha ao carregar a biblioteca de leitura de PDF.'))
        }
      }
      script.onerror = () => reject(new Error('Erro ao carregar o leitor de PDF.'))
      document.head.appendChild(script)
    })
  })()

  return pdfjsPromise
}

export async function extractTextFromPdfFile(file: File): Promise<PdfExtractionResult> {
  const pdfjs = await getPdfjs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise

  const pagesText: string[][] = []
  const positionedPages: PdfPositionedLine[][] = []
  let fullText = ''

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
        fullText += lineStr + '\n'
        pagePositionedLines.push({
          y: bucket.y,
          tokens,
          lineStr,
        })
      }
    }
    pagesText.push(pageLines)
    positionedPages.push(pagePositionedLines)
  }

  return { text: fullText, pages: pagesText, pageCount: pdf.numPages, positionedPages }
}

function normalizeDate(raw: string): string | undefined {
  if (!raw) return undefined
  const clean = raw.trim()
  const dmyMatch = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0')
    const month = dmyMatch[2].padStart(2, '0')
    const year = dmyMatch[3]
    return `${year}-${month}-${day}`
  }
  const ymdMatch = clean.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (ymdMatch) {
    const year = ymdMatch[1]
    const month = ymdMatch[2].padStart(2, '0')
    const day = ymdMatch[3].padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return undefined
}

export function parseQuantity(raw: string | number): number {
  if (typeof raw === 'number') {
    return Math.round(raw * 10000) / 10000
  }
  if (!raw) return 0
  const clean = String(raw).trim()
  let parsed = 0
  if (clean.includes(',') && clean.includes('.')) {
    // Determine whether comma or dot is the decimal separator
    const lastComma = clean.lastIndexOf(',')
    const lastDot = clean.lastIndexOf('.')
    if (lastComma > lastDot) {
      // e.g. 1.000,50 -> comma is decimal
      const standard = clean.replace(/\./g, '').replace(',', '.')
      parsed = parseFloat(standard)
    } else {
      // e.g. 1,000.50 -> dot is decimal
      const standard = clean.replace(/,/g, '')
      parsed = parseFloat(standard)
    }
  } else if (clean.includes(',')) {
    parsed = parseFloat(clean.replace(',', '.'))
  } else {
    parsed = parseFloat(clean)
  }
  if (isNaN(parsed)) return 0
  return Math.round(parsed * 10000) / 10000
}

export function normalizeSector(rawSector: string): PcpOrderMaterialSector {
  const norm = (rawSector || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

  if (norm.includes('FABRIC')) return 'FABRICAÇÃO'
  if (norm.includes('PREPAR') || norm.includes('ACABAM') || norm.includes('PINTUR'))
    return 'PREPARAÇÃO'
  if (norm.includes('MONTAG')) return 'MONTAGEM'
  if (norm.includes('EXPED') || norm.includes('EMBALAG')) return 'EXPEDIÇÃO'
  return 'FABRICAÇÃO'
}

const KNOWN_HEADER_LABEL_WORDS = new Set([
  'PEDIDO',
  'CLIENTE',
  'DATA',
  'DATAS',
  'ENTREGA',
  'EMISSAO',
  'EMISSÃO',
  'OP',
  'ORDEM',
  'PRODUCAO',
  'PRODUÇÃO',
  'NUMERO',
  'NÚMERO',
  'SKU',
  'CODIGO',
  'CÓDIGO',
  'DESCRICAO',
  'DESCRIÇÃO',
  'SOLICITACAO',
  'SOLICITAÇÃO',
  'DOCUMENTO',
  'ESTOQUE',
  'MATERIAIS',
  'PECA',
  'PEÇAS',
  'PECAS',
  'TOTAL',
  'QUANTIDADE',
  'QTD',
  'OBS',
  'OBSERVACOES',
  'OBSERVAÇÕES',
])

function isLabelWord(word: string): boolean {
  const normalized = word
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z]/g, '')
  return KNOWN_HEADER_LABEL_WORDS.has(normalized)
}

function isIgnoredLine(line: string): boolean {
  return (
    /^(?:P[áa]gina\s+\d+|Emiss[aã]o:|Data\/Hora\s+Emiss[aã]o|Obs:|Solicita[çc][aã]o\s+de\s+Materiais|Documento\s+de\s+Estoque)/i.test(
      line,
    ) ||
    /^_{3,}/.test(line) ||
    /^-{3,}/.test(line)
  )
}

function cleanClientName(raw: string, knownOrderNumber?: string): string {
  let cleaned = raw.trim()
  if (knownOrderNumber) {
    const rawNum = knownOrderNumber.replace(/^0+/, '')
    const fullPattern = new RegExp(`^(?:0*${rawNum}|${knownOrderNumber})\\s*`, 'i')
    cleaned = cleaned.replace(fullPattern, '').trim()
  }
  cleaned = cleaned.replace(/^\d{3,12}\s+/, '').trim()
  cleaned = cleaned
    .split(
      /(?:CNPJ|CPF|Data\b|Datas\b|Entrega|OP\b|Pedido|Produto|C[oó]digo|Descri[çc][aã]o|Endere[çc]o|Qtd\b|Total\b|Solicita[çc][aã]o|Documento)/i,
    )[0]
    .trim()
  return cleaned
}

function removeLeadingZeros(val: string): string {
  const trimmed = (val || '').trim()
  const stripped = trimmed.replace(/^0+/, '')
  return stripped || (trimmed ? '0' : '')
}

/**
 * Find the closest token or span of tokens in a positioned line matching a target X range
 */
function findTokensAtX(
  line: PdfPositionedLine,
  targetMinX: number,
  targetMaxX: number,
  maxDistance = 50,
): PdfPositionedToken[] {
  return line.tokens.filter((t) => {
    const tokenRight = t.x + (t.width || 0)
    // Check overlap
    if (t.x <= targetMaxX && tokenRight >= targetMinX) return true
    // Check distance between center of token and center of target range
    const targetCenterX = (targetMinX + targetMaxX) / 2
    const tokenCenterX = t.x + (t.width || 0) / 2
    return Math.abs(targetCenterX - tokenCenterX) <= maxDistance
  })
}

export function parseOpPdfDeterministic(
  allLines: string[],
  positionedLines?: PdfPositionedLine[],
): ParsedOpPdfResult {
  const header: ExtractedOpHeader = {}
  const components: ExtractedOpComponent[] = []

  let currentSector: PcpOrderMaterialSector = 'FABRICAÇÃO'
  const sectorKeywords: { regex: RegExp; sector: PcpOrderMaterialSector }[] = [
    { regex: /^(?:SETOR|ETAPA|FASE)?\s*(?:[-:]\s*)?FABRICA[CÇ][AÃ]O/i, sector: 'FABRICAÇÃO' },
    {
      regex: /^(?:SETOR|ETAPA|FASE)?\s*(?:[-:]\s*)?PREPARA[CÇ][AÃ]O(?:\s*\(ACABAMENTO\))?/i,
      sector: 'PREPARAÇÃO',
    },
    { regex: /^(?:SETOR|ETAPA|FASE)?\s*(?:[-:]\s*)?ACABAMENTO/i, sector: 'PREPARAÇÃO' },
    { regex: /^(?:SETOR|ETAPA|FASE)?\s*(?:[-:]\s*)?MONTAGEM/i, sector: 'MONTAGEM' },
    { regex: /^(?:SETOR|ETAPA|FASE)?\s*(?:[-:]\s*)?EXPEDI[CÇ][AÃ]O/i, sector: 'EXPEDIÇÃO' },
    { regex: /^(?:SETOR|ETAPA|FASE)?\s*(?:[-:]\s*)?EMBALAGEM/i, sector: 'EXPEDIÇÃO' },
  ]

  const fullText = allLines.join('\n')

  // ----------------------------------------------------
  // STEP A: Positional matching for Header fields (X-coordinate matching)
  // ----------------------------------------------------
  if (positionedLines && positionedLines.length > 0) {
    // Search across positioned lines for label tokens and match by X in subsequent line
    for (let i = 0; i < positionedLines.length; i++) {
      const pLine = positionedLines[i]

      // Identify label tokens on this line:
      // 1. Pedido (usually X ≈ 0-60)
      // 2. Cliente (usually X ≈ 40-100)
      // 3. Datas / Data de Entrega (usually X ≈ 80-140)
      // 4. Total de Peças (usually X ≈ 150-220)
      // 5. OP (usually X ≈ 0-100)

      interface FoundLabel {
        type: 'pedido' | 'cliente' | 'data_entrega' | 'total_pecas' | 'op' | 'sku' | 'sku_desc'
        minX: number
        maxX: number
        labelTokenIndices: number[]
      }

      const foundLabels: FoundLabel[] = []

      for (let t = 0; t < pLine.tokens.length; t++) {
        const token = pLine.tokens[t]
        const str = token.str.toUpperCase()

        // "Pedido"
        if (/^PEDIDO\b|^N[º°]?\s*DO\s*PEDIDO|^P\.V\./i.test(str)) {
          foundLabels.push({
            type: 'pedido',
            minX: token.x,
            maxX: token.x + (token.width || 35),
            labelTokenIndices: [t],
          })
        }
        // "Cliente"
        else if (/^CLIENTE\b|^RAZ[AÃ]O\s+SOCIAL\b|^DESTINAT[AÁ]RIO\b/i.test(str)) {
          foundLabels.push({
            type: 'cliente',
            minX: token.x,
            maxX: token.x + (token.width || 45),
            labelTokenIndices: [t],
          })
        }
        // "Datas de Entrega" or "Data de Entrega" or "Entrega"
        else if (/^DATAS?\b|^ENTREGA\b/i.test(str)) {
          // Check multi-word phrase e.g. "Datas" "de" "Entrega"
          let combinedWidth = token.width || 30
          let endIdx = t
          if (t + 1 < pLine.tokens.length && /^(?:DE|ENTREGA)\b/i.test(pLine.tokens[t + 1].str)) {
            endIdx = t + 1
            combinedWidth += (pLine.tokens[t + 1].width || 30) + 5
            if (t + 2 < pLine.tokens.length && /^ENTREGA\b/i.test(pLine.tokens[t + 2].str)) {
              endIdx = t + 2
              combinedWidth += (pLine.tokens[t + 2].width || 35) + 5
            }
          }
          foundLabels.push({
            type: 'data_entrega',
            minX: token.x,
            maxX: token.x + combinedWidth,
            labelTokenIndices: Array.from({ length: endIdx - t + 1 }, (_, k) => t + k),
          })
        }
        // "Total de Peças"
        else if (/^TOTAL\b|^QUANTIDADE\b|^QTD\b/i.test(str)) {
          let combinedWidth = token.width || 30
          let endIdx = t
          if (t + 1 < pLine.tokens.length && /^(?:DE|PE[ÇC]AS)\b/i.test(pLine.tokens[t + 1].str)) {
            endIdx = t + 1
            combinedWidth += (pLine.tokens[t + 1].width || 30) + 5
            if (t + 2 < pLine.tokens.length && /^PE[ÇC]AS\b/i.test(pLine.tokens[t + 2].str)) {
              endIdx = t + 2
              combinedWidth += (pLine.tokens[t + 2].width || 35) + 5
            }
          }
          foundLabels.push({
            type: 'total_pecas',
            minX: token.x,
            maxX: token.x + combinedWidth,
            labelTokenIndices: Array.from({ length: endIdx - t + 1 }, (_, k) => t + k),
          })
        }
        // "OP" or "Número da OP"
        else if (/^OP\b|^ORDEM\s+DE\s+PRODU[ÇC][AÃ]O\b|^N[º°]?\s*DA\s*OP\b/i.test(str)) {
          foundLabels.push({
            type: 'op',
            minX: token.x,
            maxX: token.x + (token.width || 25),
            labelTokenIndices: [t],
          })
        }
        // "Código (S.K.U)"
        else if (/^C[ÓO]DIGO\s*\(?S\.?K\.?U\)?|^SKU\b/i.test(str)) {
          foundLabels.push({
            type: 'sku',
            minX: token.x,
            maxX: token.x + (token.width || 50),
            labelTokenIndices: [t],
          })
        }
        // "Descrição S.K.U"
        else if (/^DESCRI[CÇ][AÃ]O\s*(?:DO)?\s*S\.?K\.?U/i.test(str)) {
          foundLabels.push({
            type: 'sku_desc',
            minX: token.x,
            maxX: token.x + (token.width || 70),
            labelTokenIndices: [t],
          })
        }
      }

      // If we found labels on this line, calculate bounding column intervals between labels
      // to cleanly isolate values in subsequent lines!
      if (foundLabels.length > 0) {
        // Sort labels by X position
        foundLabels.sort((a, b) => a.minX - b.minX)

        // Calculate column boundary for each label: from its minX to the next label's minX
        const labelColumns = foundLabels.map((lbl, idx) => {
          const nextLbl = foundLabels[idx + 1]
          const leftBound =
            idx === 0 ? Math.max(0, lbl.minX - 25) : (foundLabels[idx - 1].maxX + lbl.minX) / 2
          const rightBound = nextLbl ? (lbl.maxX + nextLbl.minX) / 2 : lbl.maxX + 200
          return {
            ...lbl,
            colMinX: leftBound,
            colMaxX: rightBound,
          }
        })

        // Look at the lines immediately below (1 to 4 lines down)
        for (let j = i + 1; j < Math.min(positionedLines.length, i + 4); j++) {
          const valLine = positionedLines[j]
          if (!valLine.tokens.length || isIgnoredLine(valLine.lineStr)) continue

          // For each label column, find the tokens in valLine falling into this column
          for (const col of labelColumns) {
            const matchedTokens = valLine.tokens.filter(
              (tok) => tok.x >= col.colMinX - 10 && tok.x <= col.colMaxX + 10,
            )
            if (matchedTokens.length === 0) continue

            const combinedStr = matchedTokens
              .map((tok) => tok.str)
              .join(' ')
              .trim()
            if (!combinedStr || isLabelWord(combinedStr)) continue

            switch (col.type) {
              case 'pedido': {
                if (!header.order_number) {
                  // Find first number token in the matched column tokens
                  for (const tok of matchedTokens) {
                    const numMatch = tok.str.match(/^[0-9A-Za-z\-./]{3,15}$/)
                    if (numMatch && /[0-9]/.test(tok.str) && !isLabelWord(tok.str)) {
                      header.order_number = removeLeadingZeros(tok.str)
                      break
                    }
                  }
                }
                break
              }
              case 'cliente': {
                if (!header.client_name) {
                  const cleaned = cleanClientName(combinedStr, header.order_number)
                  if (cleaned && cleaned.length > 1 && !isLabelWord(cleaned)) {
                    header.client_name = cleaned
                  }
                }
                break
              }
              case 'data_entrega': {
                if (!header.delivery_date) {
                  const dateMatch = combinedStr.match(
                    /(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})/,
                  )
                  if (dateMatch) {
                    const d = normalizeDate(dateMatch[1])
                    if (d) header.delivery_date = d
                  }
                }
                break
              }
              case 'total_pecas': {
                if (!header.quantity) {
                  // Match quantity token in this column (e.g. 2,0000 or 2)
                  for (const tok of matchedTokens) {
                    const qMatch = tok.str.match(/^(\d+(?:[.,]\d+)?)$/)
                    if (qMatch) {
                      const q = parseQuantity(qMatch[1])
                      if (q > 0) {
                        header.quantity = q
                        break
                      }
                    }
                  }
                }
                break
              }
              case 'op': {
                if (!header.op_number) {
                  const opMatch = combinedStr.match(/^([A-Za-z0-9\-./]{3,20})$/)
                  if (opMatch && !isLabelWord(opMatch[1])) {
                    header.op_number = opMatch[1]
                  }
                }
                break
              }
              case 'sku': {
                if (!header.product_code) {
                  const skuToken = matchedTokens[0]?.str
                  if (skuToken && !isLabelWord(skuToken) && /^[A-Za-z0-9\-._/]+$/.test(skuToken)) {
                    header.product_code = skuToken
                  }
                }
                break
              }
              case 'sku_desc': {
                if (!header.product_name) {
                  const cleaned = cleanClientName(combinedStr, header.order_number)
                  if (cleaned && cleaned.length > 2 && !isLabelWord(cleaned)) {
                    header.product_name = cleaned
                  }
                }
                break
              }
            }
          }
        }
      }
    }
  }

  // ----------------------------------------------------
  // STEP B: Fallbacks / Complementary extraction (regex & line splitting)
  // ----------------------------------------------------

  // 1. OP Number fallback
  if (!header.op_number) {
    const opMatch = fullText.match(
      /(?:N[úu]mero\s+[Dd]a\s+OP|N[º°]?\s*da\s*OP|N[º°]?\s*OP|OP\s*N[º°]?|Ordem\s+de\s+Produ[çc][aã]o\s*(?:N[º°]?)?|OP)\s*[:.-]?\s*([A-Za-z0-9\-./]+)/i,
    )
    if (opMatch && opMatch[1] && !isLabelWord(opMatch[1])) {
      header.op_number = opMatch[1].trim()
    }
  }

  // 2. Order Number (Pedido) fallback - strip leading zeros (e.g. 00013935 -> 13935)
  if (!header.order_number) {
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim()
      if (
        /^(?:.*?\b)?(?:N[º°]?\s*do\s*Pedido|N[º°]?\s*Pedido|Pedido\s*N[º°]?|Pedido|P\.V\.|PV)\b/i.test(
          line,
        )
      ) {
        // Check inline match
        const inlineMatch = line.match(
          /^(?:N[º°]?\s*do\s*Pedido|N[º°]?\s*Pedido|Pedido\s*N[º°]?|Pedido|P\.V\.|PV)\s*[:.-]?\s*([0-9]{3,15}|[A-Za-z0-9\-./]{3,15})/i,
        )
        if (
          inlineMatch &&
          inlineMatch[1] &&
          /[0-9]/.test(inlineMatch[1]) &&
          !isLabelWord(inlineMatch[1])
        ) {
          header.order_number = removeLeadingZeros(inlineMatch[1])
          break
        }

        // Multi-space column matching
        const labelCols = line
          .split(/\s{2,}|\t/)
          .map((c) => c.trim())
          .filter(Boolean)
        const pedidoColIdx = labelCols.findIndex((c) =>
          /^(?:N[º°]?\s*do\s*Pedido|N[º°]?\s*Pedido|Pedido\s*N[º°]?|Pedido|P\.V\.|PV)\b/i.test(c),
        )

        if (pedidoColIdx >= 0) {
          for (let j = i + 1; j < Math.min(allLines.length, i + 4); j++) {
            const nextLine = allLines[j].trim()
            if (!nextLine || isIgnoredLine(nextLine)) continue

            const valCols = nextLine
              .split(/\s{2,}|\t/)
              .map((c) => c.trim())
              .filter(Boolean)
            if (valCols.length > pedidoColIdx) {
              const token = valCols[pedidoColIdx]
              const firstNum = token.split(/\s+/)[0]
              if (firstNum && /[0-9]/.test(firstNum) && !isLabelWord(firstNum)) {
                header.order_number = removeLeadingZeros(firstNum)
                break
              }
            }

            const tokens = nextLine.split(/\s+/)
            if (tokens.length > pedidoColIdx) {
              const t = tokens[pedidoColIdx]
              if (t && /[0-9]/.test(t) && !isLabelWord(t) && /^[0-9A-Za-z\-./]{3,15}$/.test(t)) {
                header.order_number = removeLeadingZeros(t)
                break
              }
            }
          }
        }
        if (header.order_number) break
      }
    }
  }

  // Final regex fallback for order_number
  if (!header.order_number) {
    const pedidoMatch = fullText.match(
      /(?:N[º°]?\s*do\s*Pedido|N[º°]?\s*Pedido|Pedido\s*N[º°]?|Pedido|P\.V\.|PV|Order\s*N[º°]?)\s*[:.-]?\s*([0-9A-Za-z\-./]+)/i,
    )
    if (
      pedidoMatch &&
      pedidoMatch[1] &&
      !isLabelWord(pedidoMatch[1]) &&
      /[0-9]/.test(pedidoMatch[1])
    ) {
      header.order_number = removeLeadingZeros(pedidoMatch[1])
    }
  }

  // 3. Delivery Date (Data / Datas de Entrega) fallback
  if (!header.delivery_date) {
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim()
      if (
        /(?:Datas?\s+(?:de\s+)?Entrega|Dt\.?\s*Entrega|Previs[aã]o\s+(?:de\s+)?Entrega|Prazo\s+(?:de\s+)?Entrega)/i.test(
          line,
        )
      ) {
        const inlineDateMatch = line.match(
          /(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})/,
        )
        if (inlineDateMatch) {
          const d = normalizeDate(inlineDateMatch[1])
          if (d) {
            header.delivery_date = d
            break
          }
        }

        const labelCols = line
          .split(/\s{2,}|\t/)
          .map((c) => c.trim())
          .filter(Boolean)
        const dateColIdx = labelCols.findIndex((c) =>
          /(?:Datas?\s+(?:de\s+)?Entrega|Entrega)/i.test(c),
        )

        for (let j = i + 1; j < Math.min(allLines.length, i + 4); j++) {
          const nextLine = allLines[j].trim()
          if (!nextLine || isIgnoredLine(nextLine)) continue

          if (dateColIdx >= 0) {
            const valCols = nextLine
              .split(/\s{2,}|\t/)
              .map((c) => c.trim())
              .filter(Boolean)
            if (valCols.length > dateColIdx) {
              const dateCandidate = valCols[dateColIdx].match(
                /(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})/,
              )
              if (dateCandidate) {
                const d = normalizeDate(dateCandidate[1])
                if (d) {
                  header.delivery_date = d
                  break
                }
              }
            }
          }

          const dateMatch = nextLine.match(
            /(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})/,
          )
          if (dateMatch) {
            const d = normalizeDate(dateMatch[1])
            if (d) {
              header.delivery_date = d
              break
            }
          }
        }
        if (header.delivery_date) break
      }
    }
  }

  // Delivery date regex fallback
  if (!header.delivery_date) {
    const deliveryMatch = fullText.match(
      /(?:Datas?\s+(?:de\s+)?Entrega|Dt\.?\s*Entrega|Previs[aã]o\s+(?:de\s+)?Entrega|Prazo\s+(?:de\s+)?Entrega|Entrega)\s*[:.-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})/i,
    )
    if (deliveryMatch && deliveryMatch[1]) {
      const d = normalizeDate(deliveryMatch[1])
      if (d) header.delivery_date = d
    }
  }

  // 4. Quantity (Total de Peças / Quantidade) fallback
  // Specific requirement: "Total de Peças" (X ≈ 160) -> 2,0000 -> 2
  if (!header.quantity) {
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim()
      if (
        /(?:Total\s+de\s+Pe[çc]as|Total\s+Pe[çc]as|Quantidade\s*(?:de\s*pe[çc]as)?|Qtd\.?\s*Pe[çc]as)/i.test(
          line,
        )
      ) {
        const inlineQtyMatch = line.match(
          /(?:Total\s+de\s+Pe[çc]as|Total\s+Pe[çc]as|Quantidade\s*(?:de\s*pe[çc]as)?|Qtd\.?\s*Pe[çc]as)\s*[:.-]?\s*(\d+(?:[.,]\d+)?)/i,
        )
        if (inlineQtyMatch && inlineQtyMatch[1]) {
          const q = parseQuantity(inlineQtyMatch[1])
          if (q > 0) {
            header.quantity = q
            break
          }
        }

        const labelCols = line
          .split(/\s{2,}|\t/)
          .map((c) => c.trim())
          .filter(Boolean)
        const totalColIdx = labelCols.findIndex((c) =>
          /Total\s+de\s+Pe[çc]as|Total\s+Pe[çc]as/i.test(c),
        )

        for (let j = i + 1; j < Math.min(allLines.length, i + 3); j++) {
          const nextLine = allLines[j].trim()
          if (!nextLine || isIgnoredLine(nextLine)) continue

          if (totalColIdx >= 0) {
            const valCols = nextLine
              .split(/\s{2,}|\t/)
              .map((c) => c.trim())
              .filter(Boolean)
            if (valCols.length > totalColIdx) {
              const candidate = valCols[totalColIdx].match(/^(\d+(?:[.,]\d+)?)/)
              if (candidate) {
                const q = parseQuantity(candidate[1])
                if (q > 0) {
                  header.quantity = q
                  break
                }
              }
            }
          }

          const numMatch = nextLine.match(/^(\d+(?:[.,]\d+)?)/)
          if (numMatch) {
            const q = parseQuantity(numMatch[1])
            if (q > 0) {
              header.quantity = q
              break
            }
          }
        }
        if (header.quantity) break
      }
    }
  }

  // Regex fallback for quantity
  if (!header.quantity) {
    const qtyMatch = fullText.match(
      /(?:Total\s+de\s+Pe[çc]as|Quantidade\s*(?:de\s*pe[çc]as)?|Qtd\.?\s*(?:de\s*pe[çc]as|pe[çc]as)?|Quant\.?)\s*[:.-]?\s*(\d+(?:[.,]\d+)?)/i,
    )
    if (qtyMatch && qtyMatch[1]) {
      const q = parseQuantity(qtyMatch[1])
      if (q > 0) header.quantity = q
    }
  }

  // 5. Client (Cliente / Razão Social) fallback
  // Strip leading order numbers (e.g. "00013935 " or "13935 ")
  if (!header.client_name) {
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim()
      if (/(?:Cliente|Raz[aã]o\s+Social|Destinat[aá]rio)/i.test(line)) {
        const labelCols = line
          .split(/\s{2,}|\t/)
          .map((c) => c.trim())
          .filter(Boolean)
        const clientColIdx = labelCols.findIndex((c) =>
          /(?:Cliente|Raz[aã]o\s+Social|Destinat[aá]rio)/i.test(c),
        )

        const clientMatch = line.match(
          /(?:Cliente|Raz[aã]o\s+Social|Destinat[aá]rio)\s*[:.-]?\s*(.*)$/i,
        )
        if (clientMatch && clientMatch[1]) {
          const rest = clientMatch[1].trim()
          if (rest && !isLabelWord(rest)) {
            const cleaned = cleanClientName(rest, header.order_number)
            if (cleaned && cleaned.length > 1 && !isLabelWord(cleaned)) {
              header.client_name = cleaned
              break
            }
          }
        }

        for (let j = i + 1; j < Math.min(allLines.length, i + 4); j++) {
          const nextLine = allLines[j].trim()
          if (!nextLine || isIgnoredLine(nextLine)) continue

          if (clientColIdx >= 0) {
            const valCols = nextLine
              .split(/\s{2,}|\t/)
              .map((c) => c.trim())
              .filter(Boolean)
            if (valCols.length > clientColIdx) {
              const rawCol = valCols[clientColIdx]
              const cleaned = cleanClientName(rawCol, header.order_number)
              if (cleaned && cleaned.length > 1 && !isLabelWord(cleaned)) {
                header.client_name = cleaned
                break
              }
            }
          }

          const cleanedLine = cleanClientName(nextLine, header.order_number)
          if (cleanedLine && cleanedLine.length > 1 && !isLabelWord(cleanedLine)) {
            header.client_name = cleanedLine
            break
          }
        }
        if (header.client_name) break
      }
    }
  }

  if (!header.client_name) {
    const clientMatch = fullText.match(
      /(?:Cliente|Raz[aã]o\s+Social|Destinat[aá]rio)\s*[:.-]?\s*([^\n\r;|]+)/i,
    )
    if (clientMatch && clientMatch[1]) {
      const cleaned = cleanClientName(clientMatch[1], header.order_number)
      if (cleaned && cleaned.length > 1 && !isLabelWord(cleaned)) {
        header.client_name = cleaned
      }
    }
  }

  // 6. SKU / Product Code fallback
  if (!header.product_code) {
    const skuMatch = fullText.match(
      /(?:C[oó]digo\s*\(\s*S\.?K\.?U\s*\)|SKU|C[oó]digo\s+(?:do\s+)?Produto|C[oó]d\.?\s*Prod\.?)\s*[:.-]?\s*([A-Za-z0-9\-._/]+)/i,
    )
    if (skuMatch && skuMatch[1] && !isLabelWord(skuMatch[1])) {
      header.product_code = skuMatch[1].trim()
    } else {
      for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i].trim()
        if (/C[oó]digo\s*\(\s*S\.?K\.?U\s*\)/i.test(line)) {
          for (let j = i + 1; j < Math.min(allLines.length, i + 3); j++) {
            const nextLine = allLines[j].trim()
            const token = nextLine.split(/\s+/)[0]
            if (token && !isLabelWord(token) && /^[A-Za-z0-9\-._/]+$/.test(token)) {
              header.product_code = token
              break
            }
          }
          if (header.product_code) break
        }
      }
    }
  }

  // 7. Product Name fallback
  if (!header.product_name) {
    const prodNameMatch = fullText.match(
      /(?:Descri[çc][aã]o\s*(?:do\s+)?S\.?K\.?U\.?|Descri[çc][aã]o\s+(?:do\s+)?Produto|Item\s+Principal|Produto)\s*[:.-]?\s*([^\n\r;|]+)/i,
    )
    if (prodNameMatch && prodNameMatch[1]) {
      const cleaned = prodNameMatch[1]
        .split(
          /(?:Total|Pe[çc]as|Qtd|Quantidade|Data|Datas|Entrega|Setor|Obs|Cliente|Solicita[çc][aã]o|Documento)/i,
        )[0]
        .trim()
      if (cleaned && cleaned.length > 2 && !isLabelWord(cleaned)) {
        header.product_name = cleaned
      }
    } else {
      for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i].trim()
        if (/Descri[çc][aã]o\s*(?:do\s+)?S\.?K\.?U/i.test(line)) {
          for (let j = i + 1; j < Math.min(allLines.length, i + 3); j++) {
            const nextLine = allLines[j].trim()
            if (!nextLine || isLabelWord(nextLine)) continue
            const cleaned = nextLine
              .split(/(?:Total|Pe[çc]as|Qtd|Quantidade|Data|Datas|Entrega|Setor|Obs|Cliente)/i)[0]
              .trim()
            if (cleaned.length > 2) {
              header.product_name = cleaned
              break
            }
          }
          if (header.product_name) break
        }
      }
    }
  }

  // ----------------------------------------------------
  // Component Parsing
  // Primary Strategy: Positional X-coordinate extraction (handles multi-line descriptions and numbers like "REF 4360")
  // Secondary Strategy: Text-line heuristic accumulator fallback (when positionedLines is unavailable)
  // ----------------------------------------------------
  const unitRegexStr = '(?:UN|PC|PÇ|KG|M|MT|MM|CM|M2|M3|PAR|CJ|BARRA|ROLO|L|ML|RL)'
  const unitRegex = new RegExp(`^${unitRegexStr}$`, 'i')

  const isSectorHeader = (line: string): PcpOrderMaterialSector | null => {
    for (const s of sectorKeywords) {
      if (s.regex.test(line)) {
        return s.sector
      }
    }
    return null
  }

  const isTableColumnHeader = (line: string): boolean => {
    return (
      /^(?:#|ITEM|N[º°]|C[ÓO]D|C[ÓO]DIGO)\b/i.test(line) &&
      /DESCRI[CÇ][AÃ]O/i.test(line) &&
      /(?:QTD|QUANTIDADE)/i.test(line)
    )
  }

  const isSectionMarker = (line: string): boolean => {
    return /^(?:OPERA[CÇ][OÕ]ES\s+E\s+SEUS\s+MATERIAIS|MATERIAIS|COMPONENTES|ESTRUTURA|LISTA\s+DE\s+MATERIAIS)/i.test(
      line,
    )
  }

  interface TableBounds {
    codMinX: number
    codMaxX: number
    descMinX: number
    descMaxX: number
    qtdMinX: number
    qtdMaxX: number
    unMinX: number
    unMaxX: number
  }

  let tableBounds: TableBounds | null = null

  // Check if positionedLines has header line: CÓD PRODUTO | DESCRIÇÃO PRODUTO | QTD | UN
  let tableHeaderY: number | null = null

  if (positionedLines && positionedLines.length > 0) {
    for (const pLine of positionedLines) {
      if (!pLine.tokens || pLine.tokens.length === 0) continue

      let codToken: PdfPositionedToken | null = null
      let descToken: PdfPositionedToken | null = null
      let qtdToken: PdfPositionedToken | null = null
      let unToken: PdfPositionedToken | null = null

      for (const tok of pLine.tokens) {
        const str = tok.str
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
        if (/^C[OÓ]D|^ITEM\b/.test(str) && !codToken) {
          codToken = tok
        } else if (/^DESCRI/.test(str) && !descToken) {
          descToken = tok
        } else if (/^QTD|^QUANT/.test(str) && !qtdToken) {
          qtdToken = tok
        } else if (/^UN\b|^UNIDADE\b/.test(str) && !unToken) {
          unToken = tok
        }
      }

      if (descToken && qtdToken) {
        tableHeaderY = pLine.y
        const codX = codToken ? codToken.x : 0
        const descX = descToken.x
        const qtdX = qtdToken.x
        const unX = unToken ? unToken.x : qtdX + 60

        // Column dividers based on detected positions:
        // CÓD PRODUTO column: from codX (or 0) up to just before DESCRIÇÃO
        const codEnd = codToken
          ? Math.max(codToken.x + (codToken.width || 50), (codX + descX) / 2)
          : descX - 10
        // DESCRIÇÃO PRODUTO column ends strictly before the QTD column starts.
        // Any token strictly to the left of (qtdX - 8) is part of description,
        // even if it contains numbers like "REF 4360".
        const descEnd = qtdX - 8
        // QTD column ends before UN column begins:
        const qtdEnd = unToken ? Math.min(unX - 5, (qtdX + unX) / 2) : qtdX + 60
        // UN column ends after the UN token:
        const unEnd = unToken ? unX + (unToken.width || 35) + 35 : qtdEnd + 60

        tableBounds = {
          codMinX: Math.max(0, codX - 30),
          codMaxX: codEnd,
          descMinX: codEnd,
          descMaxX: descEnd,
          qtdMinX: descEnd,
          qtdMaxX: qtdEnd,
          unMinX: qtdEnd,
          unMaxX: unEnd,
        }
        break
      }
    }
  }

  // --- PRIMARY STRATEGY: Strict Coordinate-based extraction ---
  // Using column X bounds (CÓD PRODUTO, DESCRIÇÃO, QTD, UN) guarantees that
  // any number located horizontally inside the DESCRIÇÃO column (such as "4360" in "REF 4360")
  // is strictly treated as description text and NEVER mistaken for quantity.
  // The quantity is read strictly from the QTD column coordinates (where "1.0000" is),
  // and the unit is read from the UN column coordinates (where "PC" is).
  let parsedWithPositions = false

  if (positionedLines && positionedLines.length > 0) {
    interface PosAccumulator {
      sector: PcpOrderMaterialSector
      code: string
      descTokens: { x: number; y: number; str: string }[]
      qty: number
      unit: string
      measurementTokens: string[]
      lastY: number
    }

    let activeComp: PosAccumulator | null = null
    let inPosComponentSection = false

    const flushPosItem = () => {
      if (!activeComp) return

      // Sort desc tokens primarily by line Y descending (top to bottom in PDF coordinate system),
      // then by X ascending (left to right)
      const descTokens = [...activeComp.descTokens]
      descTokens.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 2) {
          return b.y - a.y
        }
        return a.x - b.x
      })

      // Unify full multi-line description into a single string
      const rawDesc = descTokens
        .map((t) => t.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      const measurements = activeComp.measurementTokens.join(' ').replace(/\s+/g, ' ').trim()

      if (rawDesc || activeComp.code) {
        components.push({
          id: `comp_${Date.now()}_${components.length}`,
          sector: activeComp.sector,
          code: activeComp.code,
          description: rawDesc || activeComp.code,
          quantity: activeComp.qty || 1,
          unit: activeComp.unit || 'UN',
          measurements: measurements || undefined,
        })
      }
      activeComp = null
    }

    // Default bounds if header wasn't found explicitly
    const bounds: TableBounds = tableBounds || {
      codMinX: 0,
      codMaxX: 120,
      descMinX: 120,
      descMaxX: 520,
      qtdMinX: 520,
      qtdMaxX: 620,
      unMinX: 620,
      unMaxX: 720,
    }

    for (let i = 0; i < positionedLines.length; i++) {
      const pLine = positionedLines[i]
      const lineStr = pLine.lineStr.trim()
      if (!lineStr || isIgnoredLine(lineStr)) continue

      // If we know the table header Y, any line strictly below the header is candidate
      if (tableHeaderY !== null && pLine.y < tableHeaderY && !inPosComponentSection) {
        inPosComponentSection = true
      }

      // Sector change header (e.g. "FABRICAÇÃO", "MONTAGEM")
      const matchedSector = isSectorHeader(lineStr)
      if (matchedSector) {
        flushPosItem()
        currentSector = matchedSector
        inPosComponentSection = true
        continue
      }

      // Section marker
      if (isSectionMarker(lineStr)) {
        inPosComponentSection = true
        continue
      }

      // Column header line (CÓD PRODUTO | DESCRIÇÃO | QTD | UN)
      if (isTableColumnHeader(lineStr)) {
        flushPosItem()
        inPosComponentSection = true
        continue
      }

      if (!inPosComponentSection) {
        // If not in component section yet, check if line starts with product code in CÓD column
        const startsWithCode = pLine.tokens.some((tok) => {
          return (
            tok.x <= bounds.codMaxX + 20 &&
            /^[A-Za-z0-9\-_./]{4,20}$/.test(tok.str) &&
            !isLabelWord(tok.str)
          )
        })
        if (startsWithCode) {
          inPosComponentSection = true
        } else {
          continue
        }
      }

      // Check footer/stop lines
      if (/^(?:TOTAL\s+GERAL|ASSINATURA\s+RESPONS[AÁ]VEL)\b/i.test(lineStr)) {
        flushPosItem()
        break
      }

      // Classify tokens strictly according to horizontal column bounds (X coordinates)
      const codTokens = pLine.tokens.filter(
        (t) => t.x >= bounds.codMinX - 10 && t.x <= bounds.codMaxX,
      )
      const descTokens = pLine.tokens.filter((t) => t.x > bounds.codMaxX && t.x <= bounds.descMaxX)
      const qtdTokens = pLine.tokens.filter((t) => t.x > bounds.descMaxX && t.x <= bounds.qtdMaxX)
      const unTokens = pLine.tokens.filter((t) => t.x > bounds.qtdMaxX && t.x <= bounds.unMaxX + 40)

      // Check if line contains a measurement directive ("Medida: ...")
      const medidaMatch = lineStr.match(
        /^(?:Medida|Dimens[oõ]es?|Comprimento|Espessura|Largura|Altura|Di[aâ]metro)\s*[:.-]?\s*(.*)$/i,
      )
      if (medidaMatch) {
        const val = medidaMatch[1].trim() || lineStr
        if (activeComp) {
          activeComp.measurementTokens.push(val)
        } else if (components.length > 0) {
          const lastComp = components[components.length - 1]
          lastComp.measurements = lastComp.measurements ? `${lastComp.measurements} ${val}` : val
        }
        continue
      }

      // Candidate product code from CÓD PRODUTO column
      const codCandidate = codTokens
        .map((t) => t.str)
        .join('')
        .trim()
      const isCodValid =
        codCandidate.length >= 3 &&
        /^[A-Za-z0-9\-_./]{3,20}$/.test(codCandidate) &&
        !isLabelWord(codCandidate) &&
        !/^(?:DATA|EMISSAO|PAGINA|TOTAL|ORDEM|CLIENTE|PEDIDO|ENTREGA|RESPONSAVEL|SEPARACAO|PRODUCAO)$/i.test(
          codCandidate,
        )

      // Qty extracted STRICTLY from the QTD column coordinates (e.g. 1.0000 -> 1)
      let qtdValue = 0
      for (const tok of qtdTokens) {
        const cleanTok = tok.str.replace(/[^\d.,]/g, '')
        if (cleanTok && /^\d+(?:[.,]\d+)?$/.test(cleanTok)) {
          const parsed = parseQuantity(cleanTok)
          if (parsed > 0) {
            qtdValue = parsed
            break
          }
        }
      }

      // Unit extracted STRICTLY from the UN column coordinates (e.g. PC, UN)
      let unitValue = ''
      for (const tok of unTokens) {
        const clean = tok.str.toUpperCase().trim()
        if (unitRegex.test(clean)) {
          unitValue = clean
          break
        }
      }

      // Does this line start a NEW component row?
      // A new component row has a valid code in CÓD column, OR a valid quantity in QTD column when no component is active.
      if (isCodValid || (qtdValue > 0 && descTokens.length > 0 && !activeComp)) {
        flushPosItem()

        activeComp = {
          sector: currentSector,
          code: isCodValid ? codCandidate : '',
          descTokens: [...descTokens],
          qty: qtdValue || 1,
          unit: unitValue || 'UN',
          measurementTokens: [],
          lastY: pLine.y,
        }
        continue
      }

      // If we already have an active component:
      if (activeComp) {
        // If this continuation line provides quantity or unit that was missing or default
        if (activeComp.qty <= 1 && qtdValue > 0) {
          activeComp.qty = qtdValue
        }
        if (activeComp.unit === 'UN' && unitValue) {
          activeComp.unit = unitValue
        }

        // Wrap-around description tokens on this line (e.g. "FURO 12mm" on the line below)
        if (descTokens.length > 0) {
          activeComp.descTokens.push(...descTokens)
          activeComp.lastY = pLine.y
          continue
        }

        // Continuation line that falls entirely in the description horizontal span
        const onlyTokensInDescArea = pLine.tokens.every(
          (t) => t.x >= bounds.codMaxX && t.x <= bounds.descMaxX + 50,
        )
        if (onlyTokensInDescArea && pLine.tokens.length > 0) {
          activeComp.descTokens.push(...pLine.tokens)
          activeComp.lastY = pLine.y
          continue
        }
      }
    }

    flushPosItem()

    if (components.length > 0) {
      parsedWithPositions = true
    }
  }

  // --- SECONDARY STRATEGY: Text line accumulator fallback ---
  if (!parsedWithPositions) {
    let inComponentSection = false

    interface ItemAccumulator {
      code: string
      quantity: number
      unit: string
      descriptionLines: string[]
      measurementLines: string[]
      sector: PcpOrderMaterialSector
    }

    let currentItem: ItemAccumulator | null = null

    const flushCurrentItem = () => {
      if (!currentItem) return
      const desc = currentItem.descriptionLines.join(' ').replace(/\s+/g, ' ').trim()
      const measurements = currentItem.measurementLines.join(' ').replace(/\s+/g, ' ').trim()

      if (desc || currentItem.code) {
        components.push({
          id: `comp_${Date.now()}_${components.length}`,
          sector: currentItem.sector,
          code: currentItem.code,
          description: desc || currentItem.code,
          quantity: currentItem.quantity || 1,
          unit: currentItem.unit || 'UN',
          measurements: measurements || undefined,
        })
      }
      currentItem = null
    }

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim()
      if (!line) continue

      // 1. Check Section Marker
      if (isSectionMarker(line)) {
        inComponentSection = true
        continue
      }

      // 2. Check Sector Change
      const matchedSector = isSectorHeader(line)
      if (matchedSector) {
        flushCurrentItem()
        currentSector = matchedSector
        inComponentSection = true
        continue
      }

      // 3. Check Table column headers
      if (isTableColumnHeader(line)) {
        flushCurrentItem()
        inComponentSection = true
        continue
      }

      // If we have not yet entered components / operations section, check if line starts looking like an item
      if (!inComponentSection) {
        const startsLikeItem =
          /^([A-Za-z0-9\-_./]{3,20})\s+(\d+(?:[.,]\d+)?)\s*(?:UN|PC|PÇ|KG|M|MT|MM|CM|M2|M3|PAR|CJ|BARRA|ROLO|L|ML|RL)\b/i.test(
            line,
          ) ||
          /^([A-Za-z0-9\-_./]{3,20})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:UN|PC|PÇ|KG|M|MT|MM|CM|M2|M3|PAR|CJ|BARRA|ROLO|L|ML|RL)?$/i.test(
            line,
          )
        if (startsLikeItem && !isLabelWord(line.split(/\s+/)[0])) {
          inComponentSection = true
        } else {
          continue
        }
      }

      // Skip footer / page / header repeat lines
      if (isIgnoredLine(line)) {
        continue
      }

      // 4. Handle "Medida: ..." lines
      const medidaMatch = line.match(
        /^(?:Medida|Dimens[oõ]es?|Comprimento|Espessura|Largura|Altura|Di[aâ]metro)\s*[:.-]?\s*(.*)$/i,
      )
      if (medidaMatch) {
        const val = medidaMatch[1].trim() || line
        if (currentItem) {
          currentItem.measurementLines.push(val)
        } else if (components.length > 0) {
          const lastComp = components[components.length - 1]
          lastComp.measurements = lastComp.measurements ? `${lastComp.measurements} ${val}` : val
        }
        continue
      }

      // 5. Delimited line (| or ; or tab)
      if (line.includes('|') || line.includes(';') || line.includes('\t')) {
        flushCurrentItem()
        const sep = line.includes('|') ? '|' : line.includes(';') ? ';' : '\t'
        const cols = line
          .split(sep)
          .map((c) => c.trim())
          .filter(Boolean)
        if (cols.length >= 2) {
          let code = ''
          let desc = ''
          let qty = 0
          let unit = 'UN'
          let measurements = ''

          let colStart = 0
          if (/^\d+$/.test(cols[0]) && cols.length >= 3) {
            colStart = 1
          }

          code = cols[colStart] || ''
          desc = cols[colStart + 1] || ''

          for (let c = colStart + 2; c < cols.length; c++) {
            const colVal = cols[c]
            const parsedQ = parseQuantity(colVal)
            if (parsedQ > 0 && qty === 0 && /^[\d.,]+$/.test(colVal.replace(/[a-zA-Z]/g, ''))) {
              qty = parsedQ
            } else if (unitRegex.test(colVal)) {
              unit = colVal.toUpperCase()
            } else if (colVal) {
              measurements = colVal
            }
          }

          if (desc && (code || qty > 0)) {
            components.push({
              id: `comp_${Date.now()}_${components.length}`,
              sector: currentSector,
              code: code.replace(/^#\s*/, ''),
              description: desc,
              quantity: qty || 1,
              unit,
              measurements: measurements || undefined,
            })
            continue
          }
        }
      }

      // 6. Multi-space column line (common in plain text dumps from PDFs)
      // When 2 or more consecutive spaces separate code, description, qty and unit
      const multiSpaceCols = line
        .split(/\s{2,}|\t/)
        .map((c) => c.trim())
        .filter(Boolean)
      if (multiSpaceCols.length >= 3) {
        const firstCol = multiSpaceCols[0]
        const lastCol = multiSpaceCols[multiSpaceCols.length - 1]
        const secondLastCol = multiSpaceCols[multiSpaceCols.length - 2]

        if (/^[A-Za-z0-9\-_./]{3,20}$/.test(firstCol) && !isLabelWord(firstCol)) {
          let colQty = 0
          let colUnit = 'UN'
          let descTokens = multiSpaceCols.slice(1, -2)

          if (unitRegex.test(lastCol) && /^\d+(?:[.,]\d+)?$/.test(secondLastCol)) {
            colQty = parseQuantity(secondLastCol)
            colUnit = lastCol.toUpperCase()
          } else if (/^\d+(?:[.,]\d+)?$/.test(lastCol)) {
            colQty = parseQuantity(lastCol)
            descTokens = multiSpaceCols.slice(1, -1)
          }

          if (colQty > 0) {
            flushCurrentItem()
            components.push({
              id: `comp_${Date.now()}_${components.length}`,
              sector: currentSector,
              code: firstCol,
              description: descTokens.join(' ').trim() || firstCol,
              quantity: colQty,
              unit: colUnit,
            })
            continue
          }
        }
      }

      // 7. Pattern A: Code + Quantity + Unit on the first line (e.g. "14010047  0.28 UN")
      const codeQtyUnitMatch = line.match(
        /^([A-Za-z0-9\-_./]{3,20})\s+(\d+(?:[.,]\d+)?)\s*(UN|PC|PÇ|KG|M|MT|MM|CM|M2|M3|PAR|CJ|BARRA|ROLO|L|ML|RL)\b(?:\s*(.*))?$/i,
      )
      if (codeQtyUnitMatch && !isLabelWord(codeQtyUnitMatch[1])) {
        flushCurrentItem()
        const code = codeQtyUnitMatch[1].trim()
        const qty = parseQuantity(codeQtyUnitMatch[2])
        const unit = codeQtyUnitMatch[3].toUpperCase()
        const inlineTail = codeQtyUnitMatch[4]?.trim()

        currentItem = {
          code,
          quantity: qty,
          unit,
          descriptionLines: inlineTail ? [inlineTail] : [],
          measurementLines: [],
          sector: currentSector,
        }
        continue
      }

      // 8. Pattern B: Full single-line item: Code + Description + Quantity (+ Unit)
      // Anchored strictly at end of line so numbers inside description (like REF 4360) are not matched as quantity.
      // We look for trailing quantity + unit at the end of the line: e.g. " 1.0000 PC"
      const singleLineMatch = line.match(
        /^(?:(\d{1,3})\s+)?([A-Za-z0-9\-_./]{3,20})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(UN|PC|PÇ|KG|M|MT|MM|CM|M2|M3|PAR|CJ|BARRA|ROLO|L|ML|RL)\s*$/i,
      )
      if (
        singleLineMatch &&
        !isLabelWord(singleLineMatch[2]) &&
        !/^(?:DATA|EMISSAO|PAGINA|TOTAL|ORDEM|CLIENTE|PEDIDO|ENTREGA|RESPONSAVEL)$/i.test(
          singleLineMatch[2],
        )
      ) {
        const code = singleLineMatch[2].trim()
        const desc = singleLineMatch[3].trim()
        const qty = parseQuantity(singleLineMatch[4])
        const unit = (singleLineMatch[5] || 'UN').toUpperCase()

        if (desc.length >= 2 && qty > 0) {
          flushCurrentItem()
          // Start an accumulator in case the description continues on subsequent line (e.g. "FURO 12mm")
          currentItem = {
            code,
            quantity: qty,
            unit,
            descriptionLines: [desc],
            measurementLines: [],
            sector: currentSector,
          }
          continue
        }
      }

      // 9. Pattern C: Fallback Code + Description + Qty at exact end of line
      const fallbackMatch = line.match(
        /^([A-Za-z0-9\-_./]{3,15})\s+([A-Za-zÀ-ÿ0-9\s/.,\-Ø#()]+?)\s+(\d+(?:[.,]\d+)?)\s*$/i,
      )
      if (
        fallbackMatch &&
        !isLabelWord(fallbackMatch[1]) &&
        !/^(?:TOTAL|SUBTOTAL|VALOR)$/i.test(fallbackMatch[1])
      ) {
        const code = fallbackMatch[1].trim()
        const desc = fallbackMatch[2].trim()
        const qty = parseQuantity(fallbackMatch[3])
        if (desc.length > 2 && qty > 0) {
          flushCurrentItem()
          components.push({
            id: `comp_${Date.now()}_${components.length}`,
            sector: currentSector,
            code,
            description: desc,
            quantity: qty,
            unit: 'UN',
          })
          continue
        }
      }

      // 10. If we have an active item accumulator and this line is NOT a new code/sector, accumulate it!
      if (currentItem) {
        if (
          /^(?:Medida|Dimens[oõ]es?|Comprimento|Espessura|Largura|Altura|Ø|MT\b|MM\b|CM\b|M2\b)/i.test(
            line,
          )
        ) {
          currentItem.measurementLines.push(line)
        } else {
          currentItem.descriptionLines.push(line)
        }
        continue
      }

      // 11. Secondary accumulator: if no active currentItem but line is a continuation
      const isContinuationLine =
        /^(?:Medida|Dimens[oõ]es?|Comprimento|Espessura|Largura|Altura|Ø|MT\b|MM\b|CM\b)/i.test(
          line,
        ) ||
        (!/^[0-9A-Za-z\-./]{3,20}\s+\d+/i.test(line) &&
          !/^\d{4,15}$/.test(line) &&
          !isLabelWord(line.split(/\s+/)[0]))

      if (
        components.length > 0 &&
        isContinuationLine &&
        !/^(?:SETOR|ETAPA|FASE|TOTAL|SUBTOTAL|EMISSAO|PAGINA)\b/i.test(line)
      ) {
        const lastComp = components[components.length - 1]
        if (
          /^(?:Medida|Dimens[oõ]es?|Comprimento|Espessura|Largura|Altura|Ø|MT\b|MM\b|CM\b)/i.test(
            line,
          )
        ) {
          lastComp.measurements = lastComp.measurements ? `${lastComp.measurements} ${line}` : line
        } else if (!/^(?:DATA|PEDIDO|CLIENTE|SOLICITACAO|DOCUMENTO)/i.test(line)) {
          lastComp.description = `${lastComp.description} ${line}`.replace(/\s+/g, ' ').trim()
        }
        continue
      }

      // 12. Code on this line, desc + qty on next line
      const splitCodeMatch = line.match(/^([A-Za-z0-9\-_./]{3,20})$/)
      if (
        splitCodeMatch &&
        !isLabelWord(splitCodeMatch[1]) &&
        !/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(splitCodeMatch[1])
      ) {
        flushCurrentItem()
        currentItem = {
          code: splitCodeMatch[1].trim(),
          quantity: 1,
          unit: 'UN',
          descriptionLines: [],
          measurementLines: [],
          sector: currentSector,
        }
        continue
      }
    }

    flushCurrentItem()
  }

  return {
    header,
    components,
    rawText: fullText,
    pageCount: 1,
  }
}

export function comparePdfWithCatalog(
  pdfComponents: ExtractedOpComponent[],
  catalogProduct?: Product | null,
): ComponentComparisonRow[] {
  const rows: ComponentComparisonRow[] = []
  const catalogComposition: CompositionItem[] = catalogProduct?.data?.composition || []

  const cleanCode = (c?: string) => (c || '').trim().replace(/^0+/, '').toLowerCase()
  const cleanDesc = (d?: string) => (d || '').trim().toLowerCase()

  const catalogMatched = new Set<string>()

  for (const pdfItem of pdfComponents) {
    const pdfCode = cleanCode(pdfItem.code)
    const pdfDesc = cleanDesc(pdfItem.description)

    let match = catalogComposition.find((cat) => {
      if (catalogMatched.has(cat.id)) return false
      const catCode = cleanCode(cat.code)
      if (pdfCode && catCode && (pdfCode === catCode || pdfItem.code.trim() === cat.code.trim())) {
        return true
      }
      return false
    })

    if (!match && pdfDesc) {
      match = catalogComposition.find((cat) => {
        if (catalogMatched.has(cat.id)) return false
        return cleanDesc(cat.description) === pdfDesc
      })
    }

    if (match) {
      catalogMatched.add(match.id)
      const catQty = parseQuantity(match.quantity)
      const isQtyDiff = Math.abs(pdfItem.quantity - catQty) > 0.0001
      const isDescDiff = cleanDesc(match.description) !== pdfDesc
      const isSectorDiff = match.etapa && normalizeSector(match.etapa) !== pdfItem.sector

      const divergenceReasons: string[] = []
      if (isQtyDiff) divergenceReasons.push(`Qtd ERP (${pdfItem.quantity}) ≠ Catálogo (${catQty})`)
      if (isDescDiff) divergenceReasons.push('Descrição diferente')
      if (isSectorDiff)
        divergenceReasons.push(`Setor ERP (${pdfItem.sector}) ≠ Catálogo (${match.etapa})`)

      const isSame = divergenceReasons.length === 0

      rows.push({
        id: `row_${pdfItem.id}`,
        code: pdfItem.code || match.code,
        sector: pdfItem.sector,
        pdfItem,
        catalogItem: match,
        status: isSame ? 'same' : 'divergent',
        divergenceReasons: isSame ? undefined : divergenceReasons,
        applyToOp: true,
        updateCatalog: false,
        resolvedSector: pdfItem.sector,
        resolvedCode: pdfItem.code || match.code,
        resolvedDescription: pdfItem.description || match.description,
        resolvedQuantity: pdfItem.quantity,
        resolvedUnit: pdfItem.unit || 'UN',
        resolvedMeasurements: pdfItem.measurements || match.measurements || '',
      })
    } else {
      rows.push({
        id: `row_${pdfItem.id}`,
        code: pdfItem.code,
        sector: pdfItem.sector,
        pdfItem,
        catalogItem: undefined,
        status: 'new',
        divergenceReasons: ['Item presente na OP (ERP), mas ausente no Catálogo Técnico'],
        applyToOp: true,
        updateCatalog: false,
        resolvedSector: pdfItem.sector,
        resolvedCode: pdfItem.code,
        resolvedDescription: pdfItem.description,
        resolvedQuantity: pdfItem.quantity,
        resolvedUnit: pdfItem.unit || 'UN',
        resolvedMeasurements: pdfItem.measurements || '',
      })
    }
  }

  for (const catItem of catalogComposition) {
    if (!catalogMatched.has(catItem.id)) {
      const catSector = normalizeSector(catItem.etapa || 'FABRICAÇÃO')
      const catQty = parseQuantity(catItem.quantity)

      rows.push({
        id: `row_cat_${catItem.id}`,
        code: catItem.code,
        sector: catSector,
        pdfItem: undefined,
        catalogItem: catItem,
        status: 'removed',
        divergenceReasons: ['Item presente no Catálogo, mas não constou na OP (ERP)'],
        applyToOp: false,
        updateCatalog: false,
        resolvedSector: catSector,
        resolvedCode: catItem.code,
        resolvedDescription: catItem.description,
        resolvedQuantity: catQty,
        resolvedUnit: 'UN',
        resolvedMeasurements: catItem.measurements || '',
      })
    }
  }

  return rows
}
