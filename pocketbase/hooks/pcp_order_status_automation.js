onRecordValidate((e) => {
  const record = e.record
  const stage = record.getString('stage')
  const bottleneck = record.getString('bottleneck_reason')

  if (bottleneck && bottleneck !== 'Nenhum') {
    record.set('status', 'Parado')
  } else if (stage === 'Embalagem') {
    record.set('status', 'Concluído')
  } else if (stage === 'Separação no estoque fisico') {
    record.set('status', 'Fila')
  } else {
    record.set('status', 'Em Andamento')
  }

  e.next()
}, 'pcp_orders')
