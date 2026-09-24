import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createRetroactiveWithdrawalRequest,
  approveRetroactiveWithdrawal,
  rejectRetroactiveWithdrawal,
  getOpBomWithWithdrawalComparison,
  getClosedOrdersWithinWindow,
} from './retroactive-withdrawals'
import pb from '@/lib/pocketbase/client'
import * as inventoryService from './inventory'

vi.mock('@/lib/pocketbase/client', () => {
  const mockCollectionMap: Record<string, any> = {}

  const getOrCreateCollection = (name: string) => {
    if (!mockCollectionMap[name]) {
      mockCollectionMap[name] = {
        getList: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        getFullList: vi.fn(),
        getOne: vi.fn(),
        getFirstListItem: vi.fn(),
      }
    }
    return mockCollectionMap[name]
  }

  return {
    default: {
      collection: vi.fn((name: string) => getOrCreateCollection(name)),
      authStore: {
        record: {
          id: 'user_reginaldo',
          name: 'Reginaldo',
          email: 'reginaldo.segundo@planagroup.com.br',
        },
        isValid: true,
      },
    },
  }
})

vi.mock('./inventory', () => ({
  createMovement: vi.fn(),
}))

describe('Fluxo de Baixa Retroativa em OP Encerrada', () => {
  const retroCol = pb.collection('pcp_retroactive_withdrawals') as any
  const pcpOrdersCol = pb.collection('pcp_orders') as any
  const pcpMaterialsCol = pb.collection('pcp_order_materials') as any
  const invMovCol = pb.collection('inventory_movements') as any
  const invCol = pb.collection('inventory') as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Criação de Solicitação pelo Operador', () => {
    it('deve criar solicitação com status Pendente e todos os campos obrigatórios', async () => {
      retroCol.create.mockResolvedValueOnce({
        id: 'retro_1',
        order_id: 'op_encerrada_1',
        order_number: '13968',
        material_code: '05100030',
        material_description: 'PARAFUSO ALLEN S/ CABECA M6X6MM',
        unit: 'UN',
        quantity: 5,
        reason: 'Esquecido de baixar no fechamento da OP',
        requested_by: 'op_joao',
        status: 'Pendente',
      })

      const result = await createRetroactiveWithdrawalRequest(
        {
          order_id: 'op_encerrada_1',
          order_number: '13968',
          material_code: '05100030',
          material_description: 'PARAFUSO ALLEN S/ CABECA M6X6MM',
          unit: 'UN',
          quantity: 5,
          reason: 'Esquecido de baixar no fechamento da OP',
        },
        'op_joao',
      )

      expect(retroCol.create).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: 'op_encerrada_1',
          order_number: '13968',
          material_code: '05100030',
          material_description: 'PARAFUSO ALLEN S/ CABECA M6X6MM',
          quantity: 5,
          reason: 'Esquecido de baixar no fechamento da OP',
          requested_by: 'op_joao',
          status: 'Pendente',
        }),
      )
      expect(result.status).toBe('Pendente')
      expect(result.id).toBe('retro_1')
    })

    it('deve rejeitar solicitação sem motivo', async () => {
      await expect(
        createRetroactiveWithdrawalRequest(
          {
            order_id: 'op_encerrada_1',
            order_number: '13968',
            material_description: 'Item Teste',
            quantity: 1,
            reason: '   ',
          },
          'op_joao',
        ),
      ).rejects.toThrow('O motivo da baixa retroativa é obrigatório.')
    })

    it('deve rejeitar solicitação com quantidade menor ou igual a zero', async () => {
      await expect(
        createRetroactiveWithdrawalRequest(
          {
            order_id: 'op_encerrada_1',
            order_number: '13968',
            material_description: 'Item Teste',
            quantity: 0,
            reason: 'Motivo teste',
          },
          'op_joao',
        ),
      ).rejects.toThrow('A quantidade solicitada deve ser maior que zero.')
    })
  })

  describe('Aprovação pelo Gestor do PCP', () => {
    it('ao aprovar: executa a baixa de estoque vinculada à OP e marca status como Aprovada', async () => {
      const pendingRequest = {
        id: 'retro_pending_1',
        order_id: 'op_concluida_42',
        order_number: '14001',
        material_code: '05090054',
        material_description: 'Soquete G9 PORCELANA COM RABICHO',
        unit: 'un',
        quantity: 2,
        reason: 'Usado na montagem mas esquecido',
        requested_by: 'op_pedro',
        status: 'Pendente',
        inventory_id: 'inv_soquete_g9',
        expand: {
          order_id: { op_number: '000500/2026', order_number: '14001' },
        },
      }

      retroCol.getOne.mockResolvedValueOnce(pendingRequest)

      // Mock de createMovement no estoque
      vi.mocked(inventoryService.createMovement).mockResolvedValueOnce({
        id: 'mov_exit_999',
        inventory_id: 'inv_soquete_g9',
        quantity: 2,
        type: 'Saída',
        reason:
          'Baixa retroativa · aprovada por Reginaldo — Pedido 14001 / OP 000500/2026 (Motivo: Usado na montagem mas esquecido)',
        order_id: 'op_concluida_42',
        created: new Date().toISOString(),
      } as any)

      // Mock da atualização do registro
      retroCol.update.mockResolvedValueOnce({
        ...pendingRequest,
        status: 'Aprovada',
        reviewed_by: 'user_reginaldo',
        reviewed_at: '2026-09-24T18:00:00Z',
        withdrawal_id: 'mov_exit_999',
      })

      const approved = await approveRetroactiveWithdrawal({
        withdrawalId: 'retro_pending_1',
        reviewedByUserId: 'user_reginaldo',
        reviewerName: 'Reginaldo',
        reviewNote: 'Aprovado conforme verificado no setor',
      })

      // 1. Deve ter chamado createMovement vinculado à OP
      expect(inventoryService.createMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          inventory_id: 'inv_soquete_g9',
          quantity: 2,
          type: 'Saída',
          order_id: 'op_concluida_42',
          reason: expect.stringContaining('Baixa retroativa · aprovada por Reginaldo'),
        }),
      )

      // 2. Deve ter atualizado o registro para Aprovada com o withdrawal_id vinculado
      expect(retroCol.update).toHaveBeenCalledWith(
        'retro_pending_1',
        expect.objectContaining({
          status: 'Aprovada',
          reviewed_by: 'user_reginaldo',
          withdrawal_id: 'mov_exit_999',
          review_note: 'Aprovado conforme verificado no setor',
        }),
      )

      expect(approved.status).toBe('Aprovada')
      expect(approved.withdrawal_id).toBe('mov_exit_999')
    })
  })

  describe('Rejeição pelo Gestor do PCP', () => {
    it('ao rejeitar: atualiza status para Rejeitada com justificativa e NÃO gera baixa no estoque', async () => {
      const pendingRequest = {
        id: 'retro_pending_2',
        order_id: 'op_concluida_42',
        order_number: '14001',
        material_code: '05090054',
        material_description: 'Soquete G9',
        quantity: 10,
        reason: 'Esquecido',
        status: 'Pendente',
      }

      retroCol.getOne.mockResolvedValueOnce(pendingRequest)
      retroCol.update.mockResolvedValueOnce({
        ...pendingRequest,
        status: 'Rejeitada',
        reviewed_by: 'user_reginaldo',
        review_note: 'Quantidade 10 é desproporcional à OP de 1 peça.',
      })

      const rejected = await rejectRetroactiveWithdrawal({
        withdrawalId: 'retro_pending_2',
        reviewedByUserId: 'user_reginaldo',
        reviewNote: 'Quantidade 10 é desproporcional à OP de 1 peça.',
      })

      // NÃO deve gerar movimento no estoque
      expect(inventoryService.createMovement).not.toHaveBeenCalled()

      // Deve atualizar para Rejeitada com o motivo
      expect(retroCol.update).toHaveBeenCalledWith(
        'retro_pending_2',
        expect.objectContaining({
          status: 'Rejeitada',
          reviewed_by: 'user_reginaldo',
          review_note: 'Quantidade 10 é desproporcional à OP de 1 peça.',
        }),
      )

      expect(rejected.status).toBe('Rejeitada')
    })

    it('deve exigir motivo de rejeição obrigatório', async () => {
      await expect(
        rejectRetroactiveWithdrawal({
          withdrawalId: 'retro_pending_2',
          reviewedByUserId: 'user_reginaldo',
          reviewNote: '   ',
        }),
      ).rejects.toThrow('O motivo da rejeição é obrigatório.')
      expect(inventoryService.createMovement).not.toHaveBeenCalled()
    })
  })

  describe('Cálculo de Teto BOM e Baixas Anteriores', () => {
    it('deve calcular sugeridoMaxQty = BOM − já baixado', async () => {
      // Materiais da BOM
      pcpMaterialsCol.getFullList.mockResolvedValueOnce([
        {
          id: 'mat_1',
          code: '05100188',
          description: 'BUCHA NYLON FU 6',
          quantity: 4,
          unit: 'PC',
          order_id: 'op_teste',
        },
      ])

      // Movimentações já baixadas vinculadas à OP
      invMovCol.getFullList.mockResolvedValueOnce([
        {
          id: 'mov_1',
          quantity: 1,
          type: 'Saída',
          order_id: 'op_teste',
          expand: {
            inventory_id: { code: '05100188', description: 'BUCHA NYLON FU 6' },
          },
        },
      ])

      // Itens de estoque
      invCol.getFullList.mockResolvedValueOnce([
        { id: 'inv_bucha', code: '05100188', description: 'BUCHA NYLON FU 6' },
      ])

      const comparison = await getOpBomWithWithdrawalComparison('op_teste')

      expect(comparison).toHaveLength(1)
      const item = comparison[0]
      expect(item.code).toBe('05100188')
      expect(item.engineeringQty).toBe(4)
      expect(item.alreadyWithdrawnQty).toBe(1)
      expect(item.suggestedMaxQty).toBe(3) // 4 - 1 = 3
    })
  })

  describe('Filtro de OPs Encerradas na Janela de 30 dias', () => {
    it('deve retornar apenas OPs Concluídas dentro da janela configurada', async () => {
      const now = Date.now()
      const dayMs = 24 * 60 * 60 * 1000

      const recentOp = {
        id: 'op_recent',
        status: 'Concluído',
        finished_at: new Date(now - 5 * dayMs).toISOString(), // 5 dias atrás
        order_number: '14100',
      }
      const oldOp = {
        id: 'op_old',
        status: 'Concluído',
        finished_at: new Date(now - 45 * dayMs).toISOString(), // 45 dias atrás (fora dos 30)
        order_number: '12000',
      }

      pcpOrdersCol.getFullList.mockResolvedValueOnce([recentOp, oldOp])

      const result = await getClosedOrdersWithinWindow(30)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('op_recent')
    })
  })
})
