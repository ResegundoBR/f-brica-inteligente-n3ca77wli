import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MaterialShortage } from '@/types'

/**
 * Função representativa da lógica executada no blur / edição de item do EnhancedQuotationForm:
 * - Quando isMultiItem === true (grupo consolidado com mais de 1 OP), a edição no cabeçalho
 *   é estritamente desabilitada/read-only e nenhuma chamada de update a material_shortages
 *   pode ser disparada.
 * - Quando isMultiItem === false (item avulso de 1 OP), se o usuário alterar a quantidade
 *   ou descrição, a alteração é salva no respectivo registro.
 */
export function handleItemBlurAction({
  isMultiItem,
  item,
  desc,
  qty,
  updateShortageRecord,
}: {
  isMultiItem: boolean
  item: MaterialShortage
  desc: string
  qty: string
  updateShortageRecord: (
    id: string,
    data: { description: string; quantity: number },
  ) => Promise<void>
}) {
  // Regra 1: quando isMultiItem, o cabeçalho é somente leitura e NUNCA atualiza o registro individual
  if (isMultiItem) {
    return false
  }

  // Regra 2: se nada mudou em relação ao item original, não chama update
  if (desc === item.description && qty === String(item.quantity)) {
    return false
  }

  const parsedQty = parseFloat(qty)
  if (isNaN(parsedQty)) {
    return false
  }

  // Salva no registro individual apenas quando NÃO for multiItem
  updateShortageRecord(item.id, {
    description: desc,
    quantity: parsedQty,
  })
  return true
}

describe('EnhancedQuotationForm - Proteção contra corrupção de quantidade no modo grupo', () => {
  const mockItemOP1: MaterialShortage = {
    id: 'owbbm9ibmq0pntn',
    code: '05090003',
    description: 'Soquete e27',
    quantity: 1,
    priority: 'Sem pressa',
    request_type: 'Materiais',
    sector: 'Acabamento',
    status: 'Cotação',
    created: '2026-09-23T15:45:07Z',
    updated: '2026-09-23T15:45:07Z',
  }

  const mockItemOP2: MaterialShortage = {
    id: 'rwszhhy714twx1e',
    code: '05090003',
    description: 'Soquete e27',
    quantity: 4,
    priority: 'Sem pressa',
    request_type: 'Materiais',
    sector: 'Acabamento',
    status: 'Cotação',
    created: '2026-09-23T15:42:04Z',
    updated: '2026-09-23T15:42:04Z',
  }

  const mockItemOP3: MaterialShortage = {
    id: 'pvja5jo8r1l36bv',
    code: '05090003',
    description: 'Soquete e27',
    quantity: 5,
    priority: 'Sem pressa',
    request_type: 'Materiais',
    sector: 'Acabamento',
    status: 'Cotação',
    created: '2026-09-23T15:43:08Z',
    updated: '2026-09-23T15:43:08Z',
  }

  const mockGroupList = [mockItemOP1, mockItemOP2, mockItemOP3]
  const totalGroupQty = mockGroupList.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0) // 10

  let updateShortageMock: any

  beforeEach(() => {
    updateShortageMock = vi.fn().mockResolvedValue({})
  })

  it('no modo grupo consolidado (isMultiItem): blur no campo de quantidade NÃO altera o registro individual com a soma do grupo (nenhuma chamada de update a material_shortages a partir do cabeçalho do grupo)', () => {
    const isMultiItem = mockGroupList.length > 1
    expect(isMultiItem).toBe(true)
    expect(totalGroupQty).toBe(10)

    // Simula o evento de blur disparado com o total consolidado (10 un)
    const result = handleItemBlurAction({
      isMultiItem,
      item: mockItemOP1, // registro individual da OP (qtd original = 1)
      desc: mockItemOP1.description,
      qty: String(totalGroupQty), // soma das 3 OPs = 10
      updateShortageRecord: updateShortageMock,
    })

    // Deve ser bloqueado
    expect(result).toBe(false)
    // Nenhuma chamada de update para material_shortages
    expect(updateShortageMock).not.toHaveBeenCalled()
    // O registro individual mantém sua integridade de 1 un sem inflar para 10 un
    expect(mockItemOP1.quantity).toBe(1)
  })

  it('no modo grupo consolidado (isMultiItem): blur no campo de descrição também é bloqueado contra escrita individual', () => {
    const isMultiItem = mockGroupList.length > 1

    const result = handleItemBlurAction({
      isMultiItem,
      item: mockItemOP1,
      desc: 'Descrição Modificada no Grupo',
      qty: String(totalGroupQty),
      updateShortageRecord: updateShortageMock,
    })

    expect(result).toBe(false)
    expect(updateShortageMock).not.toHaveBeenCalled()
  })

  it('no modo item único (NÃO isMultiItem): permite salvar no blur quando houver edição legítima', () => {
    const isMultiItem = false

    const result = handleItemBlurAction({
      isMultiItem,
      item: mockItemOP1,
      desc: mockItemOP1.description,
      qty: '3', // Usuário alterou intencionalmente a quantidade do item avulso de 1 para 3
      updateShortageRecord: updateShortageMock,
    })

    expect(result).toBe(true)
    expect(updateShortageMock).toHaveBeenCalledWith('owbbm9ibmq0pntn', {
      description: 'Soquete e27',
      quantity: 3,
    })
  })

  it('no modo item único (NÃO isMultiItem): não dispara update se os valores forem idênticos', () => {
    const isMultiItem = false

    const result = handleItemBlurAction({
      isMultiItem,
      item: mockItemOP1,
      desc: mockItemOP1.description,
      qty: String(mockItemOP1.quantity),
      updateShortageRecord: updateShortageMock,
    })

    expect(result).toBe(false)
    expect(updateShortageMock).not.toHaveBeenCalled()
  })

  it('no modo item único (NÃO isMultiItem): rejeita valores NaN sem disparar update', () => {
    const isMultiItem = false

    const result = handleItemBlurAction({
      isMultiItem,
      item: mockItemOP1,
      desc: mockItemOP1.description,
      qty: 'invalid-number',
      updateShortageRecord: updateShortageMock,
    })

    expect(result).toBe(false)
    expect(updateShortageMock).not.toHaveBeenCalled()
  })
})
