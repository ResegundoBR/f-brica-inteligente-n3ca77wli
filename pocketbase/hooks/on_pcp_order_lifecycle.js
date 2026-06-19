onRecordCreate((e) => {
  const record = e.record
  const bottleneck = record.getString('bottleneck_reason')

  if (bottleneck && bottleneck !== 'Nenhum') {
    record.set('status', 'Parado')
  } else if (!record.getString('status')) {
    record.set('status', 'Fila')
  }

  e.next()
}, 'pcp_orders')

onRecordUpdate((e) => {
  const record = e.record
  const bottleneck = record.getString('bottleneck_reason')

  if (bottleneck && bottleneck !== 'Nenhum') {
    record.set('status', 'Parado')
  }

  e.next()
}, 'pcp_orders')
