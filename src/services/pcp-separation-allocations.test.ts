import { describe, it, expect, vi } from 'vitest'
import {
  formatOpDisplay,
  getItemAllocationKey,
  loadRoundOpAllocations,
  OpAllocation,
} from '@/services/pcp-separation-allocations'
import type { SeparationItem } from '@/services/material-separations'

// Mock de pocketbase e pcp-order-materials
vi.mock('@/lib/pocketbase/client', () => {
  return {
    default: {
      collection: (name: string) => ({
        getFullList: async () => {
          if (name === 'pcp_orders') {
            return [
              { id: 'ord-1', op_number: '000515/2026', order_number: 'PED-101' },
              { id: 'ord-2', op_number: '000517/2026', order_number: 'PED-102' },
              { id: 'ord-3', op_number: 'OP 000519/2026', order_number: 'PED-103' },
            ]
          }
          return []
        },
      }),
    },
  }
})

vi.mock('@/services/pcp-order-materials', () => {
  return {
    getOrderMaterialsForOrders: async (orderIds: string[]) => {
      // Retorna materiais da BOM para ord-1 e ord-2
      return [
        {
          id: 'mat-1',
          order_id: 'ord-1',
          code: '14010038',
          description: 'BARRA CHATA AÇO 15,88X3,18MM',
          quantity: 2,
          unit: 'MT',
          status: 'Pendente',
          sector: 'FABRICAÇÃO',
        },
        {
          id: 'mat-2',
          order_id: 'ord-2',
          code: '14010038',
          description: 'BARRA CHATA AÇO 15,88X3,18MM',
          quantity: 1,
          unit: 'MT',
          status: 'Pendente',
          sector: 'FABRICAÇÃO',
        },
        // ord-3 não tem o item 14010038 na BOM (para testar fallback null/—)
      ]
    },
  }
})

describe('pcp-separation-allocations', () => {
  describe('formatOpDisplay', () => {
    it('adiciona prefixo OP se não tiver', () => {
      expect(formatOpDisplay('000515/2026')).toBe('OP 000515/2026')
      expect(formatOpDisplay('515')).toBe('OP 515')
    })

    it('mantém intacto se já tiver OP', () => {
      expect(formatOpDisplay('OP 000515/2026')).toBe('OP 000515/2026')
      expect(formatOpDisplay('op 1234')).toBe('op 1234')
    })

    it('trata nulos e vazios', () => {
      expect(formatOpDisplay(null)).toBe('OP -')
      expect(formatOpDisplay('')).toBe('OP -')
    })
  })

  describe('getItemAllocationKey', () => {
    it('usa id se presente', () => {
      expect(getItemAllocationKey({ id: 'item-123', code: 'C1', description: 'D1' })).toBe(
        'item-123',
      )
    })

    it('faz fallback por code ou description normalizado se id for vazio', () => {
      expect(getItemAllocationKey({ id: '', code: 'ABC', description: 'Desc' })).toBe('code:abc')
      expect(getItemAllocationKey({ id: '', code: '', description: 'Peça Especial' })).toBe(
        'desc:peca especial',
      )
    })
  })

  describe('loadRoundOpAllocations', () => {
    it('ignora itens de OP única', async () => {
      const items: SeparationItem[] = [
        {
          id: 'item-single',
          code: '14010038',
          description: 'BARRA CHATA AÇO 15,88X3,18MM',
          total_quantity: 2,
          unit: 'MT',
          order_ids: ['ord-1'],
          op_numbers: ['OP 000515/2026'],
        },
      ]

      const allocMap = await loadRoundOpAllocations(['ord-1'], items)
      expect(allocMap.size).toBe(0)
    })

    it('calcula o rateio buscando as quantidades da BOM por OP para itens com 2+ OPs', async () => {
      const items: SeparationItem[] = [
        {
          id: 'item-multi',
          code: '14010038',
          description: 'BARRA CHATA AÇO 15,88X3,18MM',
          total_quantity: 3,
          unit: 'MT',
          order_ids: ['ord-1', 'ord-2'],
          op_numbers: ['OP 000515/2026', 'OP 000517/2026'],
        },
      ]

      const allocMap = await loadRoundOpAllocations(['ord-1', 'ord-2'], items)
      const allocations = allocMap.get('item-multi')

      expect(allocations).toBeDefined()
      expect(allocations).toHaveLength(2)

      // ord-1: 2 MT
      expect(allocations![0]).toEqual({
        orderId: 'ord-1',
        opNumber: 'OP 000515/2026',
        quantity: 2,
        unit: 'MT',
      })

      // ord-2: 1 MT
      expect(allocations![1]).toEqual({
        orderId: 'ord-2',
        opNumber: 'OP 000517/2026',
        quantity: 1,
        unit: 'MT',
      })
    })

    it('retorna null (para exibir "—") quando o componente não está na BOM de alguma OP', async () => {
      const items: SeparationItem[] = [
        {
          id: 'item-missing-bom',
          code: '14010038',
          description: 'BARRA CHATA AÇO 15,88X3,18MM',
          total_quantity: 2,
          unit: 'MT',
          order_ids: ['ord-1', 'ord-3'],
          op_numbers: ['OP 000515/2026', 'OP 000519/2026'],
        },
      ]

      const allocMap = await loadRoundOpAllocations(['ord-1', 'ord-3'], items)
      const allocations = allocMap.get('item-missing-bom')

      expect(allocations).toBeDefined()
      expect(allocations).toHaveLength(2)

      // ord-1: presente na BOM -> 2
      expect(allocations![0].quantity).toBe(2)
      expect(allocations![0].opNumber).toBe('OP 000515/2026')

      // ord-3: NÃO presente na BOM -> null (exibirá "—")
      expect(allocations![1].quantity).toBeNull()
      expect(allocations![1].opNumber).toBe('OP 000519/2026')
    })
  })
})
