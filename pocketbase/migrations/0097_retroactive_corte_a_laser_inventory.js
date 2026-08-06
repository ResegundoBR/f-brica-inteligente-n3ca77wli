migrate(
  (app) => {
    var description = 'Corte a Laser'
    var code = 'CORTE-LASER'
    var targetQty = 20
    var orderId = ''
    var requestedBy = ''
    var shortageId = ''

    try {
      var shortages = app.findRecordsByFilter(
        'material_shortages',
        "description ~ 'Corte a Laser' && status = 'Recebido'",
        '-created',
        1,
        0,
      )
      if (shortages.length > 0) {
        var s = shortages[0]
        code = (s.getString('code') || '').trim() || code
        description = (s.getString('description') || '').trim() || description
        var receivedQty = s.getNumber('received_quantity') || 0
        var totalQty = s.getNumber('quantity') || 0
        targetQty = receivedQty > 0 ? receivedQty : totalQty > 0 ? totalQty : targetQty
        orderId = s.getString('order_id') || ''
        requestedBy = s.getString('requested_by') || ''
        shortageId = s.id
      }
    } catch (_) {}

    var inventoryRecord = null
    if (code) {
      try {
        inventoryRecord = app.findFirstRecordByFilter(
          'inventory',
          "code = '" + code.replace(/'/g, "''") + "'",
        )
      } catch (_) {}
    }
    if (!inventoryRecord && description) {
      try {
        inventoryRecord = app.findFirstRecordByFilter(
          'inventory',
          "description = '" + description.replace(/'/g, "''") + "'",
        )
      } catch (_) {}
    }

    if (!inventoryRecord) {
      try {
        var invCol = app.findCollectionByNameOrId('inventory')
        inventoryRecord = new Record(invCol)
        inventoryRecord.set('code', code)
        inventoryRecord.set('description', description)
        inventoryRecord.set('quantity', 0)
        inventoryRecord.set('min_quantity', 0)
        inventoryRecord.set('unit', 'un')
        app.save(inventoryRecord)
      } catch (err) {
        console.log('Error creating inventory record:', err.message)
        return
      }
    }

    var reasonRef = shortageId || 'CORTE-LASER'
    var alreadyExists = false
    try {
      var existing = app.findRecordsByFilter(
        'inventory_movements',
        "inventory_id = '" + inventoryRecord.id + "' && reason ~ '" + reasonRef + "'",
        '-created',
        1,
        0,
      )
      if (existing.length > 0) alreadyExists = true
    } catch (_) {}

    if (alreadyExists) return

    try {
      var movCol = app.findCollectionByNameOrId('inventory_movements')
      var movement = new Record(movCol)
      movement.set('inventory_id', inventoryRecord.id)
      movement.set('quantity', targetQty)
      movement.set('type', 'Entrada')
      movement.set(
        'reason',
        'Recebimento retroativo de Solicitação' +
          (shortageId ? ' (ID: ' + shortageId + ')' : ' (Corte a Laser)'),
      )

      if (requestedBy) {
        movement.set('user_id', requestedBy)
      }
      if (orderId) {
        movement.set('order_id', orderId)
      }

      app.save(movement)
    } catch (err) {
      console.log('Error creating inventory movement:', err.message)
    }
  },
  (app) => {
    try {
      var movements = app.findRecordsByFilter(
        'inventory_movements',
        "reason ~ 'Recebimento retroativo'",
        '-created',
        100,
        0,
      )
      for (var i = 0; i < movements.length; i++) {
        try {
          app.delete(movements[i])
        } catch (_) {}
      }
    } catch (_) {}
  },
)
