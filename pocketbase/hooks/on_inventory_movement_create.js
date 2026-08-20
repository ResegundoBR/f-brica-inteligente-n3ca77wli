onRecordAfterCreateSuccess((e) => {
  var invId = e.record.getString('inventory_id')
  var qty = e.record.getFloat('quantity') || 0
  var type = e.record.getString('type')

  if (!invId || qty <= 0) return e.next()

  try {
    var invRecord = $app.findRecordById('inventory', invId)
    var currentQty = invRecord.getFloat('quantity') || 0
    var newQty = currentQty
    if (type === 'Entrada') {
      newQty = currentQty + qty
    } else if (type === 'Saída') {
      newQty = Math.max(0, currentQty - qty)
    }
    invRecord.set('quantity', newQty)
    $app.save(invRecord)
  } catch (err) {
    console.log('Error updating inventory quantity from movement:', err.message)
  }

  return e.next()
}, 'inventory_movements')
