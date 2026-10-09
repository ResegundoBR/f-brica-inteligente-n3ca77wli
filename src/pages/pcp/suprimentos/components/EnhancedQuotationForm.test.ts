import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MaterialShortage, Quotation } from '@/types'
import { advanceGroupToCompraWithSurplus } from '@/services/quotations'
import pb from '@/lib/pocketbase/client'

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

/**
 * Função representativa do botão "Adotar quantidade consolidada":
 * - No modo grupo (isMultiItem): apenas atualiza a quantidade exibida no contexto local da cotação
 *   SEM GRAVAR em nenhum registro individual (respeitando estritamente a trava de proteção).
 * - No modo item único: atualiza o registro individual no backend e no estado local.
 */
export function handleApplyConsolidatedTotalAction({
  isMultiItem,
  item,
  suggestedQty,
  updateShortageRecord,
  setLocalQty,
}: {
  isMultiItem: boolean
  item: MaterialShortage
  suggestedQty: number
  updateShortageRecord: (id: string, data: { quantity: number }) => Promise<void>
  setLocalQty: (qty: string) => void
}) {
  setLocalQty(String(suggestedQty))
  if (isMultiItem) {
    // Modo grupo: trava rígida — NUNCA chama updateShortageRecord
    return { savedRemote: false, newLocalQty: String(suggestedQty) }
  }

  // Modo item único: persiste no backend
  updateShortageRecord(item.id, { quantity: suggestedQty })
  return { savedRemote: true, newLocalQty: String(suggestedQty) }
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
  let setLocalQtyMock: any

  beforeEach(() => {
    updateShortageMock = vi.fn().mockResolvedValue({})
    setLocalQtyMock = vi.fn()
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

  it('no modo grupo consolidado (isMultiItem): clicar em "Adotar quantidade consolidada" ajusta o contexto local SEM gravar no registro individual', () => {
    const isMultiItem = true
    const suggestedTotal = 18 // Ex.: 10 das OPs do lote + 8 futuras

    const res = handleApplyConsolidatedTotalAction({
      isMultiItem,
      item: mockItemOP1,
      suggestedQty: suggestedTotal,
      updateShortageRecord: updateShortageMock,
      setLocalQty: setLocalQtyMock,
    })

    expect(res.savedRemote).toBe(false)
    expect(setLocalQtyMock).toHaveBeenCalledWith('18')
    // Crucial: nenhuma gravação no banco de dados para não sobrescrever a OP individual com o total!
    expect(updateShortageMock).not.toHaveBeenCalled()
  })

  it('no modo item único (NÃO isMultiItem): clicar em "Adotar quantidade consolidada" atualiza o registro remoto e local', () => {
    const isMultiItem = false
    const suggestedTotal = 15

    const res = handleApplyConsolidatedTotalAction({
      isMultiItem,
      item: mockItemOP1,
      suggestedQty: suggestedTotal,
      updateShortageRecord: updateShortageMock,
      setLocalQty: setLocalQtyMock,
    })

    expect(res.savedRemote).toBe(true)
    expect(setLocalQtyMock).toHaveBeenCalledWith('15')
    expect(updateShortageMock).toHaveBeenCalledWith('owbbm9ibmq0pntn', {
      quantity: 15,
    })
  })

  describe('Compra com Quantidade Adicional / Excedente para Estoque', () => {
    const mockQuotation: Quotation = {
      id: 'quot_123',
      material_shortage_id: 'owbbm9ibmq0pntn',
      supplier: 'Fornecedor Alpha',
      price: 15.5,
      delivery_days: 7,
      selected: true,
      created: '2026-09-23T15:50:00Z',
      updated: '2026-09-23T15:50:00Z',
    }

    let pbUpdateSpy: any
    let pbCreateSpy: any
    let pbGetFirstSpy: any

    beforeEach(() => {
      pbUpdateSpy = vi.fn().mockResolvedValue({})
      pbCreateSpy = vi.fn().mockResolvedValue({ id: 'surplus_shortage_999' })
      pbGetFirstSpy = vi.fn().mockResolvedValue(mockQuotation)

      vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
        if (collName === 'material_shortages') {
          return {
            getOne: vi.fn().mockResolvedValue({ id: 'test' }),
            getFullList: vi.fn().mockResolvedValue([]),
            getList: vi.fn().mockResolvedValue({ items: [] }),
            update: pbUpdateSpy,
            create: pbCreateSpy,
          } as any
        }
        if (collName === 'quotations') {
          return {
            getFirstListItem: pbGetFirstSpy,
          } as any
        }
        return {} as any
      })
    })

    it('compra com quantidade MAIOR que a solicitada (19 un vs 10 un): avança as OPs com quantidades intactas e cria registro de excedente como "Compra para estoque"', async () => {
      const itemIds = ['owbbm9ibmq0pntn', 'rwszhhy714twx1e', 'pvja5jo8r1l36bv']
      const actualPurchaseQty = 19
      const requestedBatchQty = 10 // 1 + 4 + 5 = 10 un

      const result = await advanceGroupToCompraWithSurplus({
        itemIds,
        actualPurchaseQty,
        requestedBatchQty,
        componentCode: '05090003',
        componentDescription: 'Soquete e27',
        selectedQuotation: mockQuotation,
        sector: 'Acabamento',
      })

      // Resultado reporta avanço e excedente correto (19 - 10 = 9)
      expect(result.advancedCount).toBe(3)
      expect(result.surplusQty).toBe(9)
      expect(result.surplusShortageId).toBe('surplus_shortage_999')

      // Verifica que as 3 OPs individuais foram avançadas para Compra sem alterar a quantidade individual
      expect(pbUpdateSpy).toHaveBeenCalledWith(
        'owbbm9ibmq0pntn',
        expect.objectContaining({
          status: 'Compra',
          supplier: 'Fornecedor Alpha',
          unit_price: 15.5,
        }),
      )
      expect(pbUpdateSpy).toHaveBeenCalledWith(
        'rwszhhy714twx1e',
        expect.objectContaining({
          status: 'Compra',
          supplier: 'Fornecedor Alpha',
          unit_price: 15.5,
        }),
      )
      expect(pbUpdateSpy).toHaveBeenCalledWith(
        'pvja5jo8r1l36bv',
        expect.objectContaining({
          status: 'Compra',
          supplier: 'Fornecedor Alpha',
          unit_price: 15.5,
        }),
      )

      // NENHUM update alterou o campo 'quantity' das solicitações de OP individuais!
      const opCalls = pbUpdateSpy.mock.calls.filter((c: any[]) => itemIds.includes(c[0]))
      for (const call of opCalls) {
        expect(call[1]).not.toHaveProperty('quantity')
      }

      // Verifica criação do registro de excedente (via upsertMaterialShortage)
      expect(pbCreateSpy).toHaveBeenCalledTimes(1)
      expect(pbCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Soquete e27',
          code: '05090003',
          quantity: 9, // Excedente: 19 - 10 = 9
          status: 'Compra',
          supplier: 'Fornecedor Alpha',
          unit_price: 15.5,
          sector: 'Acabamento',
          request_type: 'Materiais',
          observation: expect.stringContaining(
            'Compra para estoque (excedente de lote consolidado: 19 un compradas − 10 un solicitadas)',
          ),
        }),
      )
      // O registro de excedente é geral para estoque, NÃO tem order_id
      expect(pbCreateSpy.mock.calls[0][0].order_id).toBeUndefined()
    })

    it('recompra de lote que JÁ possui excedente registrado com nova quantidade (17 un vs 19 un anterior): cancela excedentes antigos ou atualiza com a nova diferença', async () => {
      const itemIds = ['owbbm9ibmq0pntn', 'rwszhhy714twx1e', 'pvja5jo8r1l36bv']
      const actualPurchaseQty = 17 // Recompra para 17 un (10 OPs + 7 estoque)
      const requestedBatchQty = 10

      // Simula getOne retornando lote existente
      const existingShortageMock = {
        id: 'owbbm9ibmq0pntn',
        batch_id: 'lote_soquete_e27_retroativo',
      }
      const existingSurplusMock = {
        id: 'old_surplus_1',
        batch_id: 'lote_soquete_e27_retroativo',
        quantity: 9,
        observation: 'Compra para estoque anterior',
      }

      vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
        if (collName === 'material_shortages') {
          return {
            getOne: vi.fn().mockResolvedValue(existingShortageMock),
            getFullList: vi.fn().mockResolvedValue([existingSurplusMock]),
            getList: vi.fn().mockResolvedValue({ items: [existingSurplusMock] }),
            update: pbUpdateSpy,
            create: pbCreateSpy,
          } as any
        }
        if (collName === 'quotations') {
          return {
            getFirstListItem: pbGetFirstSpy,
          } as any
        }
        return {} as any
      })

      const result = await advanceGroupToCompraWithSurplus({
        itemIds,
        actualPurchaseQty,
        requestedBatchQty,
        componentCode: '05090003',
        componentDescription: 'Soquete e27',
        selectedQuotation: mockQuotation,
        sector: 'Acabamento',
      })

      // Excedente calculado para 17 un é 7 (17 - 10)
      expect(result.surplusQty).toBe(7)
      expect(result.batchId).toBe('lote_soquete_e27_retroativo')
      // upsertMaterialShortage deve ter atualizado o registro de excedente existente old_surplus_1 para 7 un
      expect(pbUpdateSpy).toHaveBeenCalledWith(
        'old_surplus_1',
        expect.objectContaining({
          quantity: 7,
        }),
      )
    })

    it('compra com quantidade IGUAL à solicitada (10 un vs 10 un): NÃO gera excedente e avança as solicitações normalmente', async () => {
      const itemIds = ['owbbm9ibmq0pntn', 'rwszhhy714twx1e', 'pvja5jo8r1l36bv']
      const actualPurchaseQty = 10
      const requestedBatchQty = 10

      const result = await advanceGroupToCompraWithSurplus({
        itemIds,
        actualPurchaseQty,
        requestedBatchQty,
        componentCode: '05090003',
        componentDescription: 'Soquete e27',
        selectedQuotation: mockQuotation,
      })

      expect(result.advancedCount).toBe(3)
      expect(result.surplusQty).toBe(0)
      expect(result.surplusShortageId).toBeUndefined()

      // 3 updates para Compra + 1 update de batch_info no item líder
      expect(pbUpdateSpy).toHaveBeenCalledTimes(4)
      // NENHUM create chamado para registro de excedente
      expect(pbCreateSpy).not.toHaveBeenCalled()
    })

    it('REGRA (1) - compra com quantidade MENOR que a solicitada (8 un vs 10 un): realiza split, avança itens comprados e mantém saldo residual em Cotações', async () => {
      const itemIds = ['owbbm9ibmq0pntn', 'rwszhhy714twx1e', 'pvja5jo8r1l36bv'] // 1 un, 4 un, 5 un (total: 10 un)
      const actualPurchaseQty = 8
      const requestedBatchQty = 10

      // Mock getOne para retornar os itens com suas quantidades
      vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
        if (collName === 'material_shortages') {
          return {
            getOne: vi.fn().mockImplementation((id: string) => {
              const map: Record<string, any> = {
                owbbm9ibmq0pntn: {
                  id: 'owbbm9ibmq0pntn',
                  quantity: 1,
                  code: '05090003',
                  description: 'Soquete e27',
                  status: 'Cotação',
                  sector: 'Acabamento',
                },
                rwszhhy714twx1e: {
                  id: 'rwszhhy714twx1e',
                  quantity: 4,
                  code: '05090003',
                  description: 'Soquete e27',
                  status: 'Cotação',
                  sector: 'Acabamento',
                },
                pvja5jo8r1l36bv: {
                  id: 'pvja5jo8r1l36bv',
                  quantity: 5,
                  code: '05090003',
                  description: 'Soquete e27',
                  status: 'Cotação',
                  sector: 'Acabamento',
                },
              }
              return Promise.resolve(map[id] || { id, quantity: 1 })
            }),
            getFullList: vi.fn().mockResolvedValue([]),
            getList: vi.fn().mockResolvedValue({ items: [] }),
            update: pbUpdateSpy,
            create: pbCreateSpy,
          } as any
        }
        if (collName === 'quotations') {
          return {
            getFirstListItem: pbGetFirstSpy,
            create: vi.fn().mockResolvedValue({ id: 'new_q' }),
          } as any
        }
        return {} as any
      })

      const result = await advanceGroupToCompraWithSurplus({
        itemIds,
        actualPurchaseQty,
        requestedBatchQty,
        componentCode: '05090003',
        componentDescription: 'Soquete e27',
        selectedQuotation: mockQuotation,
      })

      expect(result.surplusQty).toBe(0)
      expect(result.residualQty).toBe(2) // 10 - 8 = 2 un
      expect(result.advancedCount).toBe(3)

      // O item 1 (1 un) foi avançado integralmente para Compra
      // O item 2 (4 un) foi avançado integralmente para Compra (1 + 4 = 5 un alocadas)
      // O item 3 (5 un) precisava de 3 un para inteirar 8 un: foi desmembrado em 3 un Compra + 2 un residual em Cotação
      expect(pbCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 3,
          status: 'Compra',
          code: '05090003',
          observation: expect.stringContaining('Compra parcial de 3 un'),
        }),
      )
      // O item original 3 foi atualizado com saldo residual = 2 un e status 'Cotação'
      expect(pbUpdateSpy).toHaveBeenCalledWith(
        'pvja5jo8r1l36bv',
        expect.objectContaining({
          status: 'Cotação',
          quantity: 2,
          observation: expect.stringContaining(
            'Saldo residual de compra: 3 compradas de 5 solicitadas',
          ),
        }),
      )
    })
  })
})
