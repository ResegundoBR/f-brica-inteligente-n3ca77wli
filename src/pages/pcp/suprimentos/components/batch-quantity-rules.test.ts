import { describe, it, expect } from 'vitest'
import { calculateBatchQuantityPlan, resolveBatchMembers } from './batch-quantity-rules'
import { MaterialShortage } from '@/types'

describe('batch-quantity-rules (Rodada C: Regras de Edição no modal de Compra)', () => {
  const makeOpShortage = (
    id: string,
    opNumber: string,
    quantity: number,
    batchId = 'lote_123',
    received = 0,
  ): MaterialShortage =>
    ({
      id,
      batch_id: batchId,
      code: '05100030',
      description: 'PARAFUSO ALLEN M6X6',
      quantity,
      received_quantity: received,
      order_id: `order_${opNumber}`,
      expand: {
        order_id: {
          id: `order_${opNumber}`,
          op_number: opNumber,
          order_number: `PED_${opNumber}`,
        },
      },
    }) as unknown as MaterialShortage

  const makeSurplusShortage = (
    id: string,
    quantity: number,
    batchId = 'lote_123',
    received = 0,
  ): MaterialShortage =>
    ({
      id,
      batch_id: batchId,
      code: '05100030',
      description: 'PARAFUSO ALLEN M6X6',
      quantity,
      received_quantity: received,
      order_id: null,
      observation: 'Compra para estoque (excedente)',
    }) as unknown as MaterialShortage

  it('Lote com OPs e linha de estoque: editar o total do lote NÃO infla membros de OP', () => {
    const op1 = makeOpShortage('op_1', '000488/2026', 4)
    const op2 = makeOpShortage('op_2', '000486/2026', 2)
    const surplus = makeSurplusShortage('surplus_1', 10)

    const allShortages = [op1, op2, surplus]

    // Usuário abre a linha de compra para estoque e altera o total do lote de 16 para 50
    const plan = calculateBatchQuantityPlan({
      item: surplus,
      targetNewQuantity: 50,
      allShortages,
    })

    expect(plan.isBelowReceived).toBe(false)
    expect(plan.isAboveSensibleDemand).toBe(false)
    expect(plan.validationError).toBeUndefined()
    expect(plan.needsOpConfirmation).toBe(false)
    expect(plan.affectedOpMembers).toHaveLength(0)

    // OPs permanecem intactas (4 e 2)
    const op1Update = plan.itemsToUpdate.find((it) => it.id === 'op_1')
    const op2Update = plan.itemsToUpdate.find((it) => it.id === 'op_2')
    expect(op1Update?.newQty).toBe(4)
    expect(op1Update?.isChanged).toBe(false)
    expect(op2Update?.newQty).toBe(2)
    expect(op2Update?.isChanged).toBe(false)

    // O excedente absorve a diferença: 50 - 6 = 44 un
    const surplusUpdate = plan.itemsToUpdate.find((it) => it.id === 'surplus_1')
    expect(surplusUpdate?.newQty).toBe(44)
    expect(surplusUpdate?.isChanged).toBe(true)
  })

  it('Editar um registro de OP específico dentro do lote exige confirmação explícita nomeando a OP', () => {
    const op1 = makeOpShortage('op_1', '000488/2026', 4)
    const op2 = makeOpShortage('op_2', '000486/2026', 2)
    const allShortages = [op1, op2]

    // Usuário edita diretamente o registro da OP 000488 de 4 para 10
    const plan = calculateBatchQuantityPlan({
      item: op1,
      targetNewQuantity: 10,
      allShortages,
    })

    expect(plan.needsOpConfirmation).toBe(true)
    expect(plan.affectedOpMembers).toHaveLength(1)
    expect(plan.affectedOpMembers[0].opLabel).toBe('000488/2026')
    expect(plan.affectedOpMembers[0].oldQty).toBe(4)
    expect(plan.affectedOpMembers[0].newQty).toBe(10)

    // A outra OP permanece intacta
    const op2Update = plan.itemsToUpdate.find((it) => it.id === 'op_2')
    expect(op2Update?.newQty).toBe(2)
    expect(op2Update?.isChanged).toBe(false)
  })

  it('Validação de limite: bloqueia quantidade menor que o já recebido', () => {
    const op1 = makeOpShortage('op_1', '000488/2026', 10, 'lote_123', 8)
    const allShortages = [op1]

    const plan = calculateBatchQuantityPlan({
      item: op1,
      targetNewQuantity: 5, // menor que 8 já recebidos
      allShortages,
    })

    expect(plan.isBelowReceived).toBe(true)
    expect(plan.validationError).toContain('não pode ser menor que o total já recebido')
  })

  it('Validação de limite: alerta quando quantidade excede o que faz sentido para a demanda', () => {
    const op1 = makeOpShortage('op_1', '000488/2026', 10)
    const op2 = makeOpShortage('op_2', '000486/2026', 10)
    const allShortages = [op1, op2] // Demanda total = 20

    const plan = calculateBatchQuantityPlan({
      item: op1,
      targetNewQuantity: 8000, // Demanda é 20, 8000 excede muito o teto
      allShortages,
    })

    expect(plan.isAboveSensibleDemand).toBe(true)
    expect(plan.validationError).toContain('excede amplamente o que faz sentido para a demanda')
  })

  it('Preserva regra de saldo residual para Cotações quando a quantidade comprada for menor que a demanda', () => {
    const op1 = makeOpShortage('op_1', '000488/2026', 10)
    const op2 = makeOpShortage('op_2', '000486/2026', 15)
    const surplus = makeSurplusShortage('surplus_1', 0)
    const allShortages = [op1, op2, surplus] // Demanda total = 25

    const plan = calculateBatchQuantityPlan({
      item: surplus,
      targetNewQuantity: 18, // Comprou 18 de 25 solicitados
      allShortages,
    })

    expect(plan.residualQty).toBe(7) // 25 - 18 = 7 un permanecem pendentes
    expect(plan.surplusQty).toBe(0)
  })
})
