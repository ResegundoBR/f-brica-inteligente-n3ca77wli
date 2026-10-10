migrate(
  (app) => {
    console.log('[MIGRATION 0143] Etapa 2 Suprimentos: Blindagem Server-Side ativa.')
    // As blindagens de regras 1 a 6 operam via hooks server-side (pb_hooks):
    // 1. material_shortages: received_quantity <= quantity
    // 2. material_shortages: lote consolidado exclusivo por código (batch_id)
    // 3. material_shortages: máquina de estados validada
    // 4. inventory_movements: quantity > 0, tipo coerente e trava de saldo negativo (exceto ajustes)
    // 5. ordem_compra_itens: quantity > 0, descrição obrigatória e vínculo válido com OC
    // 6. material_shortages: rejeição de códigos com letras minúsculas "l" ou "o" em sequência numérica na criação
  },
  (app) => {
    console.log('[MIGRATION 0143] Reversão de blindagem server-side.')
  },
)
