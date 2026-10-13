/**
 * Utilitário de deserialização segura para dados vindos do PocketBase / Goja.
 * Lida com byte-arrays serializados, strings escapadas recursivamente e objetos normais.
 */
export function safeUnwrapJson<T = unknown>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as T

  let current = raw
  if (typeof current !== 'string') {
    try {
      current = JSON.stringify(current)
    } catch {
      return raw as T
    }
  }

  let loops = 0
  while (loops < 10) {
    loops++
    try {
      const parsed = JSON.parse(current as string)
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'number') {
        // Trata byte array serializado pelo Goja/PB
        let str = ''
        for (let b = 0; b < parsed.length; b += 5000) {
          str += String.fromCharCode.apply(null, parsed.slice(b, b + 5000))
        }
        current = str
      } else if (typeof parsed === 'string') {
        current = parsed
      } else {
        return parsed as T
      }
    } catch {
      return current as unknown as T
    }
  }
  return current as unknown as T
}
