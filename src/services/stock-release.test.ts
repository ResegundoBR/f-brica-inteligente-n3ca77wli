import { describe, it, expect, vi, beforeEach } from 'vitest'
import { releaseShortageFromStock, releaseGroupFromStock } from './stock-release'
import * as materialReservations from './material-reservations'
import * as inventoryService from './inventory'
import pb from '@/lib/pocketbase/client'
import { MaterialShortage } from '@/types'

vi.mock('@/lib/pocketbase/client', () => ({
  default: {
    authStore: {
      record: { name: 'Comprador Teste', email: 'teste@exemplo.com' },
    },
    collection: vi.fn(() => ({
      update: vi.fn().mockResolvedValue({ id: 'ms1' }),
    })),
  },
}))

describe('stock-release service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deve liberar uma solicitação individual quando houver saldo livre suficiente', async () => {
    const mockShortage: MaterialShortage = {
      id: 'shortage_1',
      code: 'PAR001',
      description: 'Parafuso Inox',
      quantity: 10,
      sector: 'Montagem',
      status: 'Pendente',
      created: '2025-01-01',
      updated: '2025-01-01',
      expand: {
        order_id: {
          id: 'ord1',
          op_number: '1001',
        } as any,
      },
    }

    vi.spyOn(materialReservations, 'getStockAvailabilityForCodes').mockResolvedValue(
      new Map([
        [
          'par001',
          {
            code: 'PAR001',
            totalStock: 50,
            reservedStock: 10,
            availableStock: 40,
            unit: 'un',
            inventoryId: 'inv_1',
          },
        ],
      ]),
    )

    const createMovementSpy = vi
      .spyOn(inventoryService, 'createMovement')
      .mockResolvedValue({ id: 'mov_1' } as any)

    const result = await releaseShortageFromStock(mockShortage, 'Admin')

    expect(result.success).toBe(true)
    expect(result.quantity).toBe(10)
    expect(createMovementSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        inventory_id: 'inv_1',
        quantity: 10,
        type: 'Saída',
        reason: expect.stringContaining('Liberado do Estoque para OP 1001'),
      }),
    )
    expect(pb.collection).toHaveBeenCalledWith('material_shortages')
  })

  it('deve recusar liberação se o saldo livre for insuficiente', async () => {
    const mockShortage: MaterialShortage = {
      id: 'shortage_2',
      code: 'PAR002',
      description: 'Porca M6',
      quantity: 50,
      sector: 'Montagem',
      status: 'Pendente',
      created: '2025-01-01',
      updated: '2025-01-01',
    }

    vi.spyOn(materialReservations, 'getStockAvailabilityForCodes').mockResolvedValue(
      new Map([
        [
          'par002',
          {
            code: 'PAR002',
            totalStock: 30,
            reservedStock: 0,
            availableStock: 30,
            unit: 'un',
            inventoryId: 'inv_2',
          },
        ],
      ]),
    )

    await expect(releaseShortageFromStock(mockShortage)).rejects.toThrow(/Saldo livre insuficiente/)
  })

  it('deve liberar lote respeitando a capacidade do saldo', async () => {
    const item1: MaterialShortage = {
      id: 's1',
      code: 'PAR003',
      description: 'Arruela',
      quantity: 15,
      sector: 'Montagem',
      status: 'Pendente',
      created: '2025-01-01',
      updated: '2025-01-01',
    }
    const item2: MaterialShortage = {
      id: 's2',
      code: 'PAR003',
      description: 'Arruela',
      quantity: 10,
      sector: 'Montagem',
      status: 'Pendente',
      created: '2025-01-02',
      updated: '2025-01-02',
    }

    // Saldo livre: 20 un (cobre o item1 de 15 un, mas não o item2 de 10 un)
    let available = 20
    vi.spyOn(materialReservations, 'getStockAvailabilityForCodes').mockImplementation(
      async () =>
        new Map([
          [
            'par003',
            {
              code: 'PAR003',
              totalStock: 20,
              reservedStock: 0,
              availableStock: available,
              unit: 'un',
              inventoryId: 'inv_3',
            },
          ],
        ]),
    )

    vi.spyOn(inventoryService, 'createMovement').mockImplementation(async () => {
      available -= 15
      return { id: 'mov_3' } as any
    })

    const batchRes = await releaseGroupFromStock([item1, item2])
    expect(batchRes.successCount).toBe(1)
    expect(batchRes.failCount).toBe(1)
    expect(batchRes.totalReleased).toBe(15)
  })
})
