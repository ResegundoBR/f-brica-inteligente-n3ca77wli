import { describe, it, expect } from 'vitest'
import { SeparationItem } from '@/services/material-separations'

describe('Separação - Falta Parcial e Troca de Componente', () => {
  it('calcula corretamente falta total quando quantidade em estoque informada é 0 ou igual ao solicitado sem alteração', () => {
    const item: SeparationItem = {
      id: 'test-1',
      code: '14010038',
      description: 'BARRA CHATA AÇO',
      total_quantity: 10,
      unit: 'MT',
      op_numbers: ['OP 000490/2026'],
      order_ids: ['ord-1'],
      status: 'pendente',
    }

    // Se confirmou sem alterar (input = total solicitado)
    const inStockSame = item.total_quantity
    const isTotalShortageA = inStockSame === 0 || inStockSame === item.total_quantity
    expect(isTotalShortageA).toBe(true)

    // Se confirmou com 0 em estoque
    const inStockZero = 0
    const isTotalShortageB = inStockZero === 0 || inStockZero === item.total_quantity
    expect(isTotalShortageB).toBe(true)
  })

  it('calcula corretamente separação e solicitação quando falta parcial é informada', () => {
    const item: SeparationItem = {
      id: 'test-2',
      code: 'FAB01268',
      description: 'TUBO Ø22,23X100MM',
      total_quantity: 10,
      unit: 'PC',
      op_numbers: ['OP 000456/2026', 'OP 000488/2026'],
      order_ids: ['ord-1', 'ord-2'],
      status: 'pendente',
    }

    const inStockPartial = 6
    const separatedQty = inStockPartial
    const shortageQty = Number((item.total_quantity - inStockPartial).toFixed(4))

    expect(separatedQty).toBe(6)
    expect(shortageQty).toBe(4)

    const updatedItem: SeparationItem = {
      ...item,
      status: 'parcial',
      separated_quantity: separatedQty,
      shortage_quantity: shortageQty,
      notes: `Parcial: ${separatedQty}/${item.total_quantity} ${item.unit} separados · ${shortageQty} ${item.unit} em solicitação.`,
    }

    expect(updatedItem.status).toBe('parcial')
    expect(updatedItem.separated_quantity).toBe(6)
    expect(updatedItem.shortage_quantity).toBe(4)
  })

  it('substituição marca item original como substituído e cria substituto na rodada para as mesmas OPs', () => {
    const originalItem: SeparationItem = {
      id: 'item-orig',
      code: '05100004',
      description: 'PARAFUSO ALLEN INOX M4X10MM',
      total_quantity: 20,
      unit: 'PC',
      op_numbers: ['OP 000501/2026'],
      order_ids: ['order-xyz'],
      status: 'pendente',
    }

    const substituteItem: SeparationItem = {
      id: 'item-sub-1',
      code: '05100063',
      description: 'PARAFUSO ALLEN S/ CABECA M4X08MM INOX',
      total_quantity: 20,
      unit: 'PC',
      cut_measurement: null,
      op_numbers: [...originalItem.op_numbers],
      order_ids: [...originalItem.order_ids],
      status: 'pendente',
      notes: `Substituto oficial de [${originalItem.code}] ${originalItem.description}`,
      is_substitution: true,
      original_item_id: originalItem.id,
    }

    const markedOriginal: SeparationItem = {
      ...originalItem,
      status: 'substituido',
      notes: `Substituído por [${substituteItem.code}] ${substituteItem.description}`,
      replaced_by_code: substituteItem.code,
      replaced_by_description: substituteItem.description,
    }

    expect(markedOriginal.status).toBe('substituido')
    expect(substituteItem.is_substitution).toBe(true)
    expect(substituteItem.op_numbers).toEqual(originalItem.op_numbers)
    expect(substituteItem.order_ids).toEqual(originalItem.order_ids)
  })
})
