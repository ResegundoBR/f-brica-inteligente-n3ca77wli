onRecordUpdate((e) => {
  const record = e.record
  const oldStatus = record.original().getString('status') || ''
  const newStatus = record.getString('status') || ''

  if (newStatus === 'Cotação' && oldStatus !== 'Cotação') {
    record.set('quotation_date', new Date().toISOString())
  }

  if (newStatus === 'Compra' && oldStatus !== 'Compra') {
    record.set('purchase_date', new Date().toISOString())
  }

  var receivedQty = record.getNumber('received_quantity') || 0
  if (receivedQty !== receivedQty) {
    receivedQty = 0
  }

  var totalQty = record.getNumber('quantity') || 0
  if (totalQty !== totalQty) {
    totalQty = 0
  }

  if (totalQty > 0 && receivedQty > 0) {
    if (receivedQty < totalQty) {
      record.set('status', 'Recebido_Parcial')
    } else {
      var currentStatus = record.getString('status') || ''
      if (currentStatus !== 'Cancelado' && currentStatus !== 'Liberado_Estoque') {
        record.set('status', 'Recebido')
      }
    }
  }

  if ((record.getString('status') || '') === 'Recebido' && totalQty > 0 && receivedQty < totalQty) {
    if (receivedQty > 0) {
      record.set('status', 'Recebido_Parcial')
    } else if (oldStatus !== 'Recebido' && oldStatus !== '') {
      record.set('status', oldStatus)
    }
  }

  e.next()
}, 'material_shortages')
