/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0151:
 * Corrigir via app.findRecordById + unwrapJson do byte array no Goja
 * a composição do produto PENDENTE UPPER (97aovm7czgt0474).
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

    console.log('[MIGRATION 0151] Reparando composição do produto PENDENTE UPPER...')

    var product = app.findRecordById('products', '97aovm7czgt0474')
    if (!product) {
      console.warn('[MIGRATION 0151] Produto 97aovm7czgt0474 não encontrado!')
      return
    }

    var rawData = product.get('data')
    var pData = unwrapJson(rawData)
    if (!pData || typeof pData !== 'object') {
      console.warn('[MIGRATION 0151] Falha ao extrair pData de 97aovm7czgt0474')
      return
    }

    var comp = pData.composition || []
    var found = false
    for (var i = 0; i < comp.length; i++) {
      var item = comp[i]
      var code = String(item.code || '').trim()
      if (code === '05200031') {
        console.log(
          '[MIGRATION 0151] Componente 05200031 encontrado com quantidade=' +
            item.quantity +
            '. Corrigindo para "1"...',
        )
        item.quantity = '1'
        found = true
      }
    }

    if (found) {
      pData.composition = comp
      product.set('data', pData)
      app.save(product)
      console.log('[MIGRATION 0151] Produto 97aovm7czgt0474 salvo com data atualizado!')

      // Validação live
      var recheck = app.findRecordById('products', '97aovm7czgt0474')
      var checkData = unwrapJson(recheck.get('data'))
      var valQty = null
      if (checkData && checkData.composition) {
        for (var k = 0; k < checkData.composition.length; k++) {
          if (String(checkData.composition[k].code || '').trim() === '05200031') {
            valQty = checkData.composition[k].quantity
            break
          }
        }
      }
      console.log(
        '[MIGRATION 0151] VALIDAÇÃO LIVE BANCO: PENDENTE UPPER 05200031 quantity = ' + valQty,
      )
    } else {
      console.warn('[MIGRATION 0151] Item 05200031 não localizado na composição!')
    }
  },
  (app) => {},
)
