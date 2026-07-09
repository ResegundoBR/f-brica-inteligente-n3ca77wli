onRecordAfterCreateSuccess((e) => {
  var movement = e.record
  var inventoryId = movement.getString('inventory_id')
  if (!inventoryId) return e.next()

  var type = movement.getString('type')
  var quantity = movement.getNumber('quantity') || 0
  if (quantity <= 0) return e.next()

  try {
    var inventory = $app.findRecordById('inventory', inventoryId)
    var currentQty = inventory.getNumber('quantity') || 0

    if (type === 'Entrada') {
      inventory.set('quantity', currentQty + quantity)
    } else if (type === 'Saida' || type === 'Sa\u00edda') {
      inventory.set('quantity', Math.max(0, currentQty - quantity))
    }

    $app.save(inventory)
  } catch (err) {
    console.log('Error updating inventory balance', err.message)
  }

  return e.next()
}, 'inventory_movements')
