/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'POST',
  '/backend/v1/materials/distribute',
  (e) => {
    console.log('=== MATERIAL DISTRIBUTION START ===')

    try {
      var body = e.requestInfo().body || {}
      var distributions = body.distributions || []
      var traceability = body.traceability || {}
      var userId = e.auth ? e.auth.id : ''

      var totalReceived = Number(body.total_received) || 0

      var code = (traceability.code || '').trim()
      var description = (traceability.description || '').trim()

      console.log(
        'Distribute input: distributions=' +
          JSON.stringify(distributions) +
          ' total_received=' +
          totalReceived +
          ' code="' +
          code +
          '" description="' +
          description +
          '" userId=' +
          userId,
      )

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
          var firstShortage = $app.findRecordById(
            'material_shortages',
            distributions[0].shortage_id,
          )
          description = firstShortage.getString('description')
          if (!code) code = firstShortage.getString('code') || ''
        } catch (_) {}
      }

      if (!description) {
        return e.badRequestError('Descrição do material é obrigatória')
      }

      console.log('Resolved code="' + code + '" description="' + description + '"')

      // --- 1. Buscar/criar item de inventário ---
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
        console.log('Inventory item not found — creating new')
        var invCol = $app.findCollectionByNameOrId('inventory')
        invRecord = new Record(invCol)
        var finalCode = code || 'REF-' + $security.randomString(6).toUpperCase()
        invRecord.set('code', finalCode)
        invRecord.set('description', description)
        invRecord.set('quantity', 0)
        invRecord.set('min_quantity', 0)
        invRecord.set('unit', 'un')
        $app.save(invRecord)
        console.log('Inventory item created id=' + invRecord.id + ' code=' + finalCode)
        if (!code) code = finalCode
        // Recarrega do banco para garantir que getFloat()/getString() estejam disponíveis
        invRecord = $app.findRecordById('inventory', invRecord.id)
      } else {
        console.log('Inventory item found id=' + invRecord.id)
        // Recarrega do banco para garantir que getFloat()/getString() estejam disponíveis
        invRecord = $app.findRecordById('inventory', invRecord.id)
        if (!invRecord.getString('code') && code) {
          invRecord.set('code', code)
          $app.save(invRecord)
          console.log('Inventory code updated to ' + code)
        }
      }

      var results = []
      var runningBalance = Number(invRecord.getInt('quantity')) || 0
      var todayStr = new Date().toISOString().split('T')[0]
      var purchaseDate = traceability.purchase_date || ''
      var arrivalDate = traceability.arrival_date || todayStr
      var unitPrice = Number(traceability.unit_price) || 0
      var freight = Number(traceability.freight) || 0
      var totalValue =
        unitPrice > 0 ? unitPrice * totalReceived + freight : freight > 0 ? freight : 0

      console.log(
        'Prepared: runningBalance=' +
          runningBalance +
          ' today=' +
          todayStr +
          ' purchaseDate=' +
          purchaseDate +
          ' arrivalDate=' +
          arrivalDate +
          ' unitPrice=' +
          unitPrice +
          ' freight=' +
          freight +
          ' totalValue=' +
          totalValue,
      )

      var shortageIds = []
      for (var j = 0; j < distributions.length; j++) {
        shortageIds.push(distributions[j].shortage_id)
      }
      var shortageIdsStr = shortageIds.join(', ')

      // --- 2. Movimento de Entrada (total_received) ---
      var movCol = $app.findCollectionByNameOrId('inventory_movements')

      var entrada = new Record(movCol)
      entrada.set('inventory_id', invRecord.id)
      entrada.set('quantity', Number(totalReceived))
      entrada.set('type', 'Entrada')
      entrada.set('reason', 'Recebimento de Material (IDs: ' + shortageIdsStr + ')')
      entrada.set('arrival_date', arrivalDate)
      entrada.set('balance_after', Number(runningBalance) + Number(totalReceived))
      if (purchaseDate) entrada.set('purchase_date', purchaseDate)
      if (unitPrice > 0) entrada.set('unit_price', unitPrice)
      if (totalValue > 0) entrada.set('total_value', totalValue)
      if (freight > 0) entrada.set('freight', freight)
      if (userId) entrada.set('user_id', userId)
      console.log('Saving Entrada movement (qty=' + totalReceived + ')')
      $app.save(entrada)
      console.log('Entrada movement saved id=' + entrada.id)
      runningBalance = Number(runningBalance) + Number(totalReceived)

      // --- 3. Para cada distribuição: atualizar shortage, criar Saída, criar mensagem ---
      for (var k = 0; k < distributions.length; k++) {
        var dist = distributions[k]
        var distQty = Number(dist.quantity) || 0
        console.log(
          'Processing distribution #' +
            (k + 1) +
            ' shortage_id=' +
            dist.shortage_id +
            ' qty=' +
            distQty,
        )

        var shortage = $app.findRecordById('material_shortages', dist.shortage_id)
        var sTotalQty = Number(shortage.getInt('quantity')) || 0
        var sCurrentReceived = Number(shortage.getInt('received_quantity')) || 0
        var sNewReceived = sCurrentReceived + distQty

        if (sTotalQty > 0 && sNewReceived > sTotalQty) {
          console.log('Skipped: qty exceeds total for shortage ' + dist.shortage_id)
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
        console.log(
          'Saving shortage ' +
            dist.shortage_id +
            ' status=' +
            newStatus +
            ' received=' +
            sNewReceived,
        )
        $app.save(shortage)
        console.log('Shortage saved ' + dist.shortage_id)

        var orderId = shortage.getString('order_id') || ''
        var opNumber = ''
        if (orderId) {
          try {
            var opOrder = $app.findRecordById('pcp_orders', orderId)
            opNumber = opOrder.getString('op_number') || opOrder.getString('order_number') || ''
          } catch (_) {}
        }

        var saida = new Record(movCol)
        saida.set('inventory_id', invRecord.id)
        saida.set('quantity', distQty)
        saida.set('type', 'Saída')
        saida.set(
          'reason',
          'Distribuição para OP' +
            (opNumber ? ' ' + opNumber : '') +
            ' (ID: ' +
            dist.shortage_id +
            ')',
        )
        saida.set('exit_date', todayStr)
        saida.set('balance_after', Number(runningBalance) - distQty)
        if (orderId) saida.set('order_id', orderId)
        if (userId) saida.set('user_id', userId)
        if (unitPrice > 0) saida.set('unit_price', unitPrice)
        console.log('Saving Saída movement (qty=' + distQty + ' order=' + orderId + ')')
        $app.save(saida)
        console.log('Saída movement saved id=' + saida.id)
        runningBalance = Number(runningBalance) - distQty

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
                distQty +
                ')',
            )
            msg.set('sector', 'Operador')
            msg.set('read', false)
            $app.save(msg)
            console.log('OP message created id=' + msg.id)
          } catch (msgErr) {
            console.log('Failed to create OP message: ' + String(msgErr))
          }
        }

        results.push({ shortage_id: dist.shortage_id, success: true, status: newStatus })
      }

      // --- 4. Atualizar saldo final do inventário ---
      invRecord.set('quantity', Number(runningBalance))
      console.log('Updating inventory final quantity=' + runningBalance)
      $app.save(invRecord)
      console.log('Inventory quantity updated')

      console.log('=== MATERIAL DISTRIBUTION SUCCESS ===')
      return e.json(200, { results, inventory_id: invRecord.id, balance: runningBalance })
    } catch (err) {
      console.log('=== MATERIAL DISTRIBUTION ERROR ===', String(err))
      return e.json(500, { error: 'Erro interno: ' + String(err) })
    }
  },
  $apis.requireAuth(),
)
