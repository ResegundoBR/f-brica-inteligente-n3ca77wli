routerAdd(
  'POST',
  '/backend/v1/materials/distribute',
  (e) => {
    var body = e.requestInfo().body || {}
    var distributions = body.distributions || []
    var traceability = body.traceability || {}
    var userId = e.auth ? e.auth.id : ''

    var totalReceived = Number(body.total_received) || 0

    var code = (traceability.code || '').trim()
    var description = (traceability.description || '').trim()

    if (!totalReceived || totalReceived <= 0) {
      if (!distributions || distributions.length === 0) {
        return e.badRequestError('Nenhuma quantidade recebida informada')
      }
      totalReceived = 0
      for (var i = 0; i < distributions.length; i++) {
        totalReceived += Number(distributions[i].quantity) || 0
      }
    }

    if (totalReceived <= 0) {
      return e.badRequestError('Quantidade total recebida deve ser maior que zero')
    }

    if (!description && distributions.length > 0) {
      try {
        var firstShortage = $app.findRecordById('material_shortages', distributions[0].shortage_id)
        description = firstShortage.getString('description')
        if (!code) code = firstShortage.getString('code') || ''
      } catch (_) {}
    }

    if (!description) {
      return e.badRequestError('Descrição do material é obrigatória')
    }

    var invRecord = null
    if (code) {
      try {
        invRecord = $app.findFirstRecordByFilter(
          'inventory',
          "code = '" + code.replace(/'/g, "''") + "'",
        )
      } catch (_) {}
    }
    if (!invRecord && description) {
      try {
        invRecord = $app.findFirstRecordByFilter(
          'inventory',
          "description = '" + description.replace(/'/g, "''") + "'",
        )
      } catch (_) {}
    }
    if (!invRecord) {
      try {
        var invCol = $app.findCollectionByNameOrId('inventory')
        invRecord = new Record(invCol)
        invRecord.set('code', code || 'REF-' + $security.randomString(6).toUpperCase())
        invRecord.set('description', description)
        invRecord.set('quantity', 0)
        invRecord.set('min_quantity', 0)
        invRecord.set('unit', 'un')
        $app.save(invRecord)
      } catch (err) {
        return e.json(500, {
          error: 'Erro ao criar item de estoque: ' + String(err.message || err),
        })
      }
    } else if (!invRecord.getString('code') && code) {
      try {
        invRecord.set('code', code)
        $app.save(invRecord)
      } catch (_) {}
    }

    var results = []
    var runningBalance = invRecord.getNumber('quantity') || 0
    var todayStr = new Date().toISOString().split('T')[0]
    var purchaseDate = traceability.purchase_date || ''
    var arrivalDate = traceability.arrival_date || todayStr
    var unitPrice = Number(traceability.unit_price) || 0
    var freight = Number(traceability.freight) || 0
    var totalValue = unitPrice > 0 ? unitPrice * totalReceived + freight : freight > 0 ? freight : 0

    var shortageIds = []
    for (var j = 0; j < distributions.length; j++) {
      shortageIds.push(distributions[j].shortage_id)
    }
    var shortageIdsStr = shortageIds.join(', ')

    var movCol = $app.findCollectionByNameOrId('inventory_movements')

    try {
      var entrada = new Record(movCol)
      entrada.set('inventory_id', invRecord.id)
      entrada.set('quantity', totalReceived)
      entrada.set('type', 'Entrada')
      entrada.set('reason', 'Recebimento de Material (IDs: ' + shortageIdsStr + ')')
      entrada.set('arrival_date', arrivalDate)
      entrada.set('balance_after', runningBalance + totalReceived)
      if (purchaseDate) entrada.set('purchase_date', purchaseDate)
      if (unitPrice > 0) entrada.set('unit_price', unitPrice)
      if (totalValue > 0) entrada.set('total_value', totalValue)
      if (freight > 0) entrada.set('freight', freight)
      if (userId) entrada.set('user_id', userId)
      $app.save(entrada)
      runningBalance += totalReceived
    } catch (err) {
      return e.json(500, {
        error: 'Erro ao registrar entrada no estoque: ' + String(err.message || err),
      })
    }

    for (var k = 0; k < distributions.length; k++) {
      var dist = distributions[k]
      try {
        var shortage = $app.findRecordById('material_shortages', dist.shortage_id)
        var sTotalQty = shortage.getNumber('quantity') || 0
        var sCurrentReceived = shortage.getNumber('received_quantity') || 0
        var sNewReceived = sCurrentReceived + dist.quantity

        if (sTotalQty > 0 && sNewReceived > sTotalQty) {
          results.push({
            shortage_id: dist.shortage_id,
            success: false,
            error: 'Quantidade excede o total',
          })
          continue
        }

        var newStatus = 'Recebido_Parcial'
        if (sTotalQty > 0 && sNewReceived >= sTotalQty) {
          newStatus = 'Recebido'
        } else if (sTotalQty === 0) {
          newStatus = 'Recebido'
        }

        shortage.set('received_quantity', sNewReceived)
        shortage.set('status', newStatus)
        if (code) shortage.set('code', code)
        $app.save(shortage)

        var orderId = shortage.getString('order_id') || ''
        try {
          var saida = new Record(movCol)
          saida.set('inventory_id', invRecord.id)
          saida.set('quantity', dist.quantity)
          saida.set('type', 'Saída')
          saida.set('reason', 'Distribuição para OP (ID: ' + dist.shortage_id + ')')
          saida.set('exit_date', todayStr)
          saida.set('balance_after', runningBalance - dist.quantity)
          if (orderId) saida.set('order_id', orderId)
          if (userId) saida.set('user_id', userId)
          if (unitPrice > 0) saida.set('unit_price', unitPrice)
          $app.save(saida)
          runningBalance -= dist.quantity
        } catch (err) {
          console.log('Error creating Saída movement:', err.message)
        }

        if (orderId && userId) {
          try {
            var msgCol = $app.findCollectionByNameOrId('pcp_order_messages')
            var msg = new Record(msgCol)
            msg.set('order_id', orderId)
            msg.set('user_id', userId)
            msg.set(
              'content',
              'Material recebido e separado: ' +
                shortage.getString('description') +
                ' (Qtde: ' +
                dist.quantity +
                ')',
            )
            msg.set('sector', 'Operador')
            msg.set('read', false)
            $app.save(msg)
          } catch (_) {}
        }

        results.push({ shortage_id: dist.shortage_id, success: true, status: newStatus })
      } catch (err) {
        results.push({
          shortage_id: dist.shortage_id,
          success: false,
          error: String(err.message || err),
        })
      }
    }

    return e.json(200, { results, inventory_id: invRecord.id, balance: runningBalance })
  },
  $apis.requireAuth(),
)
