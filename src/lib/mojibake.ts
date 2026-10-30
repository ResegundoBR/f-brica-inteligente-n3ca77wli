/**
 * Utilitário para corrigir dupla codificação UTF-8 (mojibake) comum em extrações de PDF e ERPs.
 * Exemplo:
 *   'FIXAÃÇÃO DE TETO EM AÃÃO - ÃØ55MM' -> 'FIXAÇÃO DE TETO EM AÇO - Ø55MM'
 *   'BARRA CHATA AÃÂO' -> 'BARRA CHATA AÇO'
 */

// Mapa manual de pares conhecidos de mojibake (como fallback ou reparo cirúrgico)
const MOJIBAKE_MANUAL_MAP: Array<[RegExp, string]> = [
  // Dupla codificação tripla ou composta (AÃÂO -> AÇO)
  [/ÃÂ/g, 'Ç'],
  [/ÃÂ§/g, 'ç'],
  [/ÃÂ£/g, 'ã'],
  [/ÃÂ©/g, 'é'],
  [/ÃÂ³/g, 'ó'],
  [/ÃÂº/g, 'ú'],
  [/ÃÂ¢/g, 'â'],
  [/ÃÂª/g, 'ê'],
  [/ÃÂ­/g, 'í'],
  [/ÃÂ/g, 'Á'],
  [/ÃÂ/g, 'É'],
  [/ÃÂ/g, 'Ó'],
  [/ÃÂ/g, 'Ú'],
  [/ÃÂ/g, 'Â'],
  [/ÃÂ/g, 'Ê'],
  [/ÃÂ/g, 'Ã'],
  [/ÃÂ/g, 'Õ'],

  // Padrões de dupla codificação direta (latin1 -> utf8)
  // Fixação com duplo c/cedilha: AÃÇÃO -> AÇÃO, AÃÃO -> AÇO, FIXAÃÇÃO -> FIXAÇÃO
  [/AÃÇÃO/g, 'AÇÃO'],
  [/AÃÃO/g, 'AÇO'],
  [/ÃÇÃO/g, 'ÇÃO'],
  [/ÃÃO/g, 'ÇO'],
  [/AÃ§/g, 'Aç'],
  [/Ã§/g, 'ç'],
  [/Ã‡/g, 'Ç'],
  [/Ã\x87/g, 'Ç'], // \u0087
  [/Ã£/g, 'ã'],
  [/Ã/g, 'Ã'],
  [/Ã©/g, 'é'],
  [/Ã‰/g, 'É'],
  [/Ãª/g, 'ê'],
  [/Ã/g, 'Ê'],
  [/Ã¡/g, 'á'],
  [/Ã/g, 'Á'],
  [/Ã /g, 'à'],
  [/Ã/g, 'À'],
  [/Ã¢/g, 'â'],
  [/Ã/g, 'Â'],
  [/Ã­/g, 'í'],
  [/Ã/g, 'Í'],
  [/Ã³/g, 'ó'],
  [/Ã/g, 'Ó'],
  [/Ãµ/g, 'õ'],
  [/Ã/g, 'Õ'],
  [/Ã´/g, 'ô'],
  [/Ã/g, 'Ô'],
  [/Ãº/g, 'ú'],
  [/Ã/g, 'Ú'],
  [/Ã¼/g, 'ü'],
  [/Ã/g, 'Ü'],
  // Símbolo de diâmetro Ø (\u00D8) quando duplamente codificado: C3 98 -> Ã\x98 ou ÃØ
  [/Ã\x98/g, 'Ø'],
  [/ÃØ/g, 'Ø'],
  [/Ã¸/g, 'ø'],
  [/Ã\xBA/g, 'º'],
  [/Ãº/g, 'º'], // Quando usado como ordinal ou u com acento
  [/Ã\xAA/g, 'ª'],
  [/Ãª/g, 'ê'],
]

/**
 * Tenta redecodificar uma string codificada como UTF-8 mas interpretada como Latin-1 (ISO-8859-1).
 */
function tryUtf8Redecode(text: string): string | null {
  try {
    const bytes = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      if (code > 255) {
        // Contém caractere fora da faixa de bytes latin1, não é pura representação byte-a-byte
        return null
      }
      bytes[i] = code
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return decoded
  } catch {
    return null
  }
}

/**
 * Remove e corrige artefatos de mojibake (dupla codificação UTF-8) de strings.
 * Seguro para strings que já estão corretas (não altera).
 */
export function fixMojibake(text?: string | null): string {
  if (!text) return ''

  let str = String(text)

  // Se não contiver caracteres típicos de mojibake ('Ã', 'Â', etc.), retorna direto
  if (!/[ÃÂ]/.test(str)) {
    return str
  }

  // 1. Tentar redecodificação UTF-8 automática se a sequência de bytes for válida
  // Fazemos isso recursivamente até 2 níveis (para casos de dupla ou tripla codificação)
  for (let pass = 0; pass < 2; pass++) {
    if (!/[ÃÂ]/.test(str)) break
    const redecoded = tryUtf8Redecode(str)
    if (redecoded && redecoded !== str) {
      str = redecoded
    } else {
      break
    }
  }

  // 2. Aplicar mapa de substituição manual para quaisquer sequências residuais que falharam na redecodificação
  for (const [regex, replacement] of MOJIBAKE_MANUAL_MAP) {
    str = str.replace(regex, replacement)
  }

  // Normalização de diâmetro com acento ou letra espúria (ex: 'ÃØ' ou 'Ã 55MM')
  str = str.replace(/Ã(?=Ø)/g, '')

  return str
}
