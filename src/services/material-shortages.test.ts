import { describe, it, expect, vi, beforeEach } from 'vitest'
import { upsertMaterialShortage } from './material-shortages'
import pb from '@/lib/pocketbase/client'

vi.mock('@/lib/pocketbase/client', () => {
  const mockCollection = {
    getList: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getFullList: vi.fn(),
    getOne: vi.fn(),
  }
  return {
    default: {
      collection: vi.fn(() => mockCollection),
      authStore: {
        record: { name: 'Operador Teste', email: 'op@test.com' },
      },
    },
  }
})

describe('Trava anti-duplicidade em material_shortages (upsertMaterialShortage)', () => {
  const collectionMock = pb.collection('material_shortages') as unknown as {
    getList: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deve CRIAR um novo registro se não houver registro em aberto com mesmo código e OP', async () => {
    collectionMock.getList.mockResolvedValueOnce({ items: [], totalItems: 0 })
    collectionMock.create.mockResolvedValueOnce({
      id: 'shortage_1',
      code: '05090003',
      description: 'Soquete e27',
      quantity: 2,
      order_id: 'op_123',
      sector: 'Suprimentos',
      status: 'Pendente',
    })

    const res = await upsertMaterialShortage(
      {
        order_id: 'op_123',
        code: '05090003',
        description: 'Soquete e27',
        quantity: 2,
        sector: 'Suprimentos',
      },
      'Carlos Operador',
    )

    expect(collectionMock.getList).toHaveBeenCalledTimes(1)
    expect(collectionMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: '05090003',
        description: 'Soquete e27',
        quantity: 2,
        order_id: 'op_123',
      }),
    )
    expect(collectionMock.update).not.toHaveBeenCalled()
    expect(res.isNew).toBe(true)
    expect(res.record.id).toBe('shortage_1')
  })

  it('deve ATUALIZAR o registro existente em vez de criar um segundo quando re-sinalizado para mesma OP e código', async () => {
    const existing = {
      id: 'existing_shortage_1',
      code: '05090003',
      description: 'Soquete e27',
      quantity: 1,
      order_id: 'op_123',
      sector: 'Suprimentos',
      status: 'Pendente',
      observation: 'Obs original',
    }

    collectionMock.getList.mockResolvedValueOnce({ items: [existing], totalItems: 1 })
    collectionMock.update.mockResolvedValueOnce({
      ...existing,
      quantity: 5,
      observation: 'Obs original | Re-sinalizado em 24/09/2026 por Carlos: 1 → 5',
    })

    const res = await upsertMaterialShortage(
      {
        order_id: 'op_123',
        code: '05090003',
        description: 'Soquete e27',
        quantity: 5,
        sector: 'Suprimentos',
      },
      'Carlos',
    )

    expect(collectionMock.getList).toHaveBeenCalledTimes(1)
    expect(collectionMock.create).not.toHaveBeenCalled()
    expect(collectionMock.update).toHaveBeenCalledTimes(1)

    const [updateId, updatePayload] = collectionMock.update.mock.calls[0]
    expect(updateId).toBe('existing_shortage_1')
    expect(updatePayload.quantity).toBe(5)
    expect(updatePayload.observation).toContain('Re-sinalizado em')
    expect(updatePayload.observation).toContain('1 → 5')
    expect(updatePayload.observation).toContain('por Carlos')
    expect(res.isNew).toBe(false)
  })

  it('deve verificar duplicidade por código+descrição+setor quando NÃO houver order_id', async () => {
    const existing = {
      id: 'existing_shortage_no_op',
      code: '050800030',
      description: 'Cabo slim',
      quantity: 10,
      order_id: null,
      sector: 'Fabricação',
      status: 'Cotação',
      observation: '',
    }

    collectionMock.getList.mockResolvedValueOnce({ items: [existing], totalItems: 1 })
    collectionMock.update.mockResolvedValueOnce({
      ...existing,
      quantity: 20,
    })

    const res = await upsertMaterialShortage(
      {
        order_id: null,
        code: '050800030',
        description: 'Cabo slim',
        quantity: 20,
        sector: 'Fabricação',
      },
      'Almoxarife',
    )

    expect(collectionMock.create).not.toHaveBeenCalled()
    expect(collectionMock.update).toHaveBeenCalledWith(
      'existing_shortage_no_op',
      expect.objectContaining({
        quantity: 20,
        observation: expect.stringContaining('10 → 20'),
      }),
    )
    expect(res.isNew).toBe(false)
  })
})
