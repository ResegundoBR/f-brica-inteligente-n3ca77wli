/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0158: Ajuste final de saldo após anulação compensatória da 0157.
 * Como o hook on_inventory_movement_create adicionou a quantidade da Entrada compensatória
 * após a gravação da movimentação na migration 0157, esta migration garante
 * os saldos finais 84 e 7 no banco, com verificação LIVE obrigatória.
 * Envolvido em try/catch para idempotência e segurança em bancos vazios.
 */

migrate(
  (app) => {
    console.log('[MIGRATION 0158] Ajustando saldos de estoque para 84 e 7...')

    var inv1 = null
    try {
      inv1 = app.findRecordById('inventory', '5fwyfkfc8pl3ji9')
    } catch (_) {
      try {
        inv1 = app.findFirstRecordByFilter('inventory', 'code = "05100188"')
      } catch (_) {}
    }

    if (inv1) {
      inv1.set('quantity', 84)
      app.save(inv1)

      // Leitura LIVE no banco
      var v1 = app.findRecordById('inventory', inv1.id)
      var q1 = Number(v1.getFloat('quantity'))
      if (Math.abs(q1 - 84) > 0.0001) {
        throw new Error('[MIGRATION 0158] Falha ao verificar item 05100188: saldo ' + q1 + ' != 84')
      }
      console.log('[MIGRATION 0158] Item 05100188 verificado com sucesso: saldo = ' + q1)
    }

    var inv2 = null
    try {
      inv2 = app.findRecordById('inventory', '98xrgwrxxehi2wz')
    } catch (_) {
      try {
        inv2 = app.findFirstRecordByFilter('inventory', 'code = "11120024"')
      } catch (_) {}
    }

    if (inv2) {
      inv2.set('quantity', 7)
      app.save(inv2)

      // Leitura LIVE no banco
      var v2 = app.findRecordById('inventory', inv2.id)
      var q2 = Number(v2.getFloat('quantity'))
      if (Math.abs(q2 - 7) > 0.0001) {
        throw new Error('[MIGRATION 0158] Falha ao verificar item 11120024: saldo ' + q2 + ' != 7')
      }
      console.log('[MIGRATION 0158] Item 11120024 verificado com sucesso: saldo = ' + q2)
    }

    console.log('[MIGRATION 0158] === CONCLUÍDO COM SUCESSO ===')
  },
  (app) => {},
)
