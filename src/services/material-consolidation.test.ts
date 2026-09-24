import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  findOtherOpDemands,
  isSameItem,
  calculateShortageBalance,
  normalizeKey,
  findFutureEngineeringDemands,
  findConsolidatedDemandAsync,
} from './material-consolidation'
import { MaterialShortage } from '@/types'
import pb from '@/lib/pocketbase/client'
import * as reservationsModule from './material-reservations'

describe('material-consolidation service', () => {
  const currentItem: MaterialShortage = {
    id: 'shortage-1',
    code: '05090003',
    description: 'Soquete e27',
    quantity: 2,
    received_quantity: 0,
    status: 'Cotação',
    order_id: 'order-1',
    expand: {
      order_id: {
        id: 'order-1',
        order_number: '14001',
        op_number: '000501/2026',
        client_name: 'Cliente A',
        delivery_date: '2026-10-10',
        status: 'Em Andamento',
      } as any,
    },
  } as MaterialShortage

  const otherShortageOpen: MaterialShortage = {
    id: 'shortage-2',
    code: '05090003',
    description: 'Soquete e27',
    quantity: 5,
    received_quantity: 1,
    status: 'Cotação',
    order_id: 'order-2',
    expand: {
      order_id: {
        id: 'order-2',
        order_number: '14002',
        op_number: '000502/2026',
        client_name: 'Cliente B',
        delivery_date: '2026-10-15',
        status: 'Fila',
      } as any,
    },
  } as MaterialShortage

  const otherShortageReceived: MaterialShortage = {
    id: 'shortage-3',
    code: '05090003',
    description: 'Soquete e27',
    quantity: 10,
    received_quantity: 10,
    status: 'Recebido',
    order_id: 'order-3',
  } as MaterialShortage

  it('normalizeKey normaliza maiúsculas, espaços e acentos', () => {
    expect(normalizeKey('  Soquete E27  ')).toBe('soquete e27')
    expect(normalizeKey('FABRICAÇÃO')).toBe('fabricacao')
  })

  it('calculateShortageBalance calcula saldo correto', () => {
    expect(calculateShortageBalance({ quantity: 5, received_quantity: 2, status: 'Cotação' })).toBe(
      3,
    )
    expect(calculateShortageBalance({ quantity: 5, received_quantity: 0, status: 'Cotação' })).toBe(
      5,
    )
    expect(
      calculateShortageBalance({ quantity: 5, received_quantity: 5, status: 'Recebido' }),
    ).toBe(0)
    expect(
      calculateShortageBalance({ quantity: 5, received_quantity: 0, status: 'Cancelado' }),
    ).toBe(0)
  })

  it('isSameItem compara corretamente por código e descrição', () => {
    expect(
      isSameItem(
        { code: '05090003', description: 'Item A' },
        { code: '05090003', description: 'Item B' },
      ),
    ).toBe(true)
    expect(
      isSameItem(
        { code: '05090003', description: 'Item A' },
        { code: '99999999', description: 'Item A' },
      ),
    ).toBe(false)
    expect(
      isSameItem(
        { code: '', description: 'Soquete E27' },
        { code: undefined, description: 'soquete e27' },
      ),
    ).toBe(true)
  })

  it('findOtherOpDemands lista apenas solicitações em aberto do mesmo código/descrição excluindo a atual', () => {
    const result = findOtherOpDemands(currentItem, [
      currentItem,
      otherShortageOpen,
      otherShortageReceived,
    ])
    expect(result.currentBalance).toBe(2)
    expect(result.otherDemands.length).toBe(1)
    expect(result.otherDemands[0].shortageId).toBe('shortage-2')
    expect(result.otherDemands[0].demandType).toBe('solicitacao_aberta')
    expect(result.otherDemands[0].quantity).toBe(4) // 5 - 1 recebido
    expect(result.totalOtherQuantity).toBe(4)
    expect(result.totalConsolidatedQuantity).toBe(6) // 2 + 4
    expect(result.totalOpenShortagesQuantity).toBe(4)
    expect(result.totalFutureDemandsQuantity).toBe(0)
  })

  describe('findFutureEngineeringDemands & findConsolidatedDemandAsync', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    it('findFutureEngineeringDemands busca materiais de engenharia de OPs não concluídas sem solicitação aberta e não separadas', async () => {
      const mockOrderMaterials = [
        {
          id: 'mat-1',
          code: '05090003',
          description: 'Soquete e27',
          quantity: 3,
          status: 'Pendente',
          order_id: 'order-future-1',
          expand: {
            order_id: {
              id: 'order-future-1',
              order_number: '14010',
              op_number: '000510/2026',
              status: 'Em Andamento',
              delivery_date: '2026-11-01',
              client_name: 'Cliente Futuro 1',
            },
          },
        },
        {
          id: 'mat-2-separated', // Deve ser ignorado pois status é 'Separado'
          code: '05090003',
          description: 'Soquete e27',
          quantity: 2,
          status: 'Separado',
          order_id: 'order-separated',
          expand: {
            order_id: {
              id: 'order-separated',
              order_number: '14011',
              op_number: '000511/2026',
              status: 'Em Andamento',
            },
          },
        },
        {
          id: 'mat-3-finished-op', // Deve ser ignorado pois status da OP é 'Concluído'
          code: '05090003',
          description: 'Soquete e27',
          quantity: 4,
          status: 'Pendente',
          order_id: 'order-finished',
          expand: {
            order_id: {
              id: 'order-finished',
              order_number: '14012',
              op_number: '000512/2026',
              status: 'Concluído',
            },
          },
        },
        {
          id: 'mat-4-has-shortage', // Deve ser ignorado pois já possui solicitação aberta (order-2)
          code: '05090003',
          description: 'Soquete e27',
          quantity: 5,
          status: 'Pendente',
          order_id: 'order-2',
          expand: {
            order_id: {
              id: 'order-2',
              order_number: '14002',
              op_number: '000502/2026',
              status: 'Fila',
            },
          },
        },
      ]

      vi.spyOn(pb.collection('pcp_order_materials'), 'getFullList').mockResolvedValue(
        mockOrderMaterials as any,
      )

      const futureDemands = await findFutureEngineeringDemands(
        currentItem,
        [currentItem, otherShortageOpen], // allShortages contém order-1 e order-2
        ['order-1'],
      )

      expect(futureDemands.length).toBe(1)
      expect(futureDemands[0].orderId).toBe('order-future-1')
      expect(futureDemands[0].demandType).toBe('necessidade_futura')
      expect(futureDemands[0].quantity).toBe(3)
      expect(futureDemands[0].opNumber).toBe('000510/2026')
      expect(futureDemands[0].orderNumber).toBe('14010')
    })

    it('findConsolidatedDemandAsync calcula total consolidado com subtotais e sugestão de estoque', async () => {
      // Mock da engenharia futura
      const mockOrderMaterials = [
        {
          id: 'mat-future',
          code: '05090003',
          description: 'Soquete e27',
          quantity: 6,
          status: 'Pendente',
          order_id: 'order-future-99',
          expand: {
            order_id: {
              id: 'order-future-99',
              order_number: '14099',
              op_number: '000599/2026',
              status: 'Em Andamento',
              delivery_date: '2026-11-15',
              client_name: 'Cliente Futuro 99',
            },
          },
        },
      ]
      vi.spyOn(pb.collection('pcp_order_materials'), 'getFullList').mockResolvedValue(
        mockOrderMaterials as any,
      )

      // Mock da disponibilidade de estoque: Total: 8, Reservado: 3 => Disponível: 5
      const stockMap = new Map([
        [
          '05090003',
          {
            code: '05090003',
            totalStock: 8,
            reservedStock: 3,
            availableStock: 5,
            unit: 'un',
          },
        ],
      ])
      vi.spyOn(reservationsModule, 'getStockAvailabilityForCodes').mockResolvedValue(
        stockMap as any,
      )

      const result = await findConsolidatedDemandAsync({
        currentItem,
        allShortages: [currentItem, otherShortageOpen],
        includeFutureDemands: true,
        includeStock: true,
      })

      // currentItem: 2
      // otherShortageOpen: 4
      // futureDemand: 6
      // Total consolidado = 2 + 4 + 6 = 12
      expect(result.currentBalance).toBe(2)
      expect(result.totalOpenShortagesQuantity).toBe(4)
      expect(result.totalFutureDemandsQuantity).toBe(6)
      expect(result.totalOtherQuantity).toBe(10)
      expect(result.totalConsolidatedQuantity).toBe(12)
      expect(result.countOtherOps).toBe(2) // 1 aberta + 1 futura

      // Estoque: Disponível 5
      // Sugestão de compra = max(0, 12 - 5) = 7
      expect(result.stockInfo).toBeDefined()
      expect(result.stockInfo?.totalStock).toBe(8)
      expect(result.stockInfo?.reservedStock).toBe(3)
      expect(result.stockInfo?.availableStock).toBe(5)
      expect(result.stockInfo?.suggestedPurchaseQty).toBe(7)
    })
  })
})
