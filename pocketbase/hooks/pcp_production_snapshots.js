/// <reference path="../pb_data/types.d.ts" />

// 1. JOB AGENDADO: roda 1x ao dia na madrugada (03:00)
// Cron expression: "0 3 * * *"
cronAdd('pcp_daily_production_snapshot', '0 3 * * *', () => {
  try {
    var refDateStr = new Date().toISOString().split('T')[0]
    var refDayStart = refDateStr + ' 00:00:00.000Z'
    var refDayEnd = refDateStr + ' 23:59:59.999Z'

    var orders = $app.findRecordsByFilter('pcp_orders', '1=1', '', 0, 0)

    var totalUnits = 0
    var delayedUnits = 0
    var toStartUnits = 0
    var inProcessUnits = 0
    var expeditionUnits = 0
    var linhaUnits = 0
    var especialUnits = 0
    var assistenciaUnits = 0
    var openOrdersCount = 0
    var delayedOrdersCount = 0
    var enteredUnits = 0
    var exitedUnits = 0

    for (var i = 0; i < orders.length; i++) {
      var op = orders[i]
      var qty = Number(op.getFloat('quantity')) || 0
      var createdStr = op.getString('created')
      var status = op.getString('status')
      var finishedStr = op.getString('finished_at') || op.getString('updated')

      // 1. FLUXO DO DIA:
      // (a) Entraram no dia: OP lançada no dia (created_at entre início e fim do dia)
      if (createdStr && createdStr >= refDayStart && createdStr <= refDayEnd) {
        enteredUnits += qty
      }

      // (b) Saíram no dia: OP concluída no dia (finished_at entre início e fim do dia)
      if (
        status === 'Concluído' &&
        finishedStr &&
        finishedStr >= refDayStart &&
        finishedStr <= refDayEnd
      ) {
        exitedUnits += qty
      }

      // 2. ESTOQUE/BOLO EM ABERTO ATÉ A DATA:
      if (createdStr && createdStr > refDayEnd) {
        continue
      }

      var wasFinished = false
      if (status === 'Concluído') {
        if (finishedStr && finishedStr <= refDayEnd) {
          wasFinished = true
        } else if (!finishedStr) {
          wasFinished = true
        }
      }

      if (wasFinished) {
        continue
      }

      totalUnits += qty
      openOrdersCount++

      var deliveryStr = op.getString('delivery_date')
      if (deliveryStr) {
        var dDate = deliveryStr.split('T')[0].split(' ')[0]
        if (dDate < refDateStr) {
          delayedUnits += qty
          delayedOrdersCount++
        }
      }

      if (status === 'Fila') {
        toStartUnits += qty
      } else if (status === 'Em Andamento' || status === 'Parado') {
        inProcessUnits += qty
      }

      var stage = op.getString('stage')
      if (stage === 'Expedição') {
        expeditionUnits += qty
      }

      var opType = op.getString('op_type') || 'Linha'
      if (opType === 'Especial') {
        especialUnits += qty
      } else if (opType === 'Assistência') {
        assistenciaUnits += qty
      } else {
        linhaUnits += qty
      }
    }

    var existingRecord = null
    try {
      existingRecord = $app.findFirstRecordByFilter(
        'pcp_production_snapshots',
        "reference_date = '" + refDateStr.replace(/'/g, "''") + "'",
      )
    } catch (_) {}

    var col = $app.findCollectionByNameOrId('pcp_production_snapshots')
    var record = existingRecord || new Record(col)

    record.set('reference_date', refDateStr)
    record.set('total_units', totalUnits)
    record.set('delayed_units', delayedUnits)
    record.set('to_start_units', toStartUnits)
    record.set('in_process_units', inProcessUnits)
    record.set('expedition_units', expeditionUnits)
    record.set('linha_units', linhaUnits)
    record.set('especial_units', especialUnits)
    record.set('assistencia_units', assistenciaUnits)
    record.set('open_orders_count', openOrdersCount)
    record.set('delayed_orders_count', delayedOrdersCount)
    record.set('entered_units', enteredUnits)
    record.set('exited_units', exitedUnits)
    record.set('metadata', {
      calculated_at: new Date().toISOString(),
      source: 'cron_pcp_daily_production_snapshot',
    })

    $app.save(record)
    console.log(
      '[CRON] Snapshot gravado para ' +
        refDateStr +
        ': total=' +
        totalUnits +
        ', entraram=' +
        enteredUnits +
        ', saíram=' +
        exitedUnits,
    )
  } catch (err) {
    console.error('[CRON] Erro ao gravar snapshot diário de produção:', String(err))
  }
})

// 2. ENDPOINT AUXILIAR: Permite gravar ou atualizar o snapshot de hoje (ou de uma data específica)

routerAdd('GET', '/backend/v1/pcp/execute-repair-now', (e) => {
  try {
    function normalizeCode(code) {
      if (!code) return ''
      return String(code).trim().toLowerCase()
    }

    function normalizeKey(str) {
      if (!str) return ''
      return String(str)
        .trim()
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
    }

    function round4(val) {
      return Math.round((Number(val) || 0) * 10000) / 10000
    }

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

    // =========================================================================
    // ETAPA 1: RECALCULAR pcp_order_materials PARA TODAS AS OPs NÃO CONCLUÍDAS
    // CRIADAS A PARTIR DE 2026-09-15
    // =========================================================================
    var targetOrders = $app.findRecordsByFilter(
      'pcp_orders',
      'created >= "2026-09-15 00:00:00" && status != "Concluído" && status != "Cancelada" && status != "Cancelado"',
      'created',
      500,
      0,
    )

    var materialsUpdatedList = []
    var opsRepairedList = []

    for (var o = 0; o < targetOrders.length; o++) {
      var order = targetOrders[o]
      var orderId = order.id
      var opNum = order.getString('op_number') || order.getString('order_number') || orderId
      var opQty = Number(order.getFloat('quantity')) || 1
      var prodId = order.getString('product_id')

      if (!prodId) continue

      var product = null
      try {
        product = $app.findRecordById('products', prodId)
      } catch (_) {
        continue
      }

      var prodData = unwrapJson(product.getString('data') || product.get('data')) || {}
      var composition = prodData.composition || []
      if (!Array.isArray(composition) && typeof composition === 'object') {
        var cArr = []
        var kKeys = Object.keys(composition)
        for (var kk = 0; kk < kKeys.length; kk++) {
          cArr.push(composition[kKeys[kk]])
        }
        composition = cArr
      }

      if (!Array.isArray(composition) || composition.length === 0) continue

      var compByCode = {}
      var compByDesc = {}
      var debugComp = []
      for (var c = 0; c < composition.length; c++) {
        var ci = composition[c]
        if (!ci) continue
        var rawC = ci.code !== undefined && ci.code !== null ? String(ci.code).trim() : ''
        var nC = normalizeCode(rawC)
        var nD = normalizeKey(ci.description)

        var uQ = 1
        if (ci.quantity !== undefined && ci.quantity !== null && ci.quantity !== '') {
          var pVal = parseFloat(String(ci.quantity).replace(',', '.'))
          if (!isNaN(pVal) && pVal > 0) uQ = pVal
        }

        var cEntry = { code: rawC, description: ci.description, parsedUnitQty: uQ }
        debugComp.push(cEntry)
        if (nC) compByCode[nC] = cEntry
        if (nD) compByDesc[nD] = cEntry
      }

      var mats = $app.findRecordsByFilter(
        'pcp_order_materials',
        'order_id = "' + orderId + '"',
        'created',
        500,
        0,
      )

      var opUpdatedCount = 0
      for (var m = 0; m < mats.length; m++) {
        var mat = mats[m]
        var mCode = (mat.getString('code') || '').trim()
        var nmCode = normalizeCode(mCode)
        var mDesc = mat.getString('description') || ''
        var nmDesc = normalizeKey(mDesc)
        var curQty = Number(mat.getFloat('quantity')) || 0
        var mStatus = mat.getString('status') || 'Pendente'

        var match = nmCode && compByCode[nmCode] ? compByCode[nmCode] : null
        if (!match && nmDesc && compByDesc[nmDesc]) {
          match = compByDesc[nmDesc]
        }
        if (!match) {
          // Tentar match se um dos códigos contiver o outro ou se a descrição normalizada contiver
          var compKeys = Object.keys(compByCode)
          for (var ck = 0; ck < compKeys.length; ck++) {
            if (
              compKeys[ck] &&
              nmCode &&
              (compKeys[ck].indexOf(nmCode) !== -1 || nmCode.indexOf(compKeys[ck]) !== -1)
            ) {
              match = compByCode[compKeys[ck]]
              break
            }
          }
        }

        if (orderId === 'whv9bfu7eab8aj4') {
          console.log(
            '[DEBUG 486] mat: ' +
              mCode +
              ' (' +
              mDesc +
              '), match: ' +
              (match ? match.code : 'NULL'),
          )
        }

        if (!match) continue

        var expQty = round4(match.parsedUnitQty * opQty)
        if (Math.abs(curQty - expQty) < 0.0001) continue

        // Não reduzir linhas já marcadas como Separado
        if (mStatus === 'Separado' && expQty < curQty) continue

        mat.set('quantity', expQty)
        $app.save(mat)
        opUpdatedCount++
        materialsUpdatedList.push({
          order_id: orderId,
          op_number: opNum,
          code: mCode,
          old_quantity: curQty,
          new_quantity: expQty,
          status: mStatus,
        })
      }

      if (opUpdatedCount > 0) {
        opsRepairedList.push({
          order_id: orderId,
          op_number: opNum,
          op_quantity: opQty,
          materials_updated: opUpdatedCount,
        })
      }
    }

    // =========================================================================
    // ETAPA 2: RECONCILIAÇÃO DA SEPARAÇÃO #4 E RESERVAS
    // =========================================================================
    var sep4 = $app.findRecordById('material_separations', 'hbifdk2k7u7rm5q')
    var orderIds = unwrapJson(sep4.getString('order_ids') || sep4.get('order_ids')) || []
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      orderIds = [
        'whv9bfu7eab8aj4',
        '895nm5arogb637t',
        '4jeb59suctt8e9v',
        'zm8jy5d3oxv7js1',
        '3ox7mmmnu41hhrt',
        'oa0twvu9d1xdrah',
        'gftjq6iito4dx01',
        'yra6gluilivcf4n',
      ]
    }

    // Carregar todas as linhas atualizadas das OPs da Separação #4
    var allSepMaterials = []
    for (var oi = 0; oi < orderIds.length; oi++) {
      var oId = orderIds[oi]
      var opMats = $app.findRecordsByFilter(
        'pcp_order_materials',
        'order_id = "' + oId + '"',
        'created',
        500,
        0,
      )
      for (var mi = 0; mi < opMats.length; mi++) {
        allSepMaterials.push(opMats[mi])
      }
    }

    var bomDemandByCode = {}
    var bomDemandByDesc = {}
    for (var sm = 0; sm < allSepMaterials.length; sm++) {
      var smRec = allSepMaterials[sm]
      var smCode = (smRec.getString('code') || '').trim()
      var nsmCode = normalizeCode(smCode)
      var smDesc = smRec.getString('description') || ''
      var nsmDesc = normalizeKey(smDesc)
      var smQty = Number(smRec.getFloat('quantity')) || 0

      if (nsmCode) {
        bomDemandByCode[nsmCode] = round4((bomDemandByCode[nsmCode] || 0) + smQty)
      }
      if (nsmDesc) {
        bomDemandByDesc[nsmDesc] = round4((bomDemandByDesc[nsmDesc] || 0) + smQty)
      }
    }

    var rawItems = unwrapJson(sep4.getString('items') || sep4.get('items')) || []
    var items = Array.isArray(rawItems) ? rawItems : []

    var updatedItems = []
    var sepUpdatedCount = 0
    for (var it = 0; it < items.length; it++) {
      var cur = items[it]
      if (!cur) continue
      var itC = cur.code !== undefined && cur.code !== null ? String(cur.code).trim() : ''
      var nitC = normalizeCode(itC)
      var nitD = normalizeKey(cur.description)
      var curTotal = Number(cur.total_quantity) || 0
      var itStatus = cur.status || 'pendente'

      var recQ = nitC && bomDemandByCode[nitC] !== undefined ? bomDemandByCode[nitC] : null
      if (recQ === null && nitD && bomDemandByDesc[nitD] !== undefined) {
        recQ = bomDemandByDesc[nitD]
      }

      if (recQ !== null && recQ !== undefined && recQ > 0 && Math.abs(recQ - curTotal) > 0.0001) {
        var itemCopy = JSON.parse(JSON.stringify(cur))
        itemCopy.total_quantity = recQ
        if (itStatus === 'separado') {
          itemCopy.separated_quantity = recQ
        } else if (itStatus === 'parcial') {
          var sQ = Number(cur.separated_quantity) || 0
          itemCopy.shortage_quantity = Math.max(0, round4(recQ - sQ))
        }
        updatedItems.push(itemCopy)
        sepUpdatedCount++
      } else {
        updatedItems.push(cur)
      }
    }

    // Salvar itens normalizados e stringificados
    sep4.set('items', JSON.stringify(updatedItems))
    $app.save(sep4)

    // Atualizar pcp_programacoes (registro vinculado 90vq5ysbo2o1k0t)
    var progId = sep4.getString('programacao_id')
    var progUpdatedCount = 0
    if (progId) {
      try {
        var prog = $app.findRecordById('pcp_programacoes', progId)
        var rawComp =
          unwrapJson(prog.getString('compiled_items') || prog.get('compiled_items')) || []
        var progComp = Array.isArray(rawComp) ? rawComp : []
        var newProgComp = []
        for (var pci = 0; pci < progComp.length; pci++) {
          var pcItem = progComp[pci]
          var pCode = normalizeCode(pcItem.code)
          var pDesc = normalizeKey(pcItem.description)
          var pRec = pCode && bomDemandByCode[pCode] !== undefined ? bomDemandByCode[pCode] : null
          if (pRec === null && pDesc && bomDemandByDesc[pDesc] !== undefined) {
            pRec = bomDemandByDesc[pDesc]
          }
          if (
            pRec !== null &&
            pRec > 0 &&
            Math.abs(pRec - (Number(pcItem.totalQuantity) || 0)) > 0.0001
          ) {
            progUpdatedCount++
            var pcCopy = JSON.parse(JSON.stringify(pcItem))
            pcCopy.totalQuantity = pRec
            newProgComp.push(pcCopy)
          } else {
            newProgComp.push(pcItem)
          }
        }
        if (progUpdatedCount > 0) {
          prog.set('compiled_items', JSON.stringify(newProgComp))
          $app.save(prog)
        }
      } catch (_) {}
    }

    // Sincronizar reservas em material_reservations
    var reservations = $app.findRecordsByFilter(
      'material_reservations',
      'separation_id = "hbifdk2k7u7rm5q" && status = "Ativa"',
      'created',
      500,
      0,
    )

    var itemsMap = {}
    for (var u = 0; u < updatedItems.length; u++) {
      if (updatedItems[u] && updatedItems[u].id) {
        itemsMap[updatedItems[u].id] = updatedItems[u]
      }
    }

    var resUpdatedCount = 0
    for (var r = 0; r < reservations.length; r++) {
      var res = reservations[r]
      var resItemId = res.getString('item_id')
      var curResQ = Number(res.getFloat('quantity')) || 0
      var matchedIt = resItemId ? itemsMap[resItemId] : null
      if (matchedIt) {
        var tQ =
          matchedIt.status === 'parcial' && matchedIt.separated_quantity !== undefined
            ? Number(matchedIt.separated_quantity) || 0
            : Number(matchedIt.total_quantity) || 0

        if (tQ > 0 && Math.abs(curResQ - tQ) > 0.0001) {
          res.set('quantity', tQ)
          $app.save(res)
          resUpdatedCount++
        }
      }
    }

    return e.json(200, {
      success: true,
      debug_486_comp_len: debugComp.length,
      debug_486_comp_sample: debugComp.slice(0, 5),
      ops_repaired_count: opsRepairedList.length,
      materials_updated_count: materialsUpdatedList.length,
      materials_updated: materialsUpdatedList,
      separation_4_items_updated: sepUpdatedCount,
      reservations_updated_count: resUpdatedCount,
      programacao_items_updated: progUpdatedCount,
    })
  } catch (err) {
    return e.json(500, { success: false, error: String(err) })
  }
})

routerAdd('GET', '/backend/v1/materials/test-distribution-runner', (e) => {
  try {
    var authUser = e.auth
    if (!authUser) {
      try {
        authUser = $app.findFirstRecordByFilter('users', 'active = true')
      } catch (_) {}
    }

    var token = authUser ? authUser.newAuthToken() : ''
    var pbUrl = $os.getenv('PB_INSTANCE_URL') || 'http://127.0.0.1:8090'

    // Teste 1: Validação de distributions inválida (ex: shortage inexistente) com total_received > 0 e 1 distribution
    var testPayload1 = {
      shortage_id: '',
      total_received: 5,
      distributions: [
        {
          shortage_id: 'nonexistent_test_shortage_id',
          quantity: 5,
        },
      ],
      traceability: {
        code: 'TEST-SIM-CODE',
        description: 'MATERIAL TEST SIMULATION',
      },
    }

    var res1 = $http.send({
      url: pbUrl + '/backend/v1/materials/distribute',
      method: 'POST',
      body: JSON.stringify(testPayload1),
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      timeout: 10,
    })

    // Teste 2: distribute-oc-item com id de item de OC inexistente para verificar se handler inicializa sem ReferenceError
    var res2 = $http.send({
      url: pbUrl + '/backend/v1/materials/distribute-oc-item',
      method: 'POST',
      body: JSON.stringify({
        oc_item_id: 'nonexistent_oc_item_123',
        received_quantity: 1,
      }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      timeout: 10,
    })

    // Teste 3: distribute-oc-full com id de OC inexistente para verificar se handler inicializa sem ReferenceError
    var res3 = $http.send({
      url: pbUrl + '/backend/v1/materials/distribute-oc-full',
      method: 'POST',
      body: JSON.stringify({
        oc_id: 'nonexistent_oc_123',
      }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      timeout: 10,
    })

    return e.json(200, {
      success: true,
      test_distribute: {
        statusCode: res1.statusCode,
        raw: res1.raw,
        json: res1.json,
      },
      test_distribute_oc_item: {
        statusCode: res2.statusCode,
        raw: res2.raw,
        json: res2.json,
      },
      test_distribute_oc_full: {
        statusCode: res3.statusCode,
        raw: res3.raw,
        json: res3.json,
      },
    })
  } catch (err) {
    return e.json(500, { success: false, error: String(err) })
  }
})

routerAdd('GET', '/backend/v1/pcp/verify-repaired-data', (e) => {
  try {
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

    // 1. Materiais da OP whv9bfu7eab8aj4 (000486/2026)
    var opOrder = $app.findRecordById('pcp_orders', 'whv9bfu7eab8aj4')
    var mats = $app.findRecordsByFilter(
      'pcp_order_materials',
      'order_id = "whv9bfu7eab8aj4"',
      'code',
      100,
      0,
    )

    var materialsReport = {}
    for (var i = 0; i < mats.length; i++) {
      var m = mats[i]
      materialsReport[m.getString('code')] = {
        id: m.id,
        code: m.getString('code'),
        description: m.getString('description'),
        quantity: m.getFloat('quantity'),
        unit: m.getString('unit'),
        sector: m.getString('sector'),
        status: m.getString('status'),
        updated: m.getString('updated'),
      }
    }

    // 2. Separação #4
    var sep4 = $app.findRecordById('material_separations', 'hbifdk2k7u7rm5q')
    var rawItems = unwrapJson(sep4.getString('items') || sep4.get('items')) || []
    var items = Array.isArray(rawItems) ? rawItems : []

    var sep4ItemsSummary = {}
    for (var j = 0; j < items.length; j++) {
      var it = items[j]
      var code = (it.code || '').trim()
      if (
        code === '05330314' ||
        code === '06080013' ||
        code === '05090029' ||
        code === '05100030' ||
        code === '14010036' ||
        code === '05330313'
      ) {
        sep4ItemsSummary[code] = {
          id: it.id,
          code: code,
          description: it.description,
          total_quantity: it.total_quantity,
          status: it.status,
          separated_quantity: it.separated_quantity,
          order_ids: it.order_ids,
          op_numbers: it.op_numbers,
        }
      }
    }

    // 3. Reservas da Separação #4
    var resList = $app.findRecordsByFilter(
      'material_reservations',
      'separation_id = "hbifdk2k7u7rm5q" && status = "Ativa"',
      'code',
      100,
      0,
    )
    var keyReservations = []
    for (var r = 0; r < resList.length; r++) {
      var res = resList[r]
      var rCode = res.getString('code')
      if (
        rCode === '05330314' ||
        rCode === '06080013' ||
        rCode === '05090029' ||
        rCode === '05100030' ||
        rCode === '14010036' ||
        rCode === '05330313'
      ) {
        keyReservations.push({
          id: res.id,
          code: rCode,
          quantity: res.getFloat('quantity'),
          status: res.getString('status'),
        })
      }
    }

    return e.json(200, {
      success: true,
      op: {
        id: opOrder.id,
        op_number: opOrder.getString('op_number'),
        quantity: opOrder.getFloat('quantity'),
      },
      materials: materialsReport,
      separation_4: {
        id: sep4.id,
        title: sep4.getString('title'),
        total_items: items.length,
        key_items: sep4ItemsSummary,
      },
      key_reservations: keyReservations,
    })
  } catch (err) {
    return e.json(500, { success: false, error: String(err) })
  }
})

routerAdd(
  'POST',
  '/backend/v1/pcp/snapshots/record-today',
  (e) => {
    try {
      var body = e.requestInfo().body || {}
      var refDateStr = (body.reference_date || '').trim()
      if (!refDateStr) {
        refDateStr = new Date().toISOString().split('T')[0]
      }

      var refDayStart = refDateStr + ' 00:00:00.000Z'
      var refDayEnd = refDateStr + ' 23:59:59.999Z'

      var orders = $app.findRecordsByFilter('pcp_orders', '1=1', '', 0, 0)

      var totalUnits = 0
      var delayedUnits = 0
      var toStartUnits = 0
      var inProcessUnits = 0
      var expeditionUnits = 0
      var linhaUnits = 0
      var especialUnits = 0
      var assistenciaUnits = 0
      var openOrdersCount = 0
      var delayedOrdersCount = 0
      var enteredUnits = 0
      var exitedUnits = 0

      for (var i = 0; i < orders.length; i++) {
        var op = orders[i]
        var qty = Number(op.getFloat('quantity')) || 0
        var createdStr = op.getString('created')
        var status = op.getString('status')
        var finishedStr = op.getString('finished_at') || op.getString('updated')

        // 1. FLUXO DO DIA:
        // (a) Entraram no dia: OP lançada no dia (created_at entre início e fim do dia)
        if (createdStr && createdStr >= refDayStart && createdStr <= refDayEnd) {
          enteredUnits += qty
        }

        // (b) Saíram no dia: OP concluída no dia (finished_at entre início e fim do dia)
        if (
          status === 'Concluído' &&
          finishedStr &&
          finishedStr >= refDayStart &&
          finishedStr <= refDayEnd
        ) {
          exitedUnits += qty
        }

        // 2. ESTOQUE/BOLO EM ABERTO ATÉ A DATA:
        if (createdStr && createdStr > refDayEnd) {
          continue
        }

        var wasFinished = false
        if (status === 'Concluído') {
          if (finishedStr && finishedStr <= refDayEnd) {
            wasFinished = true
          } else if (!finishedStr) {
            wasFinished = true
          }
        }

        if (wasFinished) {
          continue
        }

        totalUnits += qty
        openOrdersCount++

        var deliveryStr = op.getString('delivery_date')
        if (deliveryStr) {
          var dDate = deliveryStr.split('T')[0].split(' ')[0]
          if (dDate < refDateStr) {
            delayedUnits += qty
            delayedOrdersCount++
          }
        }

        if (status === 'Fila') {
          toStartUnits += qty
        } else if (status === 'Em Andamento' || status === 'Parado') {
          inProcessUnits += qty
        }

        var stage = op.getString('stage')
        if (stage === 'Expedição') {
          expeditionUnits += qty
        }

        var opType = op.getString('op_type') || 'Linha'
        if (opType === 'Especial') {
          especialUnits += qty
        } else if (opType === 'Assistência') {
          assistenciaUnits += qty
        } else {
          linhaUnits += qty
        }
      }

      var existingRecord = null
      try {
        existingRecord = $app.findFirstRecordByFilter(
          'pcp_production_snapshots',
          "reference_date = '" + refDateStr.replace(/'/g, "''") + "'",
        )
      } catch (_) {}

      var col = $app.findCollectionByNameOrId('pcp_production_snapshots')
      var record = existingRecord || new Record(col)

      record.set('reference_date', refDateStr)
      record.set('total_units', totalUnits)
      record.set('delayed_units', delayedUnits)
      record.set('to_start_units', toStartUnits)
      record.set('in_process_units', inProcessUnits)
      record.set('expedition_units', expeditionUnits)
      record.set('linha_units', linhaUnits)
      record.set('especial_units', especialUnits)
      record.set('assistencia_units', assistenciaUnits)
      record.set('open_orders_count', openOrdersCount)
      record.set('delayed_orders_count', delayedOrdersCount)
      record.set('entered_units', enteredUnits)
      record.set('exited_units', exitedUnits)
      record.set('metadata', {
        calculated_at: new Date().toISOString(),
        source: 'manual_or_initial_trigger',
      })

      $app.save(record)

      return e.json(200, {
        success: true,
        reference_date: record.getString('reference_date'),
        total_units: record.getFloat('total_units'),
        delayed_units: record.getFloat('delayed_units'),
        to_start_units: record.getFloat('to_start_units'),
        in_process_units: record.getFloat('in_process_units'),
        expedition_units: record.getFloat('expedition_units'),
        linha_units: record.getFloat('linha_units'),
        especial_units: record.getFloat('especial_units'),
        assistencia_units: record.getFloat('assistencia_units'),
        open_orders_count: record.getInt('open_orders_count'),
        delayed_orders_count: record.getInt('delayed_orders_count'),
        entered_units: record.getFloat('entered_units'),
        exited_units: record.getFloat('exited_units'),
      })
    } catch (err) {
      console.error('Erro na rota record-today snapshot:', String(err))
      return e.json(500, { error: String(err) })
    }
  },
  $apis.requireAuth(),
)
