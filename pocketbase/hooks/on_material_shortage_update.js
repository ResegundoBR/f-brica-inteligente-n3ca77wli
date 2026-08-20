onRecordUpdate((e) => {
  const record = e.record
  if (!record) {
    e.next()
    return
  }

  var oldStatus = ''
  try {
    var original = record.original()
    if (original && typeof original.getString === 'function') {
      oldStatus = original.getString('status') || ''
    }
  } catch (_) {}

  var newStatus = record.getString('status') || ''
  var dateStr = new Date().toISOString().split('T')[0]

  if (newStatus === 'Cotação' && oldStatus !== 'Cotação') {
    if (!record.getString('quotation_date')) {
      record.set('quotation_date', dateStr)
    }
  }

  if (newStatus === 'Compra' && oldStatus !== 'Compra') {
    if (!record.getString('purchase_date')) {
      record.set('purchase_date', dateStr)
    }
  }

  var receivedQty = 0
  var totalQty = 0
  try {
    receivedQty = Number(record.getFloat('received_quantity')) || 0
    totalQty = Number(record.getFloat('quantity')) || 0
  } catch (_) {}

  if (totalQty > 0 && receivedQty > totalQty) {
    console.log(
      'Validation warning: received_quantity (' +
        receivedQty +
        ') exceeds quantity (' +
        totalQty +
        ') for shortage ' +
        record.id,
    )
  }

  var currentStatus = record.getString('status') || ''

  if (currentStatus !== 'Cancelado' && currentStatus !== 'Liberado_Estoque') {
    if (totalQty > 0 && receivedQty > 0 && receivedQty >= totalQty) {
      record.set('status', 'Recebido')
    } else if (totalQty > 0 && receivedQty > 0 && receivedQty < totalQty) {
      record.set('status', 'Recebido_Parcial')
    }
  }

  e.next()
}, 'material_shortages')
