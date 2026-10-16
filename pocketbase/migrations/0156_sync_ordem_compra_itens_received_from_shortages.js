/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0156: Reparo idempotente de sincronização entre material_shortages e ordem_compra_itens
 *
 * Corrige o descompasso histórico onde a distribuição física de recebimento via material_shortages
 * não atualizou ordem_compra_itens.received_quantity.
 *
 * Requisitos:
 * 1. Leitura LIVE direta dos valores do banco (padrão anti byte-array das migrations 0146/0147).
 * 2. Para cada registro de ordem_compra_itens com material_shortage_id preenchido:
 *    - Se o shortage está Recebido (shortage.received_quantity >= shortage.quantity) ou Recebido_Parcial:
 *      se oc_item.received_quantity < shortage.received_quantity (ou = 0),
 *      gravar no item da OC a quantidade recebida do shortage (respeitando teto da quantidade do item e float-safe).
 * 3. Nunca atualizar outros registros do mesmo código — apenas o item estritamente vinculado por material_shortage_id.
 * 4. Preservar frações MT (cabo/barra/tubo) — float-safe via safeParseFloat e arredondamento 4 decimais.
 * 5. Idempotente: se já estiver sincronizado, não altera nada.
 */

migrate(
  (app) => {
    console.log(
      '[MIGRATION 0156] === INÍCIO DO REPARO DE RECEBIMENTO EM ordem_compra_itens (LEITURA LIVE) ===',
    )

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

    var ocItems = []
    try {
      ocItems = app.findRecordsByFilter(
        'ordem_compra_itens',
        "material_shortage_id != ''",
        'created',
        5000,
        0,
      )
    } catch (err) {
      console.log(
        '[MIGRATION 0156] Erro ao buscar ordem_compra_itens com material_shortage_id: ' + err,
      )
      return
    }

    console.log(
      '[MIGRATION 0156] Total de itens de OC com material_shortage_id vinculados encontrados: ' +
        ocItems.length,
    )

    var updatedCount = 0

    for (var i = 0; i < ocItems.length; i++) {
      var item = ocItems[i]
      var itemId = item.id
      var shortageId = (item.getString('material_shortage_id') || '').trim()
      if (!shortageId) continue

      var shortage = null
      try {
        // LEITURA LIVE DO BANCO
        shortage = app.findRecordById('material_shortages', shortageId)
      } catch (findErr) {
        // Shortage foi deletado ou não existe
        continue
      }

      if (!shortage) continue

      var shortageStatus = shortage.getString('status') || ''
      var shortageTotalQty = getRecordFloat(shortage, 'quantity')
      var shortageRcvd = getRecordFloat(shortage, 'received_quantity')

      // Verificar se o shortage possui recebimento (Recebido ou Recebido_Parcial, ou received_quantity > 0)
      if (
        shortageStatus !== 'Recebido' &&
        shortageStatus !== 'Recebido_Parcial' &&
        shortageRcvd <= 0
      ) {
        continue
      }

      var itemTotalQty = getRecordFloat(item, 'quantity')
      var itemCurRcvd = getRecordFloat(item, 'received_quantity')

      // Quantidade a ser sincronizada:
      // Se o shortage está Recebido (shortageRcvd >= shortageTotalQty ou status='Recebido'),
      // ou Recebido_Parcial, o valor a gravar é o shortageRcvd.
      var targetRcvd = shortageRcvd
      if (targetRcvd <= 0 && shortageStatus === 'Recebido') {
        targetRcvd = shortageTotalQty
      }

      // Teto pela quantidade comprada na OC
      if (itemTotalQty > 0 && targetRcvd > itemTotalQty) {
        targetRcvd = itemTotalQty
      }

      targetRcvd = Math.round(targetRcvd * 10000) / 10000

      // Se o item da OC já tem received_quantity igual ou superior ao targetRcvd, nada a fazer (idempotência)
      if (Math.abs(itemCurRcvd - targetRcvd) < 0.0001 || itemCurRcvd >= targetRcvd) {
        continue
      }

      // Atualiza o item de ordem_compra_itens estritamente vinculado
      var ocId = item.getString('oc_id') || ''
      var itemCode = item.getString('code') || shortage.getString('code') || ''
      var itemDesc = item.getString('description') || ''

      item.set('received_quantity', targetRcvd)
      if (itemCode && !item.getString('code')) {
        item.set('code', itemCode)
      }

      try {
        app.save(item)
        updatedCount++
        console.log(
          '[MIGRATION 0156] REPARADO item OC id=' +
            itemId +
            ' (OC: ' +
            ocId +
            ', code: ' +
            itemCode +
            '): received_quantity ' +
            itemCurRcvd +
            ' -> ' +
            targetRcvd +
            ' (Shortage ' +
            shortageId +
            ' status=' +
            shortageStatus +
            ' rcvd=' +
            shortageRcvd +
            '/' +
            shortageTotalQty +
            ')',
        )
      } catch (saveErr) {
        console.log(
          '[MIGRATION 0156] Falha ao atualizar item de OC ' + itemId + ': ' + String(saveErr),
        )
      }
    }

    console.log(
      '[MIGRATION 0156] === FIM DO REPARO: ' +
        updatedCount +
        ' registros de ordem_compra_itens atualizados. ===',
    )
  },
  (app) => {
    // Migration de dados irreversível / no-op no rollback
  },
)
