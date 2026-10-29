/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0163: Backfill em massa de composições a partir de OPs importadas.
 * Caso já validado: produto PENDENTE HE (id: rgmu0xiinpcsmiz) a partir da OP 000571/2026 (id: 384h4pie4d0cfk3).
 *
 * Regras aplicadas:
 * 1. LEITURA LIVE no banco (padrão anti byte-array do Goja).
 * 2. Merge ADITIVO em data.composition: nunca remove nem altera itens existentes.
 * 3. Idempotente: reaplicar não duplica itens.
 * 4. Normalização de códigos com trim ('\t14010038 ' vira '14010038').
 * 5. Itens sem código entram comparando por description normalizada.
 * 6. Quantidade por peça = quantity do material ÷ quantity da OP (OP qty = 2, materiais qty = 2 -> 1 por peça).
 * 7. Preserva etapa/sector, measurements e enriquece com dados de 'components' quando o código existir.
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

    console.log('[MIGRATION 0163] Iniciando backfill aditivo LIVE do PENDENTE HE (rgmu0xiinpcsmiz)...')

    var productId = 'rgmu0xiinpcsmiz'
    var orderId = '384h4pie4d0cfk3'

    var product = null
    try {
      product = app.findRecordById('products', productId)
    } catch (err) {
      console.warn('[MIGRATION 0163] Produto ' + productId + ' não encontrado: ' + String(err))
      return
    }

    var order = null
    try {
      order = app.findRecordById('pcp_orders', orderId)
    } catch (err) {
      console.warn('[MIGRATION 0163] Ordem ' + orderId + ' não encontrada: ' + String(err))
      return
    }

    var opQty = Number(order.getFloat('quantity')) || 1
    if (opQty <= 0) opQty = 1

    var rawData = product.get('data')
    var pData = unwrapData(rawData) || {}
    var compList = Array.isArray(pData.composition) ? pData.composition : []

    console.log('[MIGRATION 0163] Itens atuais na composição: ' + compList.length)

    // Buscar materiais da OP
    var materials = []
    try {
      materials = app.findRecordsByFilter('pcp_order_materials', "order_id = '" + orderId + "'", 'created', 100, 0)
    } catch (err) {
      console.warn('[MIGRATION 0163] Falha ao buscar materiais da OP ' + orderId + ': ' + String(err))
      return
    }

    console.log('[MIGRATION 0163] Materiais encontrados na OP: ' + materials.length)

    // Mapa de componentes cadastrados no catálogo para enriquecimento
    var compMap = {}
    try {
      var allComps = app.findRecordsByFilter('components', "active = true || active = false", 'code', 1000, 0)
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
      console.warn('[MIGRATION 0163] Aviso ao carregar catálogo de componentes: ' + String(eComps))
    }

    // Indexar composição existente por código normalizado (trim) e por descrição normalizada (trim + uppercase)
    function normCode(str) {
      return (str || '').toString().trim()
    }
    function normDesc(str) {
      return (str || '').toString().trim().toUpperCase()
    }

    var existingCodes = {}
    var existingDescs = {}

    for (var i = 0; i < compList.length; i++) {
      var itm = compList[i]
      var cCode = normCode(itm.code)
      var cDesc = normDesc(itm.description)
      if (cCode) {
        existingCodes[cCode] = true
      }
      if (cDesc) {
        existingDescs[cDesc] = true
      }
    }

    var addedCount = 0
    var opNumberStr = order.getString('op_number') || '000571/2026'

    for (var m = 0; m < materials.length; m++) {
      var mat = materials[m]
      var rawMatCode = mat.getString('code') || ''
      var matCode = normCode(rawMatCode)
      var matDesc = mat.getString('description') || ''
      var normMatDesc = normDesc(matDesc)

      // Verificar se já existe na composição
      var alreadyExists = false
      if (matCode) {
        if (existingCodes[matCode]) {
          alreadyExists = true
        }
      } else if (normMatDesc) {
        if (existingDescs[normMatDesc]) {
          alreadyExists = true
        }
      }

      if (alreadyExists) {
        console.log('[MIGRATION 0163] Item existente mantido inalterado: ' + (matCode || matDesc))
        continue
      }

      var matQty = Number(mat.getFloat('quantity')) || 0
      var qtyPerPiece = opQty > 0 ? (matQty / opQty) : matQty
      // Se for número inteiro, formatar como inteiro limpo
      var formattedQty = (qtyPerPiece % 1 === 0) ? String(Math.round(qtyPerPiece)) : String(Number(qtyPerPiece.toFixed(4)))

      var matSector = mat.getString('sector') || ''
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
        etapa: matSector || 'FABRICAÇÃO',
        category_id: masterInfo && masterInfo.category ? masterInfo.category : '',
        origem: 'OP ' + opNumberStr + ' (Backfill PDF)',
      }

      compList.push(newItem)
      if (matCode) existingCodes[matCode] = true
      if (normMatDesc) existingDescs[normMatDesc] = true
      addedCount++
      console.log('[MIGRATION 0163] Item adicionado com sucesso: ' + (matCode || matDesc) + ' (Qtd/pç: ' + formattedQty + ')')
    }

    if (addedCount > 0) {
      pData.composition = compList
      product.set('data', JSON.stringify(pData))
      app.save(product)
      console.log('[MIGRATION 0163] Produto ' + productId + ' salvo com sucesso! ' + addedCount + ' itens adicionados.')
    } else {
      console.log('[MIGRATION 0163] Nenhum item novo a acrescentar (todos já existiam).')
    }

    // Validação LIVE
    var recheck = app.findRecordById('products', productId)
    var verifiedData = unwrapData(recheck.get('data'))
    var verifiedComp = (verifiedData && Array.isArray(verifiedData.composition)) ? verifiedData.composition : []
    console.log('[MIGRATION 0163] SUCESSO: Leitura LIVE do banco confirmada. Total de itens na composição do PENDENTE HE = ' + verifiedComp.length)
  },
  (app) => {
    // Reversão não destrutiva
  }
)
