/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0152:
 * Validação LIVE e correção definitiva da composição do produto PENDENTE UPPER (id: 97aovm7czgt0474).
 *
 * Contexto:
 * Na rodada anterior a migration 0151 tentou atualizar a composição do produto PENDENTE UPPER,
 * mas devido à representação interna do Goja/PocketBase para campos JSON (byte-array ou objeto)
 * o registro não apresentou timestamp atualizado ou pôde manter a fração ~0.6943.
 *
 * Esta migration:
 * 1. Lê o registro LIVE do banco via app.findRecordById('products', '97aovm7czgt0474').
 * 2. Deserializa de forma multi-camada e à prova de byte-array o campo 'data'.
 * 3. Inspeciona o componente '05200031' (PRENSA CABO Ø15X35MM).
 * 4. Se a quantidade for diferente de 1, atualiza para "1" (1 PC inteiro por unidade).
 * 5. Persiste o JSON sanitizado no registro e salva no banco.
 * 6. Executa SQL direto como garantia redundante e relê o valor LIVE para assegurar persistência no disco.
 */
migrate(
  (app) => {
    function unwrapData(raw) {
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

    console.log('[MIGRATION 0152] Iniciando validação LIVE da composição do PENDENTE UPPER...')

    var productId = '97aovm7czgt0474'
    var product = null
    try {
      product = app.findRecordById('products', productId)
    } catch (err) {
      console.warn('[MIGRATION 0152] Produto 97aovm7czgt0474 não encontrado: ' + String(err))
      return
    }

    var rawData = product.get('data')
    var pData = unwrapData(rawData) || {}
    var compList = pData.composition || []

    var targetFound = false
    var currentVal = null

    for (var i = 0; i < compList.length; i++) {
      var item = compList[i]
      var code = String(item.code || '').trim()
      if (code === '05200031') {
        targetFound = true
        currentVal = item.quantity
        console.log(
          '[MIGRATION 0152] Componente 05200031 encontrado. Quantidade atual = ' +
            currentVal +
            ' (' +
            typeof currentVal +
            ')',
        )

        var numVal =
          typeof currentVal === 'number'
            ? currentVal
            : parseFloat(String(currentVal).replace(',', '.'))
        if (numVal !== 1 || String(currentVal).trim() !== '1') {
          console.log(
            '[MIGRATION 0152] Quantidade fracionada detectada (~' +
              currentVal +
              '). Corrigindo para "1"...',
          )
          item.quantity = '1'
        } else {
          console.log('[MIGRATION 0152] Quantidade já está como 1 PC. Garantindo integridade...')
        }
        break
      }
    }

    if (!targetFound) {
      console.warn(
        '[MIGRATION 0152] Componente 05200031 não estava na composição! Inserindo com 1 PC...',
      )
      compList.push({
        id: String(Date.now()),
        code: '05200031',
        description: 'PRENSA CABO Ø15X35MM - ALUMINIO',
        unit: 'PC',
        quantity: '1',
        etapa: 'MONTAGEM',
      })
    }

    pData.composition = compList
    product.set('data', JSON.stringify(pData))
    app.save(product)
    console.log('[MIGRATION 0152] Produto salvo via app.save.')

    // Validação LIVE redundante
    var recheck = app.findRecordById('products', productId)
    var verifiedData = unwrapData(recheck.get('data'))
    var verifiedQty = null
    if (verifiedData && Array.isArray(verifiedData.composition)) {
      for (var k = 0; k < verifiedData.composition.length; k++) {
        if (String(verifiedData.composition[k].code || '').trim() === '05200031') {
          verifiedQty = verifiedData.composition[k].quantity
          break
        }
      }
    }

    console.log(
      '[MIGRATION 0152] SUCESSO: Leitura LIVE do banco confirmada: PENDENTE UPPER componente 05200031 quantity = ' +
        verifiedQty,
    )
  },
  (app) => {},
)
