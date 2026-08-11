onRecordAfterUpdateSuccess((e) => {
  var newStatus = e.record.getString('status')
  if (newStatus !== 'Recebido' && newStatus !== 'Recebido_Parcial') return e.next()

  var code = (e.record.getString('code') || '').trim()
  var description = (e.record.getString('description') || '').trim()
  if (!description) return e.next()

  var shortageId = e.record.id
  var receivedQty = e.record.getNumber('received_quantity') || 0
  var totalQty = e.record.getNumber('quantity') || 0

  var targetQty =
    newStatus === 'Recebido' ? (receivedQty > 0 ? receivedQty : totalQty) : receivedQty
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
  if (!inventoryRecord && description) {
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
      var finalCode = code || 'REF-' + shortageId.substring(0, 6).toUpperCase()
      inventoryRecord.set('code', finalCode)
      inventoryRecord.set('description', description)
      inventoryRecord.set('quantity', 0)
      inventoryRecord.set('min_quantity', 0)
      inventoryRecord.set('unit', 'un')
      $app.saveNoValidate(inventoryRecord)
    } catch (err) {
      console.log('Error creating inventory record:', err.message)
      return e.next()
    }
  } else if (!inventoryRecord.getString('code') && code) {
    try {
      inventoryRecord.set('code', code)
      $app.save(inventoryRecord)
    } catch (_) {}
  }

  var alreadyAdded = 0
  try {
    var existingMovements = $app.findRecordsByFilter(
      'inventory_movements',
      "inventory_id = '" +
        inventoryRecord.id +
        "' && type = 'Entrada' && reason ~ '" +
        shortageId +
        "'",
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

  var purchaseDate = e.record.getString('purchase_date') || ''
  var unitPrice = e.record.getNumber('unit_price') || 0
  var totalValue = unitPrice > 0 ? unitPrice * qtyToAdd : 0
  var todayStr = new Date().toISOString().split('T')[0]

  var currentBalance = inventoryRecord.getNumber('quantity') || 0
  var balanceAfter = currentBalance + qtyToAdd

  try {
    var movCol = $app.findCollectionByNameOrId('inventory_movements')
    var movement = new Record(movCol)
    movement.set('inventory_id', inventoryRecord.id)
    movement.set('quantity', qtyToAdd)
    movement.set('type', 'Entrada')
    movement.set('reason', 'Recebimento de Solicitação (ID: ' + shortageId + ')')
    movement.set('arrival_date', todayStr)
    movement.set('balance_after', balanceAfter)

    if (purchaseDate) {
      movement.set('purchase_date', purchaseDate)
    }
    if (unitPrice > 0) {
      movement.set('unit_price', unitPrice)
      movement.set('total_value', totalValue)
    }

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
    console.log('Error creating inventory movement:', err.message)
  }

  return e.next()
}, 'material_shortages')
