routerAdd(
  'POST',
  '/backend/v1/materials/distribute',
  (e) => {
    var body = e.requestInfo().body || {}
    var distributions = body.distributions || []
    var surplus = body.surplus
    var userId = e.auth ? e.auth.id : ''

    if (!Array.isArray(distributions) || distributions.length === 0) {
      if (!surplus || !surplus.quantity || surplus.quantity <= 0) {
        return e.badRequestError('Nenhuma distribuição informada')
      }
    }

    var results = []

    for (var i = 0; i < distributions.length; i++) {
      var dist = distributions[i]
      try {
        var shortage = $app.findRecordById('material_shortages', dist.shortage_id)
        var totalQty = shortage.getNumber('quantity') || 0
        var currentReceived = shortage.getNumber('received_quantity') || 0
        var newReceived = currentReceived + dist.quantity

        if (totalQty > 0 && newReceived > totalQty) {
          results.push({
            shortage_id: dist.shortage_id,
            success: false,
            error: 'Quantidade excede o total',
          })
          continue
        }

        var newStatus = 'Recebido_Parcial'
        if (totalQty > 0 && newReceived >= totalQty) {
          newStatus = 'Recebido'
        } else if (totalQty === 0) {
          newStatus = 'Recebido'
        }

        shortage.set('received_quantity', newReceived)
        shortage.set('status', newStatus)
        $app.save(shortage)

        var orderId = shortage.getString('order_id')
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

    if (surplus && surplus.quantity > 0) {
      try {
        var code = (surplus.code || '').trim()
        var desc = (surplus.description || '').trim()
        var invRecord = null

        if (code) {
          try {
            invRecord = $app.findFirstRecordByFilter(
              'inventory',
              "code = '" + code.replace(/'/g, "''") + "'",
            )
          } catch (_) {}
        }
        if (!invRecord && desc) {
          try {
            invRecord = $app.findFirstRecordByFilter(
              'inventory',
              "description = '" + desc.replace(/'/g, "''") + "'",
            )
          } catch (_) {}
        }
        if (!invRecord) {
          var invCol = $app.findCollectionByNameOrId('inventory')
          invRecord = new Record(invCol)
          invRecord.set('code', code || 'REF-SURPLUS')
          invRecord.set('description', desc || 'Material sem descrição')
          invRecord.set('quantity', 0)
          invRecord.set('min_quantity', 0)
          invRecord.set('unit', 'un')
          $app.save(invRecord)
        }

        var movCol = $app.findCollectionByNameOrId('inventory_movements')
        var movement = new Record(movCol)
        movement.set('inventory_id', invRecord.id)
        movement.set('quantity', surplus.quantity)
        movement.set('type', 'Entrada')
        movement.set('reason', 'Recebimento - Excedente para estoque')
        if (userId) movement.set('user_id', userId)
        $app.save(movement)

        results.push({ surplus: true, success: true, inventory_id: invRecord.id })
      } catch (err) {
        results.push({ surplus: true, success: false, error: String(err.message || err) })
      }
    }

    return e.json(200, { results })
  },
  $apis.requireAuth(),
)
