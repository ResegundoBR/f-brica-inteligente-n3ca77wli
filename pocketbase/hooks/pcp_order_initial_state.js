// @deps
onRecordCreate((e) => {
  e.record.set('status', 'Fila')
  e.record.set('stage', 'Separação no estoque fisico')
  e.next()
}, 'pcp_orders')
