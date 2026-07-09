onRecordCreate((e) => {
  const record = e.record
  if (!record) {
    e.next()
    return
  }

  var status = record.getString('status') || 'Pendente'
  var dateStr = new Date().toISOString().split('T')[0]

  if (status === 'Cotação' && !record.getString('quotation_date')) {
    record.set('quotation_date', dateStr)
  }

  if (status === 'Compra' && !record.getString('purchase_date')) {
    record.set('purchase_date', dateStr)
  }

  var receivedQty = 0
  var totalQty = 0
  try {
    receivedQty = record.getNumber('received_quantity') || 0
    totalQty = record.getNumber('quantity') || 0
  } catch (_) {
    // numeric getters may fail if fields are not yet set
  }

  if (status !== 'Cancelado' && status !== 'Liberado_Estoque') {
    if (totalQty > 0 && receivedQty > 0 && receivedQty >= totalQty) {
      record.set('status', 'Recebido')
    } else if (totalQty > 0 && receivedQty > 0 && receivedQty < totalQty) {
      record.set('status', 'Recebido_Parcial')
    }
  }

  e.next()
}, 'material_shortages')
