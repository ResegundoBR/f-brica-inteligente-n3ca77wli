onRecordValidate((e) => {
  const record = e.record
  const bottleneck = record.getString('bottleneck_reason')

  if (bottleneck && bottleneck !== 'Nenhum') {
    record.set('status', 'Parado')
  }

  e.next()
}, 'pcp_orders')
