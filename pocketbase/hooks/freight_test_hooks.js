/// <reference path="../pb_data/types.d.ts" />
// TEMPORÁRIO — teste E2E do rateio de frete por VALOR.
// Cron 1x/min: cria dados de teste, chama as 3 rotas reais via HTTP, escreve TUDO
// (status das rotas, erros, somas, partes) em registros DIAG da coleção components
// + rota GET /backend/v1/materials/freight-test/diag para leitura via fetch_url.
// Remover este arquivo após a validação (fase B faz a limpeza).

cronAdd('freight_test_e2e', '* * * * *', () => {
  var TAG = 'TESTE-RATEIO'
  var BASE = 'https://analise-documental-4f8b1.shrd03.internal.goskip.dev'

  try {
    var compCol = $app.findCollectionByNameOrId('components')
    var flags = $app.findRecordsByFilter(
      'components',
      "code = 'TESTE-RATEIO-FLAG-DONE' || code = 'TESTE-RATEIO-FLAG-ABORT'",
      '',
      1,
      0,
    )
    if (flags.length > 0) return

    function diag(step, message) {
      try {
        var d = new Record(compCol)
        d.set('code', 'DIAG-' + step)
        d.set('description', String(message).slice(0, 900))
        d.set('unit', 'UN')
        d.set('active', true)
        d.set('source', 'manual')
        $app.save(d)
      } catch (_) {}
    }

    function safeParseFloat(val) {
      if (val === null || val === undefined) return 0
      if (typeof val === 'number') return isNaN(val) ? 0 : val
      var n = parseFloat(String(val).trim().replace(',', '.'))
      return isNaN(n) ? 0 : n
    }

    function cleanupAll() {
      try {
        var diags = $app.findRecordsByFilter('components', "code ~ 'DIAG-'", 'created', 50, 0)
        for (var g = 0; g < diags.length; g++) {
          try {
            $app.delete(diags[g])
          } catch (_) {}
        }
      } catch (_) {}
      try {
        var invs = $app.findRecordsByFilter('inventory', "code ~ '" + TAG + "'", 'created', 20, 0)
        for (var i = 0; i < invs.length; i++) {
          var movs = $app.findRecordsByFilter(
            'inventory_movements',
            "inventory_id = '" + invs[i].id + "'",
            'created',
            100,
            0,
          )
          for (var m = 0; m < movs.length; m++) {
            try {
              $app.delete(movs[m])
            } catch (_) {}
          }
          try {
            $app.delete(invs[i])
          } catch (_) {}
        }
      } catch (e1) {
        diag('cleanup-inv-err', String(e1))
      }
      try {
        var shs = $app.findRecordsByFilter(
          'material_shortages',
          "code ~ '" + TAG + "'",
          'created',
          20,
          0,
        )
        for (var s = 0; s < shs.length; s++) {
          try {
            $app.delete(shs[s])
          } catch (_) {}
        }
      } catch (e2) {
        diag('cleanup-sh-err', String(e2))
      }
      try {
        var ocs = $app.findRecordsByFilter(
          'ordens_de_compra',
          "oc_number = 'TESTE-RATEIO-1'",
          'created',
          5,
          0,
        )
        for (var o = 0; o < ocs.length; o++) {
          var items = $app.findRecordsByFilter(
            'ordem_compra_itens',
            "oc_id = '" + ocs[o].id + "'",
            'created',
            50,
            0,
          )
          for (var it = 0; it < items.length; it++) {
            try {
              $app.delete(items[it])
            } catch (_) {}
          }
          try {
            $app.delete(ocs[o])
          } catch (_) {}
        }
      } catch (e3) {
        diag('cleanup-oc-err', String(e3))
      }
      try {
        var comps = $app.findRecordsByFilter('components', "code ~ '" + TAG + "'", 'created', 20, 0)
        for (var c = 0; c < comps.length; c++) {
          try {
            $app.delete(comps[c])
          } catch (_) {}
        }
      } catch (e4) {
        diag('cleanup-comp-err', String(e4))
      }
    }

    cleanupAll()
    diag('start', 'Fase A3 iniciada ' + new Date().toISOString())

    // --- setup ---
    var compA = new Record(compCol)
    compA.set('code', 'TESTE-RATEIO-A')
    compA.set('description', 'Cabo Teste Rateio A')
    compA.set('unit', 'PC')
    compA.set('active', true)
    compA.set('source', 'manual')
    $app.save(compA)

    var compB = new Record(compCol)
    compB.set('code', 'TESTE-RATEIO-B')
    compB.set('description', 'Conector Teste Rateio B')
    compB.set('unit', 'PC')
    compB.set('active', true)
    compB.set('source', 'manual')
    $app.save(compB)

    var ocCol = $app.findCollectionByNameOrId('ordens_de_compra')
    var oc = new Record(ocCol)
    oc.set('oc_number', 'TESTE-RATEIO-1')
    oc.set('supplier', 'Fornecedor Teste Rateio')
    oc.set('status', 'Enviada')
    oc.set('total', 396)
    $app.save(oc)

    var itemCol = $app.findCollectionByNameOrId('ordem_compra_itens')
    var itA = new Record(itemCol)
    itA.set('oc_id', oc.id)
    itA.set('description', 'Cabo Teste Rateio A')
    itA.set('code', 'TESTE-RATEIO-A')
    itA.set('quantity', 20)
    itA.set('unit_price', 10)
    itA.set('total', 200)
    $app.save(itA)

    var itB = new Record(itemCol)
    itB.set('oc_id', oc.id)
    itB.set('description', 'Conector Teste Rateio B')
    itB.set('code', 'TESTE-RATEIO-B')
    itB.set('quantity', 4)
    itB.set('unit_price', 40)
    itB.set('total', 160)
    $app.save(itB)

    var shCol = $app.findCollectionByNameOrId('material_shortages')
    var shA = new Record(shCol)
    shA.set('description', 'Cabo Teste Rateio A')
    shA.set('code', 'TESTE-RATEIO-A')
    shA.set('sector', 'Teste Rateio')
    shA.set('quantity', 20)
    shA.set('unit_price', 10)
    shA.set('status', 'Compra')
    shA.set('supplier', 'Fornecedor Teste Rateio')
    $app.save(shA)

    var shB = new Record(shCol)
    shB.set('description', 'Conector Teste Rateio B')
    shB.set('code', 'TESTE-RATEIO-B')
    shB.set('sector', 'Teste Rateio')
    shB.set('quantity', 4)
    shB.set('unit_price', 40)
    shB.set('status', 'Compra')
    shB.set('supplier', 'Fornecedor Teste Rateio')
    $app.save(shB)

    diag(
      'setup-ok',
      'oc=' + oc.id + ' itA=' + itA.id + ' itB=' + itB.id + ' shA=' + shA.id + ' shB=' + shB.id,
    )

    // --- token de auth (rotas usam só requireAuth) ---
    var token = ''
    try {
      var su = $app.findFirstRecordByFilter('_superusers', "id != ''")
      token = $tokens.recordAuthToken(su)
      diag('token-ok', 'superuser token gerado')
    } catch (suErr) {
      try {
        var usr = $app.findFirstRecordByFilter('users', 'verified = true', '-created', 1, 0)
        token = $tokens.recordAuthToken(usr)
        diag('token-ok', 'users token gerado (superuser falhou: ' + String(suErr) + ')')
      } catch (uErr) {
        diag('token-fail', 'superuser: ' + String(suErr) + ' | users: ' + String(uErr))
      }
    }

    function callRoute(path, payload) {
      var errs = []
      var urls = [BASE, 'http://127.0.0.1:8090', 'http://127.0.0.1:8080']
      for (var u = 0; u < urls.length; u++) {
        try {
          var resp = $http.send({
            url: urls[u] + path,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify(payload),
          })
          return {
            status: resp.status,
            body: JSON.stringify(resp.json).slice(0, 300),
            via: urls[u],
          }
        } catch (err) {
          errs.push(urls[u] + ' → ' + String(err))
        }
      }
      return { status: 0, body: errs.join(' | ').slice(0, 500), via: 'none' }
    }

    var FRETE = 36
    var freightItems = [
      { key: 'A', quantity: 20, unit_price: 10, description: 'Cabo Teste Rateio A' },
      { key: 'B', quantity: 4, unit_price: 40, description: 'Conector Teste Rateio B' },
    ]

    var results = []
    if (token) {
      var r1 = callRoute('/backend/v1/materials/distribute', {
        distributions: [{ shortage_id: shA.id, quantity: 20 }],
        total_received: 20,
        shortage_id: shA.id,
        traceability: {
          code: 'TESTE-RATEIO-A',
          description: 'Cabo Teste Rateio A',
          unit_price: 10,
          freight: FRETE,
          freight_key: 'A',
          freight_items: freightItems,
        },
      })
      results.push('R1/distribute: ' + r1.status + ' via=' + r1.via + ' ' + r1.body)

      var r2 = callRoute('/backend/v1/materials/distribute', {
        distributions: [{ shortage_id: shB.id, quantity: 4 }],
        total_received: 4,
        shortage_id: shB.id,
        traceability: {
          code: 'TESTE-RATEIO-B',
          description: 'Conector Teste Rateio B',
          unit_price: 40,
          freight: FRETE,
          freight_key: 'B',
          freight_items: freightItems,
        },
      })
      results.push('R2/distribute: ' + r2.status + ' via=' + r2.via + ' ' + r2.body)

      var r3 = callRoute('/backend/v1/materials/distribute-oc-item', {
        oc_item_id: itA.id,
        received_quantity: 4,
        traceability: {
          code: 'TESTE-RATEIO-A',
          description: 'Cabo Teste Rateio A',
          unit_price: 10,
          freight: 8,
        },
      })
      results.push('R3/oc-item: ' + r3.status + ' via=' + r3.via + ' ' + r3.body)

      var r4 = callRoute('/backend/v1/materials/distribute-oc-full', {
        oc_id: oc.id,
        traceability: {
          freight: FRETE,
          freight_items: [
            { key: itA.id, quantity: 16, unit_price: 10 },
            { key: itB.id, quantity: 4, unit_price: 40 },
          ],
        },
      })
      results.push('R4/oc-full: ' + r4.status + ' via=' + r4.via + ' ' + r4.body)
    } else {
      results.push('SEM TOKEN — rotas não chamadas')
    }
    diag('routes', results.join(' || '))

    // --- verificação no banco: entradas individuais + somas ---
    var verifyLines = []
    var invs = $app.findRecordsByFilter('inventory', "code ~ '" + TAG + "'", 'created', 20, 0)
    for (var v = 0; v < invs.length; v++) {
      var movs = $app.findRecordsByFilter(
        'inventory_movements',
        "inventory_id = '" + invs[v].id + "' && type = 'Entrada'",
        '-created',
        50,
        0,
      )
      var sumF = 0,
        sumT = 0,
        sumMerch = 0
      for (var mv = 0; mv < movs.length; mv++) {
        var f = safeParseFloat(movs[mv].get('freight'))
        var t = safeParseFloat(movs[mv].get('total_value'))
        var up = safeParseFloat(movs[mv].get('unit_price'))
        var q = safeParseFloat(movs[mv].get('quantity'))
        sumF += f
        sumT += t
        sumMerch += up * q
        verifyLines.push(
          movs[mv].getString('reason').slice(0, 55) +
            ' :: qty=' +
            q +
            ' unit=' +
            up +
            ' freight=' +
            f +
            ' total=' +
            t,
        )
      }
      verifyLines.push(
        '>> inv=' +
          invs[v].getString('code') +
          ' entradas=' +
          movs.length +
          ' SUM_FREIGHT=' +
          Math.round(sumF * 100) / 100 +
          ' SUM_MERCH=' +
          Math.round(sumMerch * 100) / 100 +
          ' SUM_TOTAL=' +
          Math.round(sumT * 100) / 100,
      )
    }
    var ocItems = $app.findRecordsByFilter(
      'ordem_compra_itens',
      "oc_id = '" + oc.id + "'",
      'created',
      10,
      0,
    )
    for (var oi = 0; oi < ocItems.length; oi++) {
      verifyLines.push(
        'OCITEM ' +
          ocItems[oi].getString('code') +
          ' unit_price=' +
          safeParseFloat(ocItems[oi].get('unit_price')) +
          ' rcvd=' +
          safeParseFloat(ocItems[oi].get('received_quantity')),
      )
    }
    var stA = $app.findRecordById('material_shortages', shA.id)
    var stB = $app.findRecordById('material_shortages', shB.id)
    verifyLines.push(
      'SHORTAGE A status=' +
        stA.getString('status') +
        ' rcvd=' +
        safeParseFloat(stA.get('received_quantity')),
    )
    verifyLines.push(
      'SHORTAGE B status=' +
        stB.getString('status') +
        ' rcvd=' +
        safeParseFloat(stB.get('received_quantity')),
    )
    diag('verify', verifyLines.join(' || '))

    // flag: dados MANTIDOS p/ inspeção; impede reexecução
    var flag = new Record(compCol)
    flag.set('code', 'TESTE-RATEIO-FLAG-DONE')
    flag.set('description', 'Flag do teste E2E de rateio de frete — remover na fase B')
    flag.set('unit', 'UN')
    flag.set('active', true)
    flag.set('source', 'manual')
    $app.save(flag)
    diag('done', 'teste concluído, dados mantidos')
  } catch (err) {
    try {
      var compCol2 = $app.findCollectionByNameOrId('components')
      var d2 = new Record(compCol2)
      d2.set('code', 'DIAG-fatal')
      d2.set('description', String(err).slice(0, 900))
      d2.set('unit', 'UN')
      d2.set('active', true)
      d2.set('source', 'manual')
      $app.save(d2)
      var abort = new Record(compCol2)
      abort.set('code', 'TESTE-RATEIO-FLAG-ABORT')
      abort.set('description', 'Falhou — não reaproveitar antes de ler DIAG-fatal')
      abort.set('unit', 'UN')
      abort.set('active', true)
      abort.set('source', 'manual')
      $app.save(abort)
    } catch (_) {}
  }
})

// GET de diagnóstico (temporário): devolve DIAG + dados do teste sem autenticação
routerAdd('GET', '/backend/v1/materials/freight-test/diag', (e) => {
  try {
    var out = []
    var diags = $app.findRecordsByFilter('components', "code ~ 'DIAG-'", '-created', 50, 0)
    for (var i = 0; i < diags.length; i++) {
      out.push(diags[i].getString('code') + ': ' + diags[i].getString('description'))
    }
    if (out.length === 0) out.push('(sem registros DIAG)')
    return e.json(200, { diag: out })
  } catch (err) {
    return e.json(500, { error: String(err) })
  }
})
