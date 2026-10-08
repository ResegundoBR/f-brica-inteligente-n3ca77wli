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

  it('findOtherOpDemands ignora sub-registros do mesmo lote e excedente, usando actual_quantity', () => {
    // Caso real: ANEL ORING lote_1791488504803_db59ye
    const parentShortage: MaterialShortage = {
      id: 'm24w3mtsk49jqud',
      code: '06080040',
      description: 'ANEL ORING Ø 7,59X2,62MM - REF OR1-109',
      quantity: 30,
      received_quantity: 0,
      status: 'Compra',
      sector: 'Suprimentos',
      created: '2026-10-08T18:27:33.555Z',
      updated: '2026-10-08T20:03:05.228Z',
      batch_id: 'lote_1791488504803_db59ye',
      batch_info: {
        batch_id: 'lote_1791488504803_db59ye',
        is_batch_parent: true,
        actual_quantity: 30,
        requested_total: 16,
        surplus_quantity: 14,
        surplus_shortage_id: '1611j34iky0mrvy',
        sub_shortage_ids: ['m24w3mtsk49jqud', 'nim4osi907xdr5p', 'ej15uur8ejynxh1'],
      },
    } as MaterialShortage

    const sub1: MaterialShortage = {
      id: 'ej15uur8ejynxh1',
      code: '06080040',
      description: 'ANEL ORING Ø 7,59X2,62MM - REF OR1-109',
      quantity: 4,
      received_quantity: 0,
      status: 'Compra',
      sector: 'Suprimentos',
      created: '2026-09-29T12:33:26.364Z',
      updated: '2026-10-08T19:42:56.969Z',
      batch_id: 'lote_1791488504803_db59ye',
    } as MaterialShortage

    const sub2: MaterialShortage = {
      id: 'nim4osi907xdr5p',
      code: '06080040',
      description: 'ANEL ORING Ø 7,59X2,62MM - REF OR1-109',
      quantity: 4,
      received_quantity: 0,
      status: 'Compra',
      sector: 'Suprimentos',
      created: '2026-10-06T19:15:18.180Z',
      updated: '2026-10-08T19:42:56.146Z',
      batch_id: 'lote_1791488504803_db59ye',
    } as MaterialShortage

    const surplus: MaterialShortage = {
      id: '1611j34iky0mrvy',
      code: '06080040',
      description: 'ANEL ORING Ø 7,59X2,62MM - REF OR1-109',
      quantity: 14,
      received_quantity: 0,
      status: 'Compra',
      sector: 'Suprimentos',
      created: '2026-10-08T19:41:49.802Z',
      updated: '2026-10-08T19:41:49.802Z',
      batch_id: 'lote_1791488504803_db59ye',
    } as MaterialShortage

    // Se houver uma OUTRA solicitação de outra OP não ligada a este lote:
    const unrelatedShortage: MaterialShortage = {
      id: 'other-unrelated',
      code: '06080040',
      description: 'ANEL ORING Ø 7,59X2,62MM - REF OR1-109',
      quantity: 5,
      received_quantity: 0,
      status: 'Compra',
      sector: 'Suprimentos',
      created: '2026-10-08T10:00:00.000Z',
      updated: '2026-10-08T10:00:00.000Z',
      batch_id: undefined,
    } as MaterialShortage

    const allShortages = [parentShortage, sub1, sub2, surplus, unrelatedShortage]

    const result = findOtherOpDemands(parentShortage, allShortages)

    // currentBalance deve ser 30 (actual_quantity do lote)
    expect(result.currentBalance).toBe(30)
    // Demanda de outras OPs deve encontrar APENAS unrelatedShortage (5 un), NÃO sub1, sub2 ou surplus
    expect(result.otherDemands.length).toBe(1)
    expect(result.otherDemands[0].shortageId).toBe('other-unrelated')
    expect(result.totalOtherQuantity).toBe(5)
    expect(result.totalConsolidatedQuantity).toBe(35) // 30 + 5
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
              manual_product_name: 'Luminária Pétala',
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
      expect(futureDemands[0].productName).toBe('Luminária Pétala')
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
