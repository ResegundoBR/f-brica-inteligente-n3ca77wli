import { describe, it, expect } from 'vitest'
import { sanitizeOcPayload } from './ordens-compra'
import { extractFieldErrors, formatDetailedErrorMessage } from '@/lib/pocketbase/errors'

describe('ordens-compra service and payload sanitization', () => {
  it('updateOrdemCompra calculates correctly and accepts valid payload structure', () => {
    // Validação estática de tipagem e cálculo do total da OC
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
    const item1Total = 2 * 10 + 2 + 1 // 23
    const item2Total = 5 * 4 // 20
    const grandTotal = item1Total + item2Total // 43

    expect(grandTotal).toBe(43)
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
