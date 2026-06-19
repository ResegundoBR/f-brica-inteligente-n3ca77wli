onRecordCreate((e) => {
  const record = e.record
  const bottleneck = record.getString('bottleneck_reason')
  const stage = record.getString('stage')
  let startedAt = record.getString('started_at')
  const finishedAt = record.getString('finished_at')

  if (!startedAt && stage !== 'Separação no estoque fisico') {
    startedAt = new Date().toISOString().replace('T', ' ').substring(0, 19) + 'Z'
    record.set('started_at', startedAt)
  }

  if (bottleneck && bottleneck !== 'Nenhum') {
    record.set('status', 'Parado')
  } else {
    if (stage === 'Embalagem' && finishedAt) {
      record.set('status', 'Concluído')
    } else if (startedAt) {
      record.set('status', 'Em Andamento')
    } else {
      record.set('status', 'Fila')
    }
  }

  e.next()
}, 'pcp_orders')

onRecordUpdate((e) => {
  const record = e.record
  const bottleneck = record.getString('bottleneck_reason')
  const stage = record.getString('stage')
  let startedAt = record.getString('started_at')
  const finishedAt = record.getString('finished_at')

  if (!startedAt && stage !== 'Separação no estoque fisico') {
    startedAt = new Date().toISOString().replace('T', ' ').substring(0, 19) + 'Z'
    record.set('started_at', startedAt)
  }

  if (bottleneck && bottleneck !== 'Nenhum') {
    record.set('status', 'Parado')
  } else {
    if (stage === 'Embalagem' && finishedAt) {
      record.set('status', 'Concluído')
    } else if (startedAt) {
      record.set('status', 'Em Andamento')
    } else {
      record.set('status', 'Fila')
    }
  }

  e.next()
}, 'pcp_orders')
