onRecordAfterUpdateSuccess((e) => {
  const newStatus = e.record.getString('status')
  const oldStatus = e.record.original().getString('status')

  if (newStatus !== 'Recebido' && newStatus !== 'Recebido_Parcial') return e.next()

  const code = e.record.getString('code') || ''
  const description = e.record.getString('description') || ''
  if (!description) return e.next()

  const shortageId = e.record.id
  const receivedQty = e.record.getNumber('received_quantity') || 0
  const totalQty = e.record.getNumber('quantity') || 0

  var targetQty = newStatus === 'Recebido' ? totalQty : receivedQty
  if (targetQty <= 0) return e.next()

  var inventoryRecord = null
  if (code) {
    try {
      inventoryRecord = $app.findFirstRecordByFilter(
        'inventory',
        "code = '" + code.replace(/'/g, "''") + "'",
      )
    } catch (_) {}
  }
  if (!inventoryRecord) {
    try {
      inventoryRecord = $app.findFirstRecordByFilter(
        'inventory',
        "description = '" + description.replace(/'/g, "''") + "'",
      )
    } catch (_) {}
  }

  if (!inventoryRecord) {
    try {
      var invCol = $app.findCollectionByNameOrId('inventory')
      inventoryRecord = new Record(invCol)
      inventoryRecord.set('code', code || 'AUTO-' + shortageId)
      inventoryRecord.set('description', description)
      inventoryRecord.set('quantity', 0)
      inventoryRecord.set('min_quantity', 0)
      inventoryRecord.set('unit', 'un')
      $app.save(inventoryRecord)
    } catch (err) {
      console.log('Error creating inventory record', err.message)
      return e.next()
    }
  }

  var alreadyAdded = 0
  try {
    var existingMovements = $app.findRecordsByFilter(
      'inventory_movements',
      "inventory_id = '" + inventoryRecord.id + "' && reason ~ '" + shortageId + "'",
      '-created',
      100,
      0,
    )
    for (var i = 0; i < existingMovements.length; i++) {
      alreadyAdded += existingMovements[i].getNumber('quantity') || 0
    }
  } catch (_) {}

  var qtyToAdd = targetQty - alreadyAdded
  if (qtyToAdd <= 0) return e.next()

  try {
    var movCol = $app.findCollectionByNameOrId('inventory_movements')
    var movement = new Record(movCol)
    movement.set('inventory_id', inventoryRecord.id)
    movement.set('quantity', qtyToAdd)
    movement.set('type', 'Entrada')
    movement.set('reason', 'Recebimento de Material (Solicitacao ID: ' + shortageId + ')')

    var requestedBy = e.record.getString('requested_by') || ''
    if (requestedBy) {
      movement.set('user_id', requestedBy)
    }

    var orderId = e.record.getString('order_id') || ''
    if (orderId) {
      movement.set('order_id', orderId)
    }

    $app.save(movement)
  } catch (err) {
    console.log('Error creating inventory movement', err.message)
  }

  return e.next()
}, 'material_shortages')
