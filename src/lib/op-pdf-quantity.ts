import type { PdfPositionedLine } from './op-pdf-parser'

/**
 * Extração da QUANTIDADE A PRODUZIR priorizando a linha EXATA do rótulo "Total de Peças".
 *
 * Correção do bug do talão real OP 000637/2026 (talaoop-f4452.pdf): o rótulo vale 1.0000
 * (uma unidade), mas o importador preenchia 12 — capturando o "12" da data de entrega
 * "14/12/2026" ou token vizinho do cabeçalho.
 *
 * Estratégia (em ordem de confiança):
 *  1. Rótulo + número na MESMA linha (inline).
 *  2. Posicional: token numérico na coluna do rótulo EXATO "Total de Peças" (tokens
 *     "Total" + "de" + "Peças" concatenados), nas linhas imediatamente abaixo.
 *  3. Texto: número no início das linhas abaixo da linha do rótulo.
 *
 * Regras de rejeição (anti-falso-positivo):
 *  - Nunca aceita token/linha com formato de data (dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd,
 *    inclusive com espaços: "22 / 09 / 2026") ou fragmento de data ("12/2026", "14/").
 *  - Nunca aceita token contendo "/" (número de pedido, numeração, fragmento de data).
 *  - Desempate: prefere o formato ERP com 4 decimais ("1.0000" / "2,0000") — é o formato
 *    em que o ERP imprime o Total de Peças; depois menor distância do rótulo; depois
 *    menor valor.
 */

const TOTAL_PECAS_LABEL = /total\s+de\s+pe[çc]as|total\s+pe[çc]as/i
const ERP_DECIMAL_FORMAT = /^\d{1,6}[.,]\d{4}$/
const NUMBER_AT_START = /^(\d{1,6}(?:[.,]\d{1,4})?)(?![\d/])/
const DATE_AT_LINE_START = /^\s*\d{1,2}\s*[/.-]\s*\d{1,2}/

interface QtyCandidate {
  value: number
  source: 'inline' | 'column' | 'line-below'
  lineDistance: number
  erpFormat: boolean
}

/** Reconhece datas no texto do cabeçalho (dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd, com espaços). */
export function isDateLikeHeaderValue(raw: string): boolean {
  const t = (raw || '').trim()
  if (!t) return false
  if (/\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}/.test(t)) return true
  if (/\d{4}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{1,2}/.test(t)) return true
  return false
}

function parseNumberSafe(raw: string): number {
  const clean = (raw || '').trim().replace(',', '.')
  const n = parseFloat(clean)
  if (isNaN(n) || n <= 0) return 0
  return Math.round(n * 10000) / 10000
}

export function extractTotalPecasQuantity(
  allLines: string[],
  positionedLines?: PdfPositionedLine[],
): number {
  const candidates: QtyCandidate[] = []
  const push = (source: QtyCandidate['source'], raw: string, lineDistance: number) => {
    const value = parseNumberSafe(raw)
    if (value <= 0) return
    if (isDateLikeHeaderValue(raw)) return
    candidates.push({
      value,
      source,
      lineDistance,
      erpFormat: ERP_DECIMAL_FORMAT.test(raw.trim()),
    })
  }

  // (1) Rótulo + valor na MESMA linha: "Total de Peças: 1.0000"
  for (const line of allLines) {
    const m = line.match(TOTAL_PECAS_LABEL)
    if (!m) continue
    const after = line.slice((m.index ?? 0) + m[0].length)
    const num = after.match(/^\s*[:.-]?\s*/)
    const rest = after.slice(num ? num[0].length : 0)
    const inline = rest.match(NUMBER_AT_START)
    if (inline && !inline[1].includes('/')) push('inline', inline[1], 0)
  }

  // (2) Posicional: coluna do rótulo EXATO "Total de Peças" nas linhas abaixo
  if (positionedLines && positionedLines.length > 0) {
    for (let i = 0; i < positionedLines.length; i++) {
      const pLine = positionedLines[i]
      for (let t = 0; t < pLine.tokens.length; t++) {
        if (!/^total$/i.test(pLine.tokens[t].str.trim())) continue
        // Só aceita o rótulo completo "Total de Peças" (com "de" opcional + "Peças")
        let endT = t
        const minX = pLine.tokens[t].x
        let maxX = pLine.tokens[t].x + (pLine.tokens[t].width || 30)
        if (t + 1 < pLine.tokens.length && /^pe[çc]as$/i.test(pLine.tokens[t + 1].str.trim())) {
          endT = t + 1
          maxX = pLine.tokens[t + 1].x + (pLine.tokens[t + 1].width || 35)
        } else if (
          t + 2 < pLine.tokens.length &&
          /^de$/i.test(pLine.tokens[t + 1].str.trim()) &&
          /^pe[çc]as$/i.test(pLine.tokens[t + 2].str.trim())
        ) {
          endT = t + 2
          maxX = pLine.tokens[t + 2].x + (pLine.tokens[t + 2].width || 35)
        }
        if (endT === t) continue // "Total" sozinho não é o rótulo exato

        for (let j = i + 1; j <= Math.min(positionedLines.length - 1, i + 4); j++) {
          const vLine = positionedLines[j]
          if (!vLine.tokens.length) continue
          for (const tok of vLine.tokens) {
            const s = tok.str.trim()
            if (!/^\d/.test(s)) continue
            if (s.includes('/')) continue // fragmento de data ou numeração
            if (isDateLikeHeaderValue(s)) continue
            const center = tok.x + (tok.width || 0) / 2
            // Centro do token precisa cair na coluna do rótulo (tolerância apertada)
            if (center < minX - 20 || center > maxX + 25) continue
            push('column', s, j - i)
          }
        }
      }
    }
  }

  // (3) Texto: tokens numéricos nas linhas abaixo da linha do rótulo.
  // Remove primeiro padrões de data (inclusive espaçados: "22 / 09 / 2026") para que
  // fragmentos "22", "09" não virem candidatos; rejeita numerações com zeros à esquerda
  // (números de documento/pedido do ERP, ex. "00013935", "000637/2026").
  const DATE_SPACED =
    /\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}|\d{4}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{1,2}/g
  for (let i = 0; i < allLines.length; i++) {
    if (!TOTAL_PECAS_LABEL.test(allLines[i])) continue
    for (let j = i + 1; j <= Math.min(allLines.length - 1, i + 3); j++) {
      const l = allLines[j].trim()
      if (!l) continue
      // Linha de data pura: pula. Linha com data + valor (ex. "22 / 09 / 2026 1.0000")
      // continua: a data é removida abaixo antes da varredura de tokens.
      const sanitized = l.replace(DATE_SPACED, ' ')
      for (const rawTok of sanitized.split(/\s+/)) {
        const tok = rawTok.trim()
        if (!tok) continue
        if (tok.includes('/')) continue
        if (/^0{2,}\d/.test(tok)) continue // numeração de documento (00013935, 000637...)
        if (!/^\d{1,6}(?:[.,]\d{1,4})?$/.test(tok)) continue
        push('line-below', tok, j - i)
      }
    }
  }

  if (candidates.length === 0) return 0

  // Validação cruzada: entre candidatos confiáveis, prefere formato ERP (4 decimais),
  // depois proximidade do rótulo, depois o menor valor.
  candidates.sort((a, b) => {
    if (a.erpFormat !== b.erpFormat) return a.erpFormat ? -1 : 1
    if (a.lineDistance !== b.lineDistance) return a.lineDistance - b.lineDistance
    return a.value - b.value
  })
  return candidates[0].value
}
