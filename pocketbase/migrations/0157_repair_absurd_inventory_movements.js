/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0157: Anulação de movimentações absurdas de saída (erros de digitação)
 * e ajuste float-safe do saldo de estoque.
 *
 * Registros afetados:
 * 1) inventory_movements o5rimu1i7w5psj9 (105.100.188 un do item 05100188, inventory 5fwyfkfc8pl3ji9)
 *    -> Entrada compensatória de 105.100.188 un com reason '[ANULADA — erro de digitação]'
 *    -> inventory 5fwyfkfc8pl3ji9.quantity ajustado para 84 (float-safe)
 *
 * 2) inventory_movements 1uz090jm1xfi4uj (5.730 un do item 11120024, inventory 98xrgwrxxehi2wz)
 *    -> Entrada compensatória de 5.730 un com reason '[ANULADA — erro de digitação]'
 *    -> inventory 98xrgwrxxehi2wz.quantity ajustado para 7 (float-safe)
 *
 * Padrão anti byte-array com leitura LIVE e verificação final no banco.
 */

migrate(
  (app) => {
    console.log('[MIGRATION 0157] Iniciando anulação de movimentações absurdas de saída...')

    var movCol = app.findCollectionByNameOrId('inventory_movements')
    var nowIso = new Date().toISOString()
    var todayStr = nowIso.split('T')[0]

    // -------------------------------------------------------------------------
    // CASO 1: Item 05100188 (inventory 5fwyfkfc8pl3ji9, saída o5rimu1i7w5psj9 = 105.100.188 un)
    // -------------------------------------------------------------------------
    var inv1 = null
    try {
      inv1 = app.findRecordById('inventory', '5fwyfkfc8pl3ji9')
    } catch (e1) {
      console.warn(
        '[MIGRATION 0157] Inventory 5fwyfkfc8pl3ji9 não encontrado por ID, buscando por código...',
      )
      try {
        inv1 = app.findFirstRecordByFilter('inventory', 'code = "05100188"')
      } catch (_) {}
    }

    if (inv1) {
      var existingComp1 = app.findRecordsByFilter(
        'inventory_movements',
        'inventory_id = "' +
          inv1.id +
          '" && type = "Entrada" && reason ~ "[ANULADA — erro de digitação]"',
        '-created',
        1,
        0,
      )

      if (existingComp1.length === 0) {
        var compMov1 = new Record(movCol)
        compMov1.set('inventory_id', inv1.id)
        compMov1.set('type', 'Entrada')
        compMov1.set('quantity', 105100188)
        compMov1.set(
          'reason',
          '[ANULADA — erro de digitação] Anulação da saída o5rimu1i7w5psj9 (105.100.188 un)',
        )
        compMov1.set('arrival_date', todayStr)
        compMov1.set('balance_after', 84)
        app.save(compMov1)
        console.log('[MIGRATION 0157] Entrada compensatória 1 criada com sucesso.')
      } else {
        console.log('[MIGRATION 0157] Entrada compensatória 1 já existia (idempotente).')
      }

      // IMPORTANTE: salvar a Entrada compensatória acima dispara o hook on_inventory_movement_create,
      // que somou 105.100.188 ao saldo atual (que era 84 antes da compensação, ficando 105.100.272).
      // Agora recarregamos o registro e forçamos o saldo exato para 84:
      var inv1Reloaded = app.findRecordById('inventory', inv1.id)
      inv1Reloaded.set('quantity', 84)
      app.save(inv1Reloaded)
      console.log('[MIGRATION 0157] Saldo do item 05100188 forçado para 84.')
    } else {
      console.error('[MIGRATION 0157] Item 05100188 não localizado no estoque!')
    }

    // -------------------------------------------------------------------------
    // CASO 2: Item 11120024 (inventory 98xrgwrxxehi2wz, saída 1uz090jm1xfi4uj = 5.730 un)
    // -------------------------------------------------------------------------
    var inv2 = null
    try {
      inv2 = app.findRecordById('inventory', '98xrgwrxxehi2wz')
    } catch (e2) {
      console.warn(
        '[MIGRATION 0157] Inventory 98xrgwrxxehi2wz não encontrado por ID, buscando por código...',
      )
      try {
        inv2 = app.findFirstRecordByFilter('inventory', 'code = "11120024"')
      } catch (_) {}
    }

    if (inv2) {
      var existingComp2 = app.findRecordsByFilter(
        'inventory_movements',
        'inventory_id = "' +
          inv2.id +
          '" && type = "Entrada" && reason ~ "[ANULADA — erro de digitação]"',
        '-created',
        1,
        0,
      )

      if (existingComp2.length === 0) {
        var compMov2 = new Record(movCol)
        compMov2.set('inventory_id', inv2.id)
        compMov2.set('type', 'Entrada')
        compMov2.set('quantity', 5730)
        compMov2.set(
          'reason',
          '[ANULADA — erro de digitação] Anulação da saída 1uz090jm1xfi4uj (5.730 un)',
        )
        compMov2.set('arrival_date', todayStr)
        compMov2.set('balance_after', 7)
        app.save(compMov2)
        console.log('[MIGRATION 0157] Entrada compensatória 2 criada com sucesso.')
      } else {
        console.log('[MIGRATION 0157] Entrada compensatória 2 já existia (idempotente).')
      }

      // Forçar saldo exato para 7
      var inv2Reloaded = app.findRecordById('inventory', inv2.id)
      inv2Reloaded.set('quantity', 7)
      app.save(inv2Reloaded)
      console.log('[MIGRATION 0157] Saldo do item 11120024 forçado para 7.')
    } else {
      console.error('[MIGRATION 0157] Item 11120024 não localizado no estoque!')
    }

    // -------------------------------------------------------------------------
    // VERIFICAÇÃO LIVE NO BANCO (Padrão anti byte-array)
    // -------------------------------------------------------------------------
    if (inv1) {
      var verify1 = app.findRecordById('inventory', inv1.id)
      var q1 = Number(verify1.getFloat('quantity'))
      if (Math.abs(q1 - 84) > 0.0001) {
        throw new Error(
          '[MIGRATION 0157] Verificação LIVE falhou: item 05100188 tem saldo ' +
            q1 +
            ' (esperado 84)',
        )
      }
      console.log('[MIGRATION 0157] Verificação LIVE 1 confirmada: saldo = ' + q1)
    }

    if (inv2) {
      var verify2 = app.findRecordById('inventory', inv2.id)
      var q2 = Number(verify2.getFloat('quantity'))
      if (Math.abs(q2 - 7) > 0.0001) {
        throw new Error(
          '[MIGRATION 0157] Verificação LIVE falhou: item 11120024 tem saldo ' +
            q2 +
            ' (esperado 7)',
        )
      }
      console.log('[MIGRATION 0157] Verificação LIVE 2 confirmada: saldo = ' + q2)
    }

    console.log('[MIGRATION 0157] === CONCLUÍDO COM SUCESSO ===')
  },
  (app) => {
    // Reversão
  },
)
