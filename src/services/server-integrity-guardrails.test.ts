import { describe, it, expect } from 'vitest'

/**
 * Testes unitários para validar a lógica das regras de blindagem no servidor (Etapa 2 Suprimentos)
 * 1. received_quantity <= quantity
 * 2. Lote consolidado exclusivo por código (batch_id)
 * 3. Máquina de estados de material_shortages
 * 4. inventory_movements: quantity > 0 e saldo coerente
 * 5. ordem_compra_itens: quantity > 0 e coerência
 * 6. Códigos de material com erros de digitação (ex: 05100l0105)
 */

describe('Blindagem Server-Side - Regras de Validação', () => {
  describe('Regra 1: received_quantity <= quantity', () => {
    function validateReceivedQuantity(quantity: number, received_quantity: number) {
      if (received_quantity < 0) {
        return { valid: false, error: 'A quantidade recebida não pode ser negativa.' }
      }
      if (quantity > 0 && received_quantity > quantity + 0.0001) {
        return {
          valid: false,
          error: `A quantidade recebida (${received_quantity}) não pode exceder a quantidade total (${quantity}).`,
        }
      }
      return { valid: true }
    }

    it('deve aceitar quando recebido for igual à quantidade solicitada', () => {
      const res = validateReceivedQuantity(10, 10)
      expect(res.valid).toBe(true)
    })

    it('deve aceitar quando recebido for menor que a quantidade solicitada (parcial)', () => {
      const res = validateReceivedQuantity(10, 4)
      expect(res.valid).toBe(true)
    })

    it('deve bloquear quando recebido for maior que a quantidade solicitada', () => {
      const res = validateReceivedQuantity(10, 15)
      expect(res.valid).toBe(false)
      expect(res.error).toContain('não pode exceder')
    })

    it('deve bloquear quantidade recebida negativa', () => {
      const res = validateReceivedQuantity(10, -1)
      expect(res.valid).toBe(false)
      expect(res.error).toContain('não pode ser negativa')
    })
  })

  describe('Regra 2: Lote consolidado exclusivo por código (batch_id)', () => {
    function validateBatchCodeUniformity(
      batchId: string,
      targetCode: string,
      existingMembers: Array<{ code: string; batch_id: string }>,
    ) {
      if (!batchId || !targetCode) return { valid: true }
      for (const m of existingMembers) {
        if (m.batch_id === batchId && m.code.toUpperCase() !== targetCode.toUpperCase()) {
          return {
            valid: false,
            error: `Lote consolidado inválido: o lote "${batchId}" já pertence ao código ${m.code} e não pode conter itens de outro código (${targetCode}).`,
          }
        }
      }
      return { valid: true }
    }

    it('deve permitir adicionar item com o mesmo código do lote', () => {
      const members = [
        { code: '05100030', batch_id: 'lote_123' },
        { code: '05100030', batch_id: 'lote_123' },
      ]
      const res = validateBatchCodeUniformity('lote_123', '05100030', members)
      expect(res.valid).toBe(true)
    })

    it('deve bloquear adicionar item com código diferente ao mesmo lote', () => {
      const members = [{ code: '05100030', batch_id: 'lote_123' }]
      const res = validateBatchCodeUniformity('lote_123', '05100263', members)
      expect(res.valid).toBe(false)
      expect(res.error).toContain('já pertence ao código 05100030')
    })
  })

  describe('Regra 3: Máquina de estados de material_shortages', () => {
    function validateStatusTransition(oldStatus: string, newStatus: string) {
      if (!oldStatus || !newStatus || oldStatus === newStatus) return { valid: true }

      if (oldStatus === 'Pendente') {
        if (newStatus === 'Recebido' || newStatus === 'Recebido_Parcial') {
          return { valid: false, error: 'Pendente não pode ir direto para Recebido' }
        }
      } else if (oldStatus === 'Liberado_Estoque') {
        if (newStatus === 'Recebido' || newStatus === 'Recebido_Parcial') {
          return { valid: false, error: 'Liberado_Estoque não pode receber mercadoria externa' }
        }
      } else if (oldStatus === 'Cotação') {
        if (newStatus === 'Recebido' || newStatus === 'Recebido_Parcial') {
          return { valid: false, error: 'Cotação deve avançar para Compra antes do Recebimento' }
        }
      } else if (oldStatus === 'Cancelado') {
        if (newStatus === 'Recebido' || newStatus === 'Recebido_Parcial') {
          return { valid: false, error: 'Cancelado não pode ser finalizado direto como Recebido' }
        }
      }

      return { valid: true }
    }

    it('permite transições legítimas do fluxo', () => {
      expect(validateStatusTransition('Pendente', 'Cotação').valid).toBe(true)
      expect(validateStatusTransition('Pendente', 'Liberado_Estoque').valid).toBe(true)
      expect(validateStatusTransition('Pendente', 'Compra').valid).toBe(true)
      expect(validateStatusTransition('Pendente', 'Cancelado').valid).toBe(true)
      expect(validateStatusTransition('Cotação', 'Compra').valid).toBe(true)
      expect(validateStatusTransition('Cotação', 'Cancelado').valid).toBe(true)
      expect(validateStatusTransition('Compra', 'Recebido').valid).toBe(true)
      expect(validateStatusTransition('Compra', 'Recebido_Parcial').valid).toBe(true)
      expect(validateStatusTransition('Compra', 'Cancelado').valid).toBe(true)
      expect(validateStatusTransition('Compra', 'Cotação').valid).toBe(true) // Split / reversão
      expect(validateStatusTransition('Recebido_Parcial', 'Recebido').valid).toBe(true)
      expect(validateStatusTransition('Recebido_Parcial', 'Cancelado').valid).toBe(true)
    })

    it('bloqueia saltos ilegais que geram corrupção ou contornam o processo', () => {
      expect(validateStatusTransition('Pendente', 'Recebido').valid).toBe(false)
      expect(validateStatusTransition('Pendente', 'Recebido_Parcial').valid).toBe(false)
      expect(validateStatusTransition('Liberado_Estoque', 'Recebido').valid).toBe(false)
      expect(validateStatusTransition('Cotação', 'Recebido').valid).toBe(false)
      expect(validateStatusTransition('Cancelado', 'Recebido').valid).toBe(false)
    })
  })

  describe('Regra 4: inventory_movements (quantity > 0 e saldo coerente)', () => {
    function validateInventoryMovement(
      currentStock: number,
      type: 'Entrada' | 'Saída',
      qty: number,
      reason: string,
    ) {
      if (qty <= 0) return { valid: false, error: 'Quantidade deve ser maior que zero' }
      const isAdjustment =
        reason.toLowerCase().includes('ajuste') ||
        reason.toLowerCase().includes('retroativ') ||
        reason.toLowerCase().includes('reconcilia')

      if (type === 'Saída' && qty > currentStock && !isAdjustment) {
        return { valid: false, error: 'Saldo insuficiente no estoque' }
      }

      const balance_after = type === 'Entrada' ? currentStock + qty : currentStock - qty
      return { valid: true, balance_after }
    }

    it('deve aprovar entrada e somar ao saldo', () => {
      const res = validateInventoryMovement(10, 'Entrada', 5, 'Compra')
      expect(res.valid).toBe(true)
      expect(res.balance_after).toBe(15)
    })

    it('deve aprovar saída com saldo suficiente', () => {
      const res = validateInventoryMovement(10, 'Saída', 4, 'Separação OP 100')
      expect(res.valid).toBe(true)
      expect(res.balance_after).toBe(6)
    })

    it('deve bloquear saída sem saldo suficiente quando não for ajuste', () => {
      const res = validateInventoryMovement(5, 'Saída', 10, 'Consumo comum')
      expect(res.valid).toBe(false)
      expect(res.error).toContain('Saldo insuficiente')
    })

    it('deve permitir saída maior que o saldo quando for Ajuste/Retroativo explícito', () => {
      const res = validateInventoryMovement(2, 'Saída', 5, 'Ajuste de inventário anual')
      expect(res.valid).toBe(true)
    })
  })

  describe('Regra 5: ordem_compra_itens (quantity > 0 e OC existente)', () => {
    function validateOcItem(ocId: string, desc: string, qty: number) {
      if (!ocId) return { valid: false, error: 'OC pai obrigatória' }
      if (!desc.trim()) return { valid: false, error: 'Descrição obrigatória' }
      if (qty <= 0) return { valid: false, error: 'Quantidade deve ser maior que zero' }
      return { valid: true }
    }

    it('deve aprovar item de OC válido', () => {
      const res = validateOcItem('oc_123', 'Parafuso Allen M4', 50)
      expect(res.valid).toBe(true)
    })

    it('deve rejeitar item com quantidade zero ou negativa', () => {
      expect(validateOcItem('oc_123', 'Parafuso Allen M4', 0).valid).toBe(false)
      expect(validateOcItem('oc_123', 'Parafuso Allen M4', -5).valid).toBe(false)
    })

    it('deve rejeitar item sem descrição', () => {
      expect(validateOcItem('oc_123', '   ', 10).valid).toBe(false)
    })
  })

  describe('Regra 6: Validação de caracteres inválidos no código (letras minúsculas "l" ou "o")', () => {
    function validateMaterialCode(code: string) {
      const trimmed = code.trim()
      if (/[0-9]+[loLO][0-9]+/.test(trimmed)) {
        return {
          valid: false,
          error: 'Código de material contém letras suspeitas ("l" ou "o" no meio de dígitos).',
        }
      }
      return { valid: true, code: trimmed }
    }

    it('deve aprovar códigos numéricos normais do catálogo', () => {
      expect(validateMaterialCode('05100030').valid).toBe(true)
      expect(validateMaterialCode('05090003').valid).toBe(true)
      expect(validateMaterialCode('14040046').valid).toBe(true)
    })

    it('deve aprovar códigos alfa padrão de fabricação (FAB...)', () => {
      expect(validateMaterialCode('FAB01075').valid).toBe(true)
    })

    it('deve bloquear caso clássico do bug real com letra no meio de dígitos (05100l0105)', () => {
      const res = validateMaterialCode('05100l0105')
      expect(res.valid).toBe(false)
      expect(res.error).toContain('letras suspeitas')
    })

    it('deve bloquear typos com letra O maiúscula ou minúscula no meio de números', () => {
      expect(validateMaterialCode('05100o0105').valid).toBe(false)
      expect(validateMaterialCode('05100O0105').valid).toBe(false)
    })
  })
})
