onRecordCreate((e) => {
  e.record.set('status', 'Fila')
  e.record.set('stage', 'Separação')
  e.next()
}, 'pcp_orders')
