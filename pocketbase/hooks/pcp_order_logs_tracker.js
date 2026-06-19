// @deps
onRecordAfterUpdateSuccess((e) => {
  const original = e.record.original()
  const current = e.record

  // Status changed to Parado
  if (original.getString('status') !== 'Parado' && current.getString('status') === 'Parado') {
    const log = new Record($app.findCollectionByNameOrId('pcp_order_logs'))
    log.set('order_id', current.id)
    log.set('user_id', e.requestInfo().auth?.id || null)
    log.set('stage', current.getString('stage'))
    log.set('action', 'Pausa na Produção (Parado)')

    const reason = current.getString('bottleneck_reason') || 'Nenhum'
    const details = current.getString('bottleneck_details') || ''
    log.set('details', JSON.stringify({ reason, details }))

    $app.save(log)
  }
  // Status returned from Parado
  else if (original.getString('status') === 'Parado' && current.getString('status') !== 'Parado') {
    const log = new Record($app.findCollectionByNameOrId('pcp_order_logs'))
    log.set('order_id', current.id)
    log.set('user_id', e.requestInfo().auth?.id || null)
    log.set('stage', current.getString('stage'))
    log.set('action', 'Retomada da Produção')
    log.set('details', '')
    $app.save(log)
  }
  // Stage advanced
  else if (original.getString('stage') !== current.getString('stage')) {
    const log = new Record($app.findCollectionByNameOrId('pcp_order_logs'))
    log.set('order_id', current.id)
    log.set('user_id', e.requestInfo().auth?.id || null)
    log.set('stage', current.getString('stage'))
    log.set('action', `Avançou para ${current.getString('stage')}`)
    log.set('details', '')
    $app.save(log)
  }

  e.next()
}, 'pcp_orders')
