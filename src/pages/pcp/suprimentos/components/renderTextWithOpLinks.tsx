import React from 'react'

/**
 * Regex para detectar menções a OPs nos padrões:
 * - "OP 000532/2026"
 * - "OP 000532"
 * - "OP: OP 000532/2026" (captura as partes numéricas)
 * - "OP 1234"
 * - "OP-1234/2026"
 */
const OP_REGEX = /\bOP[\s:-]+([0-9]{3,8}(?:\/[0-9]{2,4})?)\b/gi

export interface RenderTextWithOpLinksOptions {
  onOpenOp?: (opNumber: string) => void
  className?: string
  buttonClassName?: string
}

/**
 * Converte qualquer texto contendo menções a "OP 000532/2026" ou "OP 000532"
 * em nós React onde os números de OP são botões clicáveis inline, estilizados
 * como links interativos que não recarregam nem abrem nova aba.
 *
 * Se onOpenOp não for passado, renderiza apenas o texto sem botões.
 */
export function renderTextWithOpLinks(
  text: string | null | undefined,
  options?: RenderTextWithOpLinksOptions,
): React.ReactNode {
  if (!text) return text ?? ''

  const onOpenOp = options?.onOpenOp
  if (!onOpenOp) {
    return text
  }

  const parts: React.ReactNode[] = []
  let lastIndex = 0

  // Reset regex state
  OP_REGEX.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = OP_REGEX.exec(text)) !== null) {
    const fullMatch = match[0] // ex: "OP 000532/2026"
    const opNumber = match[1] // ex: "000532/2026"
    const matchIndex = match.index

    // Texto antes do match
    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex))
    }

    // Botão interativo para a OP
    parts.push(
      <button
        key={`op-${matchIndex}-${opNumber}`}
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onOpenOp(opNumber)
        }}
        title={`Visualizar OP ${opNumber} em modal`}
        className={
          options?.buttonClassName ||
          'inline-flex items-center font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline underline-offset-2 decoration-blue-400 hover:decoration-blue-700 transition-colors mx-0.5 cursor-pointer text-inherit'
        }
      >
        {fullMatch}
      </button>,
    )

    lastIndex = matchIndex + fullMatch.length
  }

  if (parts.length === 0) {
    return text
  }

  // Restante do texto após o último match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}
