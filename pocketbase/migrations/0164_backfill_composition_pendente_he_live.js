/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0164:
 * Refazer com validação LIVE estrita o backfill da composição do produto PENDENTE HE (id: rgmu0xiinpcsmiz)
 * a partir da OP mais recente (id: 384h4pie4d0cfk3 - OP 000571/2026).
 *
 * Regras:
 * 1. 8 itens na OP fonte:
 *    - 14010038, 14010035, 05330314, 05310188, 05310070, 05310019
 *    - Hastes sem código "HASTE SUPERIOR - HE" e "HASTE INFERIOR - HE" (entram por description).
 * 2. Normalização com trim dos códigos existentes e novos (ex. "\t14010038 " vira "14010038").
 * 3. Quantidade por peça = mat.quantity ÷ op.quantity (2 ÷ 2 = 1).
 * 4. Merge ADITIVO: nunca remove nem altera itens existentes de fabricação.
 * 5. Gravação via SQL direto (UPDATE products SET data) + update do model para garantir persistência no Goja/SQLite.
 * 6. LEITURA LIVE: reler o registro via app.findRecordById, validar total final de 8 itens.
 *    Se o total final não atingir 8 itens, lançar erro para a migration falhar explicitamente.
 */
migrate(
  (app) => {
    function unwrapData(raw) {
      if (!raw) return null
      if (typeof raw === 'object' && !Array.isArray(raw)) {
        try {
          var testKeys = Object.keys(raw)
          if (testKeys.length > 0 && typeof raw.composition !== 'undefined') {
            return raw
          }
        } catch (_) {}
      }
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

    console.log('[MIGRATION 0164] Iniciando refatoração LIVE do backfill PENDENTE HE...')

    var productId = 'rgmu0xiinpcsmiz'
    var orderId = '384h4pie4d0cfk3'

    var product = null
    try {
      product = app.findRecordById('products', productId)
    } catch (err) {
      throw new Error(
        '[MIGRATION 0164] Produto ' + productId + ' não encontrado no banco: ' + String(err),
      )
    }

    var order = null
    try {
      order = app.findRecordById('pcp_orders', orderId)
    } catch (err) {
      throw new Error('[MIGRATION 0164] OP ' + orderId + ' não encontrada: ' + String(err))
    }

    var opQty = Number(order.getFloat('quantity')) || 1
    if (opQty <= 0) opQty = 1

    var rawData = product.get('data')
    var pData = unwrapData(rawData) || {}
    var compList = Array.isArray(pData.composition) ? pData.composition : []

    console.log('[MIGRATION 0164] Itens já existentes na composição: ' + compList.length)

    // Buscar os 8 materiais da OP
    var materials = []
    try {
      materials = app.findRecordsByFilter(
        'pcp_order_materials',
        "order_id = '" + orderId + "'",
        'created',
        100,
        0,
      )
    } catch (err) {
      throw new Error(
        '[MIGRATION 0164] Falha ao ler pcp_order_materials da OP ' + orderId + ': ' + String(err),
      )
    }

    console.log('[MIGRATION 0164] Materiais lidos da OP ' + orderId + ': ' + materials.length)
    if (materials.length === 0) {
      throw new Error('[MIGRATION 0164] Nenhum material encontrado para a OP ' + orderId)
    }

    // Mapa de componentes cadastrados no catálogo para enriquecimento
    var compMap = {}
    try {
      var allComps = app.findRecordsByFilter(
        'components',
        'active = true || active = false',
        'code',
        1000,
        0,
      )
      for (var cIdx = 0; cIdx < allComps.length; cIdx++) {
        var cRec = allComps[cIdx]
        var codeVal = (cRec.getString('code') || '').trim()
        if (codeVal && !compMap[codeVal]) {
          compMap[codeVal] = {
            category: cRec.getString('category') || '',
            unit: cRec.getString('unit') || '',
            description: cRec.getString('description') || '',
          }
        }
      }
    } catch (eComps) {
      console.log('[MIGRATION 0164] Aviso ao carregar components: ' + String(eComps))
    }

    function normCode(str) {
      return (str || '').toString().trim()
    }
    function normDesc(str) {
      return (str || '')
        .toString()
        .trim()
        .toUpperCase()
        .replace(/[\t\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
    }

    // Normalizar itens existentes mantendo tudo intacto
    var existingCodes = {}
    var existingDescs = {}

    for (var i = 0; i < compList.length; i++) {
      var itm = compList[i]
      var rawC = normCode(itm.code)
      var rawD = normDesc(itm.description)
      // Normaliza no próprio item existente o código com trim
      if (rawC) {
        itm.code = rawC
        existingCodes[rawC] = true
      }
      if (rawD) {
        existingDescs[rawD] = true
      }
    }

    console.log(
      '[MIGRATION 0164] Códigos existentes normalizados: ' + Object.keys(existingCodes).join(', '),
    )

    var addedCount = 0
    var opNumberStr = order.getString('op_number') || '000571/2026'

    for (var m = 0; m < materials.length; m++) {
      var mat = materials[m]
      var matCode = normCode(mat.getString('code'))
      var matDesc = (mat.getString('description') || '').trim()
      var normMatDesc = normDesc(matDesc)

      var alreadyExists = false
      if (matCode && existingCodes[matCode]) {
        alreadyExists = true
      } else if (!matCode && normMatDesc) {
        // HASTE SUPERIOR / HASTE INFERIOR
        for (var exDesc in existingDescs) {
          if (exDesc.indexOf(normMatDesc) !== -1 || normMatDesc.indexOf(exDesc) !== -1) {
            alreadyExists = true
            break
          }
        }
      }

      if (alreadyExists) {
        console.log('[MIGRATION 0164] Item existente mantido: ' + (matCode || matDesc))
        continue
      }

      var matQty = Number(mat.getFloat('quantity')) || 0
      var qtyPerPiece = opQty > 0 ? matQty / opQty : matQty
      var formattedQty =
        qtyPerPiece % 1 === 0
          ? String(Math.round(qtyPerPiece))
          : String(Number(qtyPerPiece.toFixed(4)))

      var matSector = mat.getString('sector') || 'FABRICAÇÃO'
      var matMeasurements = mat.getString('measurements') || ''
      var matUnit = mat.getString('unit') || 'UN'
      var masterInfo = matCode ? compMap[matCode] : null

      var newItem = {
        id: 'backfill_' + orderId + '_' + mat.id,
        index: String(compList.length + 1),
        code: matCode,
        description: matDesc,
        quantity: formattedQty,
        measurements: matMeasurements,
        unit: masterInfo && masterInfo.unit ? masterInfo.unit : matUnit,
        etapa: matSector,
        category_id: masterInfo && masterInfo.category ? masterInfo.category : '',
        origem: 'OP ' + opNumberStr + ' (Backfill PDF)',
      }

      compList.push(newItem)
      if (matCode) existingCodes[matCode] = true
      if (normMatDesc) existingDescs[normMatDesc] = true
      addedCount++
      console.log(
        '[MIGRATION 0164] Item acrescentado: ' +
          (matCode || matDesc) +
          ' -> Qtd/pç: ' +
          formattedQty,
      )
    }

    console.log('[MIGRATION 0164] Total de itens acrescentados: ' + addedCount)
    pData.composition = compList

    var finalJsonString = JSON.stringify(pData)
    var nowIso = new Date().toISOString().replace('T', ' ').replace('Z', '')

    // 1. Gravação direta no SQLite
    try {
      app
        .db()
        .newQuery('UPDATE products SET data = {:data}, updated = {:updated} WHERE id = {:id}')
        .bind({
          data: finalJsonString,
          updated: nowIso,
          id: productId,
        })
        .execute()
      console.log('[MIGRATION 0164] SQLite UPDATE executado diretamente no banco.')
    } catch (eSql) {
      console.log('[MIGRATION 0164] Aviso ao executar SQL direto: ' + String(eSql))
    }

    // 2. Gravação via app.save no model
    try {
      var prodToSave = app.findRecordById('products', productId)
      prodToSave.set('data', finalJsonString)
      app.save(prodToSave)
      console.log('[MIGRATION 0164] app.save executado com sucesso no registro.')
    } catch (eSave) {
      console.log('[MIGRATION 0164] Aviso ao salvar via app.save: ' + String(eSave))
    }

    // 3. LEITURA LIVE OBRIGATÓRIA E PROVA DA GRAVAÇÃO
    var recheck = app.findRecordById('products', productId)
    var verifiedData = unwrapData(recheck.get('data'))
    var verifiedComp =
      verifiedData && Array.isArray(verifiedData.composition) ? verifiedData.composition : []

    console.log('[MIGRATION 0164] === VALIDAÇÃO LIVE BANCO PÓS-MIGRATION ===')
    console.log('[MIGRATION 0164] Itens na composição após gravação: ' + verifiedComp.length)
    for (var v = 0; v < verifiedComp.length; v++) {
      var it = verifiedComp[v]
      console.log(
        '[MIGRATION 0164]   [' +
          (v + 1) +
          '] Código: "' +
          it.code +
          '" | Descrição: "' +
          it.description +
          '" | Qtd: ' +
          it.quantity,
      )
    }

    // Validação estrita: se não atingiu 8 itens, falhar explicitamente
    if (verifiedComp.length < 8) {
      throw new Error(
        '[MIGRATION 0164] ERRO CRÍTICO: Validação LIVE falhou! Esperado 8 itens na composição do PENDENTE HE, mas foram gravados apenas ' +
          verifiedComp.length +
          ' itens.',
      )
    }

    console.log(
      '[MIGRATION 0164] SUCESSO ABSOLUTO: 8 itens confirmados na composição do PENDENTE HE!',
    )
  },
  (app) => {},
)
