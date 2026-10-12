import { describe, it, expect } from 'vitest'
import { renderTextWithOpLinks } from './renderTextWithOpLinks'
import React from 'react'

describe('renderTextWithOpLinks', () => {
  it('retorna texto original quando não há callback onOpenOp', () => {
    const text = 'Triagem — ARRUELA BORRACHA (OPs: OP 000532/2026, OP 000533/2026)'
    const result = renderTextWithOpLinks(text)
    expect(result).toBe(text)
  })

  it('retorna texto vazio ou nulo com segurança', () => {
    expect(renderTextWithOpLinks('')).toBe('')
    expect(renderTextWithOpLinks(null)).toBe('')
    expect(renderTextWithOpLinks(undefined)).toBe('')
  })

  it('detecta múltiplas OPs no formato com ano (ex: OP 000532/2026)', () => {
    const text = 'Triagem — ARRUELA (OPs: OP 000532/2026, OP 000533/2026, OP 000536/2026)'
    const opsFound: string[] = []
    const onOpenOp = (op: string) => {
      opsFound.push(op)
    }

    const elements = renderTextWithOpLinks(text, { onOpenOp }) as React.ReactElement[]
    expect(Array.isArray(elements)).toBe(true)

    // Simular o clique nos elementos que são botões
    elements.forEach((el) => {
      if (React.isValidElement(el) && el.type === 'button') {
        ;(el.props as any).onClick({ preventDefault: () => {}, stopPropagation: () => {} })
      }
    })

    expect(opsFound).toEqual(['000532/2026', '000533/2026', '000536/2026'])
  })

  it('detecta OPs no formato simples sem barra (ex: OP 000532)', () => {
    const text = 'Falta do item na OP 000532 e também na OP 12345'
    const opsFound: string[] = []
    const onOpenOp = (op: string) => {
      opsFound.push(op)
    }

    const elements = renderTextWithOpLinks(text, { onOpenOp }) as React.ReactElement[]
    expect(Array.isArray(elements)).toBe(true)

    elements.forEach((el) => {
      if (React.isValidElement(el) && el.type === 'button') {
        ;(el.props as any).onClick({ preventDefault: () => {}, stopPropagation: () => {} })
      }
    })

    expect(opsFound).toEqual(['000532', '12345'])
  })

  it('não altera texto quando não há menções a OP', () => {
    const text = 'Apenas uma descrição de material comum sem ordem'
    const opsFound: string[] = []
    const onOpenOp = (op: string) => {
      opsFound.push(op)
    }

    const result = renderTextWithOpLinks(text, { onOpenOp })
    expect(result).toBe(text)
    expect(opsFound).toHaveLength(0)
  })
})
