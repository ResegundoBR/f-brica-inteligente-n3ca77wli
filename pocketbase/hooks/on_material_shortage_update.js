onRecordUpdate((e) => {
  const record = e.record
  const oldStatus = record.original().getString('status') || ''
  const newStatus = record.getString('status') || ''

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

  var receivedQty = record.getNumber('received_quantity')
  if (receivedQty !== receivedQty) {
    receivedQty = 0
  }

  var totalQty = record.getNumber('quantity')
  if (totalQty !== totalQty) {
    totalQty = 0
  }

  var currentStatus = record.getString('status') || ''

  if (currentStatus !== 'Cancelado' && currentStatus !== 'Liberado_Estoque') {
    if (totalQty > 0 && receivedQty >= totalQty) {
      record.set('status', 'Recebido')
    } else if (totalQty > 0 && receivedQty > 0 && receivedQty < totalQty) {
      record.set('status', 'Recebido_Parcial')
    }
  }

  e.next()
}, 'material_shortages')
