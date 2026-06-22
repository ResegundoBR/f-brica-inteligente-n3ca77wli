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
  const original = e.record.original()
  const newBottleneck = record.getString('bottleneck_reason')
  const oldBottleneck = original.getString('bottleneck_reason')
  const status = record.getString('status')
  const oldStatus = original.getString('status')

  const statusChangedManually = status !== oldStatus

  if (newBottleneck && newBottleneck !== 'Nenhum') {
    if (newBottleneck !== oldBottleneck || !statusChangedManually) {
      record.set('status', 'Parado')
    }
  }

  e.next()
}, 'pcp_orders')
