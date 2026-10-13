/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0150:
 * 1) Corrigir a composição do produto PENDENTE UPPER (id 97aovm7czgt0474):
 *    componente 05200031 PRENSA CABO Ø15X35MM = 1 PC por unidade.
 * 2) Corrigir as 3 solicitações fracionadas em material_shortages do lote_audit_1791915564241_jxi46:
 *    - b6mu0ud96s6riqs (OP 000488, 4 PC): quantity = 4
 *    - eetgl3qs0espha5 (OP 000456, 1 PC): quantity = 1
 *    - vse1qdoss8lwhl0 (OP 000501, 2 PC): quantity = 2
 *    Totalizando 7 PC inteiros com observação de auditoria preservada.
 */
migrate(
  (app) => {
    function unwrapJson(raw) {
      if (!raw) return null
      if (typeof raw === 'object' && !Array.isArray(raw)) return raw
      var current = raw
      if (typeof current !== 'string') {
        try {
          current = JSON.stringify(current)
        } catch (_) {
          return raw
        }
      }
      var loops = 0
      while (loops < 10) {
        loops++
        try {
          var parsed = JSON.parse(current)
          if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'number') {
            var str = ''
            for (var b = 0; b < parsed.length; b += 5000) {
              str += String.fromCharCode.apply(null, parsed.slice(b, b + 5000))
            }
            current = str
          } else if (typeof parsed === 'string') {
            current = parsed
          } else {
            return parsed
          }
        } catch (_) {
          return current
        }
      }
      return current
    }

    console.log('[MIGRATION 0150] Iniciando correção de composição e material_shortages...')

    // -------------------------------------------------------------------------
    // 1. CORREÇÃO DO PRODUTO PENDENTE UPPER (97aovm7czgt0474)
    // -------------------------------------------------------------------------
    var product = null
    try {
      product = app.findRecordById('products', '97aovm7czgt0474')
    } catch (e) {
      console.warn('[MIGRATION 0150] Produto 97aovm7czgt0474 não encontrado: ' + String(e))
    }

    if (product) {
      var rawData = product.get('data')
      var pData = unwrapJson(rawData) || {}
      var compList = pData.composition || []
      var changedComp = false

      for (var i = 0; i < compList.length; i++) {
        var c = compList[i]
        var code = (c.code || '').trim()
        if (code === '05200031') {
          console.log(
            '[MIGRATION 0150] Atualizando composição PENDENTE UPPER: 05200031 de ' +
              c.quantity +
              ' para 1',
          )
          c.quantity = '1'
          changedComp = true
        }
      }

      if (changedComp) {
        pData.composition = compList
        product.set('data', JSON.stringify(pData))
        app.save(product)
        console.log('[MIGRATION 0150] Produto 97aovm7czgt0474 atualizado com sucesso!')
      } else {
        console.log(
          '[MIGRATION 0150] Componente 05200031 não encontrado na composição ou já corrigido.',
        )
      }
    }

    // -------------------------------------------------------------------------
    // 2. CORREÇÃO DAS 3 SOLICITAÇÕES DO LOTE lote_audit_1791915564241_jxi46
    // -------------------------------------------------------------------------
    var targetShortages = [
      { id: 'b6mu0ud96s6riqs', targetQty: 4, op: '000488/2026' },
      { id: 'eetgl3qs0espha5', targetQty: 1, op: '000456/2026' },
      { id: 'vse1qdoss8lwhl0', targetQty: 2, op: '000501/2026' },
    ]

    for (var sIdx = 0; sIdx < targetShortages.length; sIdx++) {
      var item = targetShortages[sIdx]
      try {
        var record = app.findRecordById('material_shortages', item.id)
        var curQty = Number(record.getFloat('quantity')) || 0
        var curObs = record.getString('observation') || ''
        console.log(
          '[MIGRATION 0150] Ajustando shortage ' +
            item.id +
            ' (OP ' +
            item.op +
            ') de ' +
            curQty +
            ' para ' +
            item.targetQty,
        )

        record.set('quantity', item.targetQty)
        var auditNote =
          'Ajuste auditoria: quantidade corrigida de ' +
          curQty +
          ' para ' +
          item.targetQty +
          ' PC inteiras (esperado da OP, separação #1 total 7 PC)'
        var newObs = curObs ? curObs + ' | ' + auditNote : auditNote
        record.set('observation', newObs)

        app.save(record)
        console.log('[MIGRATION 0150] Shortage ' + item.id + ' salvo com sucesso.')
      } catch (err) {
        console.warn('[MIGRATION 0150] Falha ao ajustar shortage ' + item.id + ': ' + String(err))
      }
    }

    console.log('[MIGRATION 0150] Finalizado com sucesso!')
  },
  (app) => {
    // Revert opcional
  },
)
