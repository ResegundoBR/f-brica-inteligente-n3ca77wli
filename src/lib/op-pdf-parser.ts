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

  const opMatch = fullText.match(
    /(?:N[º°]?\s*da\s*OP|N[º°]?\s*OP|OP\s*N[º°]?|Ordem\s+de\s+Produ[çc][aã]o\s*(?:N[º°]?)?|OP)\s*[:.-]?\s*([A-Za-z0-9\-./]+)/i,
  )
  if (
    opMatch &&
    opMatch[1] &&
    !['DATA', 'CLIENTE', 'PEDIDO', 'PRODUTO'].includes(opMatch[1].toUpperCase())
  ) {
    header.op_number = opMatch[1].trim()
  }

  const pedidoMatch = fullText.match(
    /(?:N[º°]?\s*do\s*Pedido|N[º°]?\s*Pedido|Pedido\s*N[º°]?|Pedido|P\.V\.|PV|Order\s*N[º°]?)\s*[:.-]?\s*([A-Za-z0-9\-./]+)/i,
  )
  if (pedidoMatch && pedidoMatch[1]) {
    header.order_number = pedidoMatch[1].trim()
  }

  const deliveryMatch = fullText.match(
    /(?:Data\s+(?:de\s+)?Entrega|Dt\.?\s*Entrega|Previs[aã]o\s+(?:de\s+)?Entrega|Prazo\s+(?:de\s+)?Entrega|Entrega)\s*[:.-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})/i,
  )
  if (deliveryMatch && deliveryMatch[1]) {
    const d = normalizeDate(deliveryMatch[1])
    if (d) header.delivery_date = d
  }

  const qtyMatch = fullText.match(
    /(?:Quantidade\s*(?:de\s*pe[çc]as)?|Qtd\.?\s*(?:de\s*pe[çc]as|pe[çc]as)?|Quant\.?)\s*[:.-]?\s*(\d+(?:[.,]\d+)?)/i,
  )
  if (qtyMatch && qtyMatch[1]) {
    const q = parseQuantity(qtyMatch[1])
    if (q > 0) header.quantity = q
  }

  const clientMatch = fullText.match(
    /(?:Cliente|Raz[aã]o\s+Social|Destinat[aá]rio)\s*[:.-]?\s*([^\n\r;|]+)/i,
  )
  if (clientMatch && clientMatch[1]) {
    const cleaned = clientMatch[1]
      .split(/(?:CNPJ|CPF|Data|OP|Pedido|Produto|Endere[çc]o|Qtd)/i)[0]
      .trim()
    if (cleaned && cleaned.length > 1) {
      header.client_name = cleaned
    }
  }

  const skuMatch = fullText.match(
    /(?:C[oó]digo\s+(?:do\s+)?Produto|SKU|C[oó]d\.?\s*Prod\.?)\s*[:.-]?\s*([A-Za-z0-9\-._/]+)/i,
  )
  if (skuMatch && skuMatch[1]) {
    header.product_code = skuMatch[1].trim()
  }

  const prodNameMatch = fullText.match(
    /(?:Produto|Descri[çc][aã]o\s+(?:do\s+)?Produto|Item\s+Principal)\s*[:.-]?\s*([^\n\r;|]+)/i,
  )
  if (prodNameMatch && prodNameMatch[1]) {
    const cleaned = prodNameMatch[1]
      .split(/(?:Qtd|Quantidade|Data|Entrega|Setor|Obs|Cliente)/i)[0]
      .trim()
    if (cleaned && cleaned.length > 2) {
      header.product_name = cleaned
    }
  }

  let inComponentSection = false

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim()
    if (!line) continue

    let sectorSwitched = false
    for (const s of sectorKeywords) {
      if (s.regex.test(line)) {
        currentSector = s.sector
        inComponentSection = true
        sectorSwitched = true
        break
      }
    }
    if (sectorSwitched) continue

    if (
      /^(?:#|ITEM|N[º°]|C[ÓO]D|C[ÓO]DIGO)\s+/i.test(line) &&
      /DESCRI[CÇ][AÃ]O/i.test(line) &&
      /(?:QTD|QUANTIDADE)/i.test(line)
    ) {
      inComponentSection = true
      continue
    }

    if (line.includes('|') || line.includes(';') || line.includes('\t')) {
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
          } else if (/^(?:UN|PC|PÇ|KG|M|MM|CM|M2|M3|PAR|CJ|BARRA|ROLO|L|ML)$/i.test(colVal)) {
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
            measurements,
          })
          continue
        }
      }
    }

    const rowMatch = line.match(
      /^(?:(\d{1,3})\s+)?([A-Za-z0-9\-_./]{3,20})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(UN|PC|PÇ|KG|M|MM|CM|M2|PAR|CJ|BARRA|ROLO|L|ML)?(?:\s+(.+))?$/i,
    )

    if (rowMatch) {
      const code = rowMatch[2].trim()
      const desc = rowMatch[3].trim()
      const qty = parseQuantity(rowMatch[4])
      const unit = (rowMatch[5] || 'UN').toUpperCase()
      const measurements = rowMatch[6]?.trim() || ''

      if (
        !/^(?:DATA|EMISSAO|PAGINA|TOTAL|ORDEM|CLIENTE|PEDIDO|ENTREGA|RESPONSAVEL)$/i.test(code) &&
        desc.length >= 2 &&
        qty > 0
      ) {
        components.push({
          id: `comp_${Date.now()}_${components.length}`,
          sector: currentSector,
          code,
          description: desc,
          quantity: qty,
          unit,
          measurements,
        })
        continue
      }
    }

    const fallbackMatch = line.match(
      /^([A-Za-z0-9\-_./]{3,15})\s+([A-Za-zÀ-ÿ0-9\s/.,\-Ø#()]+?)\s+(\d+(?:[.,]\d+)?)\s*$/i,
    )
    if (fallbackMatch && inComponentSection) {
      const code = fallbackMatch[1].trim()
      const desc = fallbackMatch[2].trim()
      const qty = parseQuantity(fallbackMatch[3])
      if (desc.length > 2 && qty > 0 && !/^(?:TOTAL|SUBTOTAL|VALOR)$/i.test(code)) {
        components.push({
          id: `comp_${Date.now()}_${components.length}`,
          sector: currentSector,
          code,
          description: desc,
          quantity: qty,
          unit: 'UN',
        })
      }
    }
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
