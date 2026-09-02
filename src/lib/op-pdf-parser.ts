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

export async function extractTextFromPdfFile(
  file: File,
): Promise<{ text: string; pages: string[][]; pageCount: number }> {
  const pdfjs = await getPdfjs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise

  const pagesText: string[][] = []
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
    for (const bucket of lineBuckets) {
      bucket.items.sort((a, b) => a.transform[4] - b.transform[4])
      const lineStr = bucket.items
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (lineStr) {
        pageLines.push(lineStr)
        fullText += lineStr + '\n'
      }
    }
    pagesText.push(pageLines)
  }

  return { text: fullText, pages: pagesText, pageCount: pdf.numPages }
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
  if (typeof raw === 'number') return raw
  if (!raw) return 0
  const clean = String(raw).trim()
  if (clean.includes(',') && clean.includes('.')) {
    const standard = clean.replace(/\./g, '').replace(',', '.')
    const parsed = parseFloat(standard)
    return isNaN(parsed) ? 0 : parsed
  }
  if (clean.includes(',')) {
    const parsed = parseFloat(clean.replace(',', '.'))
    return isNaN(parsed) ? 0 : parsed
  }
  const parsed = parseFloat(clean)
  return isNaN(parsed) ? 0 : parsed
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

function cleanClientName(raw: string, knownOrderNumber?: string): string {
  let cleaned = raw.trim()
  if (knownOrderNumber && cleaned.startsWith(knownOrderNumber)) {
    cleaned = cleaned.substring(knownOrderNumber.length).trim()
  }
  // Remove leading numbers / order numbers like "00013935 "
  cleaned = cleaned.replace(/^\d{4,12}\s+/, '')
  // Cut off at trailing label keywords if any were swallowed
  cleaned = cleaned
    .split(
      /(?:CNPJ|CPF|Data|Datas|OP|Pedido|Produto|C[oó]digo|Descri[çc][aã]o|Endere[çc]o|Qtd|Total|Solicita[çc][aã]o|Documento)/i,
    )[0]
    .trim()
  return cleaned
}

export function parseOpPdfDeterministic(allLines: string[]): ParsedOpPdfResult {
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

  // 1. OP Number
  const opMatch = fullText.match(
    /(?:N[úu]mero\s+[Dd]a\s+OP|N[º°]?\s*da\s*OP|N[º°]?\s*OP|OP\s*N[º°]?|Ordem\s+de\s+Produ[çc][aã]o\s*(?:N[º°]?)?|OP)\s*[:.-]?\s*([A-Za-z0-9\-./]+)/i,
  )
  if (opMatch && opMatch[1] && !isLabelWord(opMatch[1])) {
    header.op_number = opMatch[1].trim()
  }

  // 2. Order Number (Pedido)
  // Look for inline label: "Pedido: 00013935" or "Pedido\n00013935" or multi-column "Pedido  Cliente\n00013935  EDILSON VIANA"
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim()
    const match = line.match(
      /^(?:N[º°]?\s*do\s*Pedido|N[º°]?\s*Pedido|Pedido\s*N[º°]?|Pedido|P\.V\.|PV|Order\s*N[º°]?)\s*[:.-]?\s*(.*)$/i,
    )
    if (match) {
      const rest = match[1].trim()
      const firstToken = rest.split(/\s+/)[0]
      if (firstToken && !isLabelWord(firstToken) && /[0-9]/.test(firstToken)) {
        header.order_number = firstToken
        break
      }

      // If rest is just label or empty, check the next line(s)
      for (let j = i + 1; j < Math.min(allLines.length, i + 4); j++) {
        const nextLine = allLines[j].trim()
        if (!nextLine) continue
        const tokens = nextLine.split(/\s+/)
        // Find first token that is numeric or looks like an order code (and not a label)
        const possibleOrder = tokens.find(
          (t) => /^[A-Za-z0-9\-_./]{3,15}$/.test(t) && /[0-9]/.test(t) && !isLabelWord(t),
        )
        if (possibleOrder) {
          header.order_number = possibleOrder
          break
        }
      }
      if (header.order_number) break
    }
  }

  // Fallback for order_number in fullText if not yet captured
  if (!header.order_number) {
    const pedidoMatch = fullText.match(
      /(?:N[º°]?\s*do\s*Pedido|N[º°]?\s*Pedido|Pedido\s*N[º°]?|Pedido|P\.V\.|PV|Order\s*N[º°]?)\s*[:.-]?\s*([0-9A-Za-z\-./]+)/i,
    )
    if (pedidoMatch && pedidoMatch[1] && !isLabelWord(pedidoMatch[1])) {
      header.order_number = pedidoMatch[1].trim()
    }
  }

  // 3. Delivery Date (Data / Datas de Entrega)
  const deliveryMatch = fullText.match(
    /(?:Datas?\s+(?:de\s+)?Entrega|Dt\.?\s*Entrega|Previs[aã]o\s+(?:de\s+)?Entrega|Prazo\s+(?:de\s+)?Entrega|Entrega)\s*[:.-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})/i,
  )
  if (deliveryMatch && deliveryMatch[1]) {
    const d = normalizeDate(deliveryMatch[1])
    if (d) header.delivery_date = d
  } else {
    // Check line under "Datas de Entrega"
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim()
      if (/Datas?\s+(?:de\s+)?Entrega/i.test(line)) {
        for (let j = i + 1; j < Math.min(allLines.length, i + 4); j++) {
          const nextLine = allLines[j].trim()
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

  // 4. Quantity (Total de Peças / Quantidade)
  const qtyMatch = fullText.match(
    /(?:Total\s+de\s+Pe[çc]as|Quantidade\s*(?:de\s*pe[çc]as)?|Qtd\.?\s*(?:de\s*pe[çc]as|pe[çc]as)?|Quant\.?)\s*[:.-]?\s*(\d+(?:[.,]\d+)?)/i,
  )
  if (qtyMatch && qtyMatch[1]) {
    const q = parseQuantity(qtyMatch[1])
    if (q > 0) header.quantity = q
  } else {
    // Check next line after "Total de Peças"
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim()
      if (/Total\s+de\s+Pe[çc]as/i.test(line)) {
        for (let j = i + 1; j < Math.min(allLines.length, i + 3); j++) {
          const nextLine = allLines[j].trim()
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

  // 5. Client (Cliente / Razão Social)
  // Handle layout where "Pedido   Cliente" are on line A and "00013935   EDILSON VIANA" on line B
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim()
    const clientMatch = line.match(
      /(?:Cliente|Raz[aã]o\s+Social|Destinat[aá]rio)\s*[:.-]?\s*(.*)$/i,
    )
    if (clientMatch) {
      const rest = clientMatch[1].trim()
      if (rest && !isLabelWord(rest)) {
        const cleaned = cleanClientName(rest, header.order_number)
        if (cleaned && cleaned.length > 1) {
          header.client_name = cleaned
          break
        }
      }

      // If inline was empty or another label, look at next line
      for (let j = i + 1; j < Math.min(allLines.length, i + 4); j++) {
        const nextLine = allLines[j].trim()
        if (!nextLine) continue
        // If the next line has order number and name (e.g. "00013935 EDILSON VIANA")
        const cleaned = cleanClientName(nextLine, header.order_number)
        if (cleaned && cleaned.length > 1 && !isLabelWord(cleaned)) {
          header.client_name = cleaned
          break
        }
      }
      if (header.client_name) break
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

  // 6. SKU / Product Code
  const skuMatch = fullText.match(
    /(?:C[oó]digo\s*\(\s*S\.?K\.?U\s*\)|SKU|C[oó]digo\s+(?:do\s+)?Produto|C[oó]d\.?\s*Prod\.?)\s*[:.-]?\s*([A-Za-z0-9\-._/]+)/i,
  )
  if (skuMatch && skuMatch[1] && !isLabelWord(skuMatch[1])) {
    header.product_code = skuMatch[1].trim()
  } else {
    // Check line under "Código(S.K.U)"
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

  // 7. Product Name (Descrição S.K.U / Produto)
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
    // Check line under "Descrição S.K.U"
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

  // ----------------------------------------------------
  // Component Parsing (Multi-line and Single-line accumulator)
  // ----------------------------------------------------
  let inComponentSection = false

  const unitRegexStr = '(?:UN|PC|PÇ|KG|M|MT|MM|CM|M2|M3|PAR|CJ|BARRA|ROLO|L|ML|RL)'
  const unitRegex = new RegExp(`^${unitRegexStr}$`, 'i')

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
      /^(?:#|ITEM|N[º°]|C[ÓO]D|C[ÓO]DIGO)\s+/i.test(line) &&
      /DESCRI[CÇ][AÃ]O/i.test(line) &&
      /(?:QTD|QUANTIDADE)/i.test(line)
    )
  }

  const isSectionMarker = (line: string): boolean => {
    return /^(?:OPERA[CÇ][OÕ]ES\s+E\s+SEUS\s+MATERIAIS|MATERIAIS|COMPONENTES|ESTRUTURA|LISTA\s+DE\s+MATERIAIS)/i.test(
      line,
    )
  }

  const isIgnoredLine = (line: string): boolean => {
    return (
      /^(?:P[áa]gina\s+\d+|Emiss[aã]o:|Data\/Hora\s+Emiss[aã]o|Obs:|Solicita[çc][aã]o\s+de\s+Materiais|Documento\s+de\s+Estoque)/i.test(
        line,
      ) ||
      /^_{3,}/.test(line) ||
      /^-{3,}/.test(line)
    )
  }

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim()
    if (!line) continue

    // 1. Check Section Marker
    if (isSectionMarker(line)) {
      inComponentSection = true
      continue
    }

    // 2. Check Sector Change (e.g. FABRICAÇÃO, PREPARAÇÃO, MONTAGEM, EXPEDIÇÃO)
    const matchedSector = isSectorHeader(line)
    if (matchedSector) {
      flushCurrentItem()
      currentSector = matchedSector
      inComponentSection = true
      continue
    }

    // 3. Check Table column headers (CÓDIGO DESCRIÇÃO QTD UN...)
    if (isTableColumnHeader(line)) {
      flushCurrentItem()
      inComponentSection = true
      continue
    }

    // If we have not yet entered components / operations section, check if line starts looking like an item
    if (!inComponentSection) {
      // If we encounter a line with code + qty + unit or pipe/tab delimited, activate inComponentSection
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

    // 4. Handle "Medida: ..." or "Medida ..." lines
    const medidaMatch = line.match(
      /^(?:Medida|Dimens[oõ]es?|Comprimento|Espessura)\s*[:.-]?\s*(.*)$/i,
    )
    if (medidaMatch) {
      const val = medidaMatch[1].trim() || line
      if (currentItem) {
        currentItem.measurementLines.push(val)
      } else if (components.length > 0) {
        // Attach to previous completed component if currentItem was already flushed
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

    // 6. Pattern A: Code + Quantity + Unit on the first line (e.g. "14010047  0.28 UN" or "05310219  4 PC")
    // Note: description or measure follows on next lines!
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

    // 7. Pattern B: Full single-line item: Code + Description + Quantity (+ Unit) (+ Measurements)
    const singleLineMatch = line.match(
      /^(?:(\d{1,3})\s+)?([A-Za-z0-9\-_./]{3,20})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(UN|PC|PÇ|KG|M|MT|MM|CM|M2|M3|PAR|CJ|BARRA|ROLO|L|ML|RL)?(?:\s+(.+))?$/i,
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
      const measurements = singleLineMatch[6]?.trim() || ''

      if (desc.length >= 2 && qty > 0) {
        flushCurrentItem()
        components.push({
          id: `comp_${Date.now()}_${components.length}`,
          sector: currentSector,
          code,
          description: desc,
          quantity: qty,
          unit,
          measurements: measurements || undefined,
        })
        continue
      }
    }

    // 8. Pattern C: Fallback Code + Description + Qty (no unit, or numeric code)
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

    // 9. If we have an active item accumulator and this line is NOT a new code/sector, accumulate it!
    if (currentItem) {
      // Check if line looks like a measurement line
      if (/^(?:Medida|Dimens[oõ]es?|Comprimento|Espessura|Ø|MT|MM|CM)\b/i.test(line)) {
        currentItem.measurementLines.push(line)
      } else {
        currentItem.descriptionLines.push(line)
      }
      continue
    }

    // 10. If not in currentItem, but previous line was just code and this line has desc + qty
    // (e.g. Line 1: 05310219, Line 2: BUCHA EM AÇO... 4 PC)
    const splitCodeMatch = line.match(/^([A-Za-z0-9\-_./]{3,20})$/)
    if (splitCodeMatch && !isLabelWord(splitCodeMatch[1])) {
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

  // Flush any lingering item
  flushCurrentItem()

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
