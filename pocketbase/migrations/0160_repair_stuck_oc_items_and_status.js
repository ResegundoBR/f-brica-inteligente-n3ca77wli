/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0160: Reparo idempotente de OCs travadas como Pendente/Enviada por falta de
 * sincronização de received_quantity nos itens de ordem_compra_itens.
 *
 * Regra:
 * Para cada ordem de compra com status 'Pendente' ou 'Enviada':
 * - Inspeciona todos os seus itens (ordem_compra_itens).
 * - Para cada item:
 *   - Se tem shortage vinculado (material_shortage_id): lê LIVE o shortage no banco.
 *   - Se não tem shortage: verifica se received_quantity == quantity.
 * - Se TODOS os itens da OC atendem à condição de estarem 100% recebidos:
 *   (ou seja, shortage vinculado está 'Recebido' e sRcvd >= sQty, OU sem shortage com received_quantity == quantity)
 *   mas algum item tem received_quantity < quantity:
 *   - Grava received_quantity = quantity no item divergente (float-safe preservando frações MT).
 *   - Registra log detalhado das alterações.
 *   - Deixa a checagem existente promover a OC para 'Recebida'.
 * - Não toca em estoque (inventory), movimentações (inventory_movements), OPs nem shortages.
 * - Leitura LIVE obrigatória dos valores gravados no banco para garantir verificação anti byte-array do Goja.
 */

migrate(
  (app) => {
    console.log('[MIGRATION 0160] === INÍCIO DO REPARO DE OCS TRAVADAS (LEITURA LIVE) ===')

    function safeParseFloat(val) {
      if (val === null || val === undefined) return 0
      if (typeof val === 'number') {
        return isNaN(val) ? 0 : val
      }
      var s = String(val).trim()
      if (!s) return 0
      s = s.replace(',', '.')
      var n = parseFloat(s)
      return isNaN(n) ? 0 : n
    }

    function getRecordFloat(rec, field) {
      if (!rec) return 0
      var raw = null
      try {
        raw = rec.get(field)
      } catch (_) {}
      if (raw !== null && raw !== undefined && raw !== '') {
        var parsed = safeParseFloat(raw)
        if (parsed !== 0 || String(raw).trim() === '0') {
          return parsed
        }
      }
      try {
        var gf = rec.getFloat(field)
        if (gf !== 0) return gf
      } catch (_) {}
      try {
        var gs = rec.getString(field)
        if (gs) return safeParseFloat(gs)
      } catch (_) {}
      try {
        return safeParseFloat(rec.getInt(field))
      } catch (_) {}
      return 0
    }

    var pendingOcs = []
    try {
      pendingOcs = app.findRecordsByFilter(
        'ordens_de_compra',
        "status = 'Pendente' || status = 'Enviada'",
        'created',
        500,
        0,
      )
    } catch (err) {
      console.log('[MIGRATION 0160] Erro ao buscar OCs pendentes/enviadas: ' + String(err))
      return
    }

    console.log('[MIGRATION 0160] Total de OCs Pendente/Enviada analisadas: ' + pendingOcs.length)

    var repairedItemsCount = 0
    var promotedOcsCount = 0

    for (var i = 0; i < pendingOcs.length; i++) {
      var oc = pendingOcs[i]
      var ocId = oc.id
      var ocNumber = oc.getString('oc_number') || ocId

      var ocItems = []
      try {
        ocItems = app.findRecordsByFilter(
          'ordem_compra_itens',
          "oc_id = '" + ocId.replace(/'/g, "''") + "'",
          'created',
          200,
          0,
        )
      } catch (findItemsErr) {
        console.log(
          '[MIGRATION 0160] Erro ao buscar itens da OC ' + ocNumber + ': ' + String(findItemsErr),
        )
        continue
      }

      if (!ocItems || ocItems.length === 0) {
        continue
      }

      // Analisar se TODOS os itens da OC estão qualificados como 100% recebidos
      var allItemsQualify = true
      var divergentItems = []

      for (var j = 0; j < ocItems.length; j++) {
        var it = ocItems[j]
        var itQty = getRecordFloat(it, 'quantity')
        var itRcvd = getRecordFloat(it, 'received_quantity')
        var stId = (it.getString('material_shortage_id') || '').trim()

        if (stId) {
          // Tem shortage vinculado -> leitura LIVE no banco
          var shortage = null
          try {
            shortage = app.findRecordById('material_shortages', stId)
          } catch (_) {}

          if (!shortage) {
            // Shortage não encontrado
            allItemsQualify = false
            break
          }

          var stStatus = shortage.getString('status') || ''
          var stQty = getRecordFloat(shortage, 'quantity')
          var stRcvd = getRecordFloat(shortage, 'received_quantity')

          var isShortageReceived =
            stStatus === 'Recebido' || (stQty > 0 && stRcvd >= stQty - 0.0001)

          if (!isShortageReceived) {
            // Este item ainda tem shortage que NÃO está Recebido
            allItemsQualify = false
            break
          }

          // Shortage está Recebido. Se o item de OC tiver recebido < quantidade comprada, é divergente
          if (itRcvd < itQty - 0.0001) {
            divergentItems.push({
              item: it,
              targetQty: itQty,
              shortage: shortage,
            })
          }
        } else {
          // Sem shortage vinculado
          // Precisa que o item já tenha sido recebido (received_quantity == quantity)
          if (itRcvd < itQty - 0.0001) {
            // Item avulso sem shortage e não recebido -> a OC não está 100% recebida
            allItemsQualify = false
            break
          }
        }
      }

      // Se TODOS os itens têm shortage vinculado Recebido (ou sem shortage e received_quantity=quantity)
      // e há itens divergentes:
      if (allItemsQualify && divergentItems.length > 0) {
        console.log(
          '[MIGRATION 0160] OC #' +
            ocNumber +
            ' (id: ' +
            ocId +
            ') qualificada para reparo: ' +
            divergentItems.length +
            ' item(ns) divergente(s)',
        )

        for (var d = 0; d < divergentItems.length; d++) {
          var div = divergentItems[d]
          var dItem = div.item
          var dTarget = div.targetQty
          var oldRcvd = getRecordFloat(dItem, 'received_quantity')
          var code = dItem.getString('code') || ''

          dItem.set('received_quantity', dTarget)
          app.save(dItem)

          // LEITURA LIVE DIRETA PARA CONFIRMAR GRAVAÇÃO (anti byte-array do Goja)
          var liveItem = app.findRecordById('ordem_compra_itens', dItem.id)
          var verifiedRcvd = getRecordFloat(liveItem, 'received_quantity')
          if (Math.abs(verifiedRcvd - dTarget) > 0.0001) {
            throw new Error(
              '[MIGRATION 0160] Falha ao verificar gravação LIVE do item ' +
                dItem.id +
                ': gravado ' +
                verifiedRcvd +
                ' != esperado ' +
                dTarget,
            )
          }

          repairedItemsCount++
          console.log(
            '[MIGRATION 0160] Item reparado id=' +
              dItem.id +
              ' code=' +
              code +
              ' received_quantity: ' +
              oldRcvd +
              ' -> ' +
              verifiedRcvd,
          )
        }

        // Checagem existente para promover a OC para 'Recebida'
        var allLiveItems = app.findRecordsByFilter(
          'ordem_compra_itens',
          "oc_id = '" + ocId.replace(/'/g, "''") + "'",
          'created',
          200,
          0,
        )

        var ocNowComplete = true
        for (var c = 0; c < allLiveItems.length; c++) {
          var chkTotal = getRecordFloat(allLiveItems[c], 'quantity')
          var chkRcvd = getRecordFloat(allLiveItems[c], 'received_quantity')
          if (chkTotal > 0 && chkRcvd < chkTotal - 0.0001) {
            ocNowComplete = false
            break
          }
        }

        if (ocNowComplete) {
          oc.set('status', 'Recebida')
          app.save(oc)

          // LEITURA LIVE da OC
          var liveOc = app.findRecordById('ordens_de_compra', ocId)
          if (liveOc.getString('status') !== 'Recebida') {
            throw new Error(
              '[MIGRATION 0160] Falha ao promover OC ' + ocNumber + ' para Recebida no banco',
            )
          }

          promotedOcsCount++
          console.log(
            '[MIGRATION 0160] OC #' +
              ocNumber +
              ' (id: ' +
              ocId +
              ') promovida com sucesso para status "Recebida" (LIVE verificado)',
          )
        }
      }
    }

    console.log(
      '[MIGRATION 0160] === FIM DO REPARO: ' +
        repairedItemsCount +
        ' itens corrigidos e ' +
        promotedOcsCount +
        ' OCs promovidas para Recebida. ===',
    )
  },
  (app) => {},
)
