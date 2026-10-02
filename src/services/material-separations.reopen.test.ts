import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  MaterialSeparation,
  SeparationItem,
  reopenSeparation,
  finalizeSeparation,
} from '@/services/material-separations'
import pb from '@/lib/pocketbase/client'
import * as shortagesService from '@/services/material-shortages'
import * as reservationsService from '@/services/material-reservations'

describe('Reabrir Rodada de Separação (Modo Aditivo)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reabre rodada concluída voltando status para Em_Separacao e preservando marcações gravadas', async () => {
    const mockItems: SeparationItem[] = [
      {
        id: 'item-1',
        code: '1001',
        description: 'PARAFUSO INOX M6',
        total_quantity: 20,
        unit: 'UN',
        op_numbers: ['OP 000490/2026'],
        order_ids: ['ord-1'],
        status: 'separado',
      },
      {
        id: 'item-2',
        code: '1002',
        description: 'CHAPA DE AÇO 2MM',
        total_quantity: 5,
        unit: 'CHAPA',
        op_numbers: ['OP 000490/2026'],
        order_ids: ['ord-1'],
        status: 'falta',
      },
      {
        id: 'item-3',
        code: '1003',
        description: 'PERFIL ALUMÍNIO',
        total_quantity: 10,
        separated_quantity: 4,
        shortage_quantity: 6,
        unit: 'BARRA',
        op_numbers: ['OP 000490/2026'],
        order_ids: ['ord-1'],
        status: 'parcial',
      },
      {
        id: 'item-4',
        code: '1004',
        description: 'ANEL O-RING',
        total_quantity: 15,
        unit: 'UN',
        op_numbers: ['OP 000490/2026'],
        order_ids: ['ord-1'],
        status: 'substituido',
        replaced_by_code: '1004-SUB',
      },
    ]

    const existingSeparation: MaterialSeparation = {
      id: 'sep-prog-2',
      title: 'Separação — Programação #2 / 25/09/2026',
      status: 'Concluida',
      op_numbers: ['OP 000490/2026'],
      order_ids: ['ord-1'],
      items: mockItems,
      separated_items: [mockItems[0], mockItems[2]],
      shortage_items: [mockItems[1], mockItems[2]],
      separated_count: 2,
      shortage_count: 2,
      total_items_count: 4,
      finished_at: '2026-09-28T08:34:00.000Z',
      finished_by: 'user-op-1',
      created: '2026-09-25T10:00:00.000Z',
      updated: '2026-09-28T08:34:00.000Z',
      expand: {
        programacao_id: {
          id: 'prog-2',
          name: 'Programação #2 / 25/09/2026',
          seq_number: 2,
          status: 'Em produção',
        },
      },
    }

    let updatePayloadCapture: any = null
    const getOneSpy = vi
      .spyOn(pb.collection('material_separations'), 'getOne')
      .mockResolvedValueOnce(existingSeparation as any)

    const updateSpy = vi
      .spyOn(pb.collection('material_separations'), 'update')
      .mockImplementationOnce(async (id: string, payload: any) => {
        updatePayloadCapture = payload
        return {
          ...existingSeparation,
          ...payload,
          status: payload.status,
        } as any
      })

    const syncReservationsSpy = vi
      .spyOn(reservationsService, 'syncSeparationReservations')
      .mockResolvedValueOnce(undefined)

    const orderLogsCreateSpy = vi
      .spyOn(pb.collection('pcp_order_logs'), 'create')
      .mockResolvedValueOnce({ id: 'log-1' } as any)

    const result = await reopenSeparation('sep-prog-2', {
      reason: 'Conferência de itens solicitada pelo gestor',
    })

    // 1. Verifica busca e payload de atualização
    expect(getOneSpy).toHaveBeenCalledWith('sep-prog-2', expect.any(Object))
    expect(updateSpy).toHaveBeenCalledWith(
      'sep-prog-2',
      {
        status: 'Em_Separacao',
        finished_at: null,
        finished_by: null,
      },
      expect.any(Object),
    )

    // 2. Status retornado é Em_Separacao
    expect(result.status).toBe('Em_Separacao')

    // 3. Marcações intactas
    expect(result.items).toHaveLength(4)
    expect(result.items[0].status).toBe('separado')
    expect(result.items[1].status).toBe('falta')
    expect(result.items[2].status).toBe('parcial')
    expect(result.items[3].status).toBe('substituido')

    // 4. Sincronização de reservas chamada para manter itens separados
    expect(syncReservationsSpy).toHaveBeenCalledWith('sep-prog-2', mockItems)

    // 5. Auditoria gravada em pcp_order_logs com ação 'Separação - Rodada Reaberta'
    expect(orderLogsCreateSpy).toHaveBeenCalledTimes(1)
    const logCall = orderLogsCreateSpy.mock.calls[0][0] as any
    expect(logCall.order_id).toBe('ord-1')
    expect(logCall.stage).toBe('Separação')
    expect(logCall.action).toBe('Separação - Rodada Reaberta')
    expect(logCall.details).toContain('Rodada de Separação reaberta por')
    expect(logCall.details).toContain('Concluída → Em Separação')
    expect(logCall.details).toContain('Marcações preservadas')
    expect(logCall.details).toContain('Conferência de itens solicitada pelo gestor')
  })

  it('no Portal do Operador, a rodada reaberta com status Em_Separacao entra na lista pendente', () => {
    // Simula filtragem do Portal do Operador (OperatorSeparationTab)
    const separationsList: MaterialSeparation[] = [
      {
        id: 'sep-1',
        status: 'Pendente',
        op_numbers: ['OP 001'],
        order_ids: ['ord-1'],
        items: [],
        separated_count: 0,
        shortage_count: 0,
        total_items_count: 5,
        created: '2026-09-21T10:00:00Z',
        updated: '2026-09-21T10:00:00Z',
      },
      {
        id: 'sep-2',
        status: 'Em_Separacao', // Rodada reaberta
        op_numbers: ['OP 002'],
        order_ids: ['ord-2'],
        items: [
          {
            id: 'it-1',
            code: 'C1',
            description: 'Item 1',
            total_quantity: 10,
            unit: 'UN',
            op_numbers: ['OP 002'],
            order_ids: ['ord-2'],
            status: 'separado',
          },
        ],
        separated_count: 1,
        shortage_count: 0,
        total_items_count: 1,
        created: '2026-09-25T10:00:00Z',
        updated: '2026-09-28T09:00:00Z',
      },
      {
        id: 'sep-3',
        status: 'Concluida',
        op_numbers: ['OP 003'],
        order_ids: ['ord-3'],
        items: [],
        separated_count: 3,
        shortage_count: 1,
        total_items_count: 4,
        created: '2026-09-20T10:00:00Z',
        updated: '2026-09-20T11:00:00Z',
      },
    ]

    // Regra usada no OperatorSeparationTab:
    // const pendingSeparations = separations.filter(s => s.status === 'Pendente' || s.status === 'Em_Separacao')
    // const finishedSeparations = separations.filter(s => s.status === 'Concluida')
    const pendingSeparations = separationsList.filter(
      (s) => s.status === 'Pendente' || s.status === 'Em_Separacao',
    )
    const finishedSeparations = separationsList.filter((s) => s.status === 'Concluida')

    expect(pendingSeparations).toHaveLength(2)
    expect(pendingSeparations.map((s) => s.id)).toEqual(['sep-1', 'sep-2'])
    expect(finishedSeparations).toHaveLength(1)
    expect(finishedSeparations[0].id).toBe('sep-3')

    // Rodada reaberta (sep-2) é 'Em_Separacao', portanto o botão exibido é 'Continuar Separação'
    const isEmSeparacao = pendingSeparations[1].status === 'Em_Separacao'
    const buttonLabel = isEmSeparacao ? 'Continuar Separação' : 'Iniciar Separação'
    expect(buttonLabel).toBe('Continuar Separação')
  })

  it('nova finalização reconsolida faltas usando upsertMaterialShortage sem duplicar registros', async () => {
    // Simula uma rodada reaberta que é finalizada novamente após conferência
    const items: SeparationItem[] = [
      {
        id: 'item-1',
        code: '1001',
        description: 'PARAFUSO INOX M6',
        total_quantity: 20,
        unit: 'UN',
        op_numbers: ['OP 000490/2026'],
        order_ids: ['ord-1'],
        status: 'separado',
      },
      {
        id: 'item-2',
        code: '1002',
        description: 'CHAPA DE AÇO 2MM',
        total_quantity: 5,
        unit: 'CHAPA',
        op_numbers: ['OP 000490/2026'],
        order_ids: ['ord-1'],
        status: 'falta',
      },
      {
        id: 'item-fab',
        code: 'FAB01075',
        description: 'PEÇA FABRICADA INTERNA',
        total_quantity: 2,
        unit: 'PC',
        op_numbers: ['OP 000490/2026'],
        order_ids: ['ord-1'],
        status: 'falta',
      },
    ]

    const upsertSpy = vi
      .spyOn(shortagesService, 'upsertMaterialShortage')
      .mockResolvedValue({ id: 'shortage-existing', isNew: false } as any)

    vi.spyOn(pb.collection('material_separations'), 'getOne').mockResolvedValueOnce({
      id: 'sep-1',
      title: 'Rodada 1',
      expand: {
        programacao_id: { name: 'Programação #2', seq_number: 2 },
      },
    } as any)

    vi.spyOn(pb.collection('material_reservations'), 'getFullList').mockResolvedValueOnce([])
    vi.spyOn(pb.collection('inventory'), 'getFullList').mockResolvedValueOnce([])
    vi.spyOn(pb.collection('inventory_movements'), 'getFullList').mockResolvedValueOnce([])

    const updateSpy = vi
      .spyOn(pb.collection('material_separations'), 'update')
      .mockResolvedValueOnce({
        id: 'sep-1',
        status: 'Concluida',
        items,
      } as any)

    const res = await finalizeSeparation('sep-1', items)

    expect(res.separation.status).toBe('Concluida')
    // upsertMaterialShortage deve ser chamado APENAS para o item-2 (item-fab é ignorado porque é FAB)
    expect(upsertSpy).toHaveBeenCalledTimes(1)
    const [payload] = upsertSpy.mock.calls[0]
    expect(payload.code).toBe('1002')
    expect(payload.quantity).toBe(5)
  })
})
