import { describe, it, expect } from 'vitest'
import {
  sanitizeOcPayload,
  calculateOcItemTotal,
  calculateOcGrandTotal,
  UpdateOrdemCompraInput,
} from './ordens-compra'
import { extractFieldErrors, formatDetailedErrorMessage } from '@/lib/pocketbase/errors'

describe('ordens-compra service and payload sanitization', () => {
  it('updateOrdemCompra calculates correctly and accepts valid payload structure', () => {
    // Validação de cálculo do total da OC e dos itens
    const items = [
      {
        id: 'item1',
        description: 'Item 1',
        quantity: 2,
        unit_price: 10,
        st_value: 2,
        ipi_value: 1,
      },
      { description: 'Item 2 Novo', quantity: 5, unit_price: 4, st_value: 0, ipi_value: 0 },
    ]

    const item1Total = calculateOcItemTotal(items[0])
    const item2Total = calculateOcItemTotal(items[1])
    const grandTotal = calculateOcGrandTotal(items)

    expect(item1Total).toBe(23)
    expect(item2Total).toBe(20)
    expect(grandTotal).toBe(43)

    // Validação de estrutura do payload aceito por updateOrdemCompra
    const payload: UpdateOrdemCompraInput = {
      supplier: 'Fornecedor Teste',
      supplier_id: 'sup123',
      expected_date: '2026-05-10 12:00:00.000Z',
      delivery_terms: 'FOB',
      payment_terms: '28 dias',
      delivery_type: 'Retirada',
      total: grandTotal,
      itens: items.map((it) => ({
        ...it,
        total: calculateOcItemTotal(it),
      })),
    }

    const sanitizedHeader = sanitizeOcPayload({
      supplier: payload.supplier,
      supplier_id: payload.supplier_id,
      expected_date: payload.expected_date,
      delivery_terms: payload.delivery_terms,
      payment_terms: payload.payment_terms,
      delivery_type: payload.delivery_type,
      total: payload.total,
    })

    expect(sanitizedHeader.total).toBe(43)
    expect(sanitizedHeader.supplier).toBe('Fornecedor Teste')
    expect(payload.itens).toHaveLength(2)
    expect(payload.itens[0].total).toBe(23)
    expect(payload.itens[1].total).toBe(20)
  })

  it('sanitizeOcPayload removes empty strings, null and undefined, keeping valid numbers, bools, and filled strings', () => {
    const raw = {
      oc_number: '38917',
      supplier: 'Vedamec',
      supplier_id: '',
      expected_date: '   ',
      payment_terms: '30 dias',
      delivery_terms: '',
      delivery_type: 'Entrega',
      total: 22.5,
      user_id: undefined,
      nullableField: null,
      zeroValue: 0,
    }

    const cleaned = sanitizeOcPayload(raw)

    expect(cleaned).toEqual({
      oc_number: '38917',
      supplier: 'Vedamec',
      payment_terms: '30 dias',
      delivery_type: 'Entrega',
      total: 22.5,
      zeroValue: 0,
    })
    expect('expected_date' in cleaned).toBe(false)
    expect('supplier_id' in cleaned).toBe(false)
    expect('delivery_terms' in cleaned).toBe(false)
    expect('user_id' in cleaned).toBe(false)
    expect('nullableField' in cleaned).toBe(false)
  })

  it('formatDetailedErrorMessage formats field-level validation errors into friendly Portuguese', () => {
    const mockPbError = {
      response: {
        message: 'Failed to create record.',
        data: {
          expected_date: { code: 'validation_invalid_date', message: 'Must be a valid datetime.' },
          supplier: { code: 'validation_required', message: 'Value cannot be blank.' },
        },
      },
    }

    const formatted = formatDetailedErrorMessage(mockPbError)
    expect(formatted).toContain('Previsão de Entrega: Data inválida')
    expect(formatted).toContain('Fornecedor: Obrigatório')
  })
})
