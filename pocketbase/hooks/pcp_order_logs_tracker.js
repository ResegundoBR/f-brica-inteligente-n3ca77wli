onRecordAfterCreateSuccess((e) => {
  const logCollection = $app.findCollectionByNameOrId('pcp_order_logs')
  const log = new Record(logCollection)
  log.set('order_id', e.record.id)
  if (e.auth && e.auth.id) log.set('user_id', e.auth.id)
  log.set('stage', e.record.getString('stage'))
  log.set('action', 'Início')
  log.set('details', 'Ordem criada')
  $app.saveNoValidate(log)
  e.next()
}, 'pcp_orders')

onRecordAfterUpdateSuccess((e) => {
  const orig = e.record.original()
  const rec = e.record

  const stageChanged = orig.getString('stage') !== rec.getString('stage')
  const statusChanged = orig.getString('status') !== rec.getString('status')
  const bottleneckChanged =
    orig.getString('bottleneck_reason') !== rec.getString('bottleneck_reason') ||
    orig.getString('bottleneck_details') !== rec.getString('bottleneck_details')

  if (!stageChanged && !statusChanged && !bottleneckChanged) {
    return e.next()
  }

  const logCollection = $app.findCollectionByNameOrId('pcp_order_logs')

  if (bottleneckChanged) {
    const log = new Record(logCollection)
    log.set('order_id', rec.id)
    if (e.auth && e.auth.id) log.set('user_id', e.auth.id)
    log.set('stage', rec.getString('stage'))

    const newB = rec.getString('bottleneck_reason')
    const newDetails = rec.getString('bottleneck_details')
    if (newB && newB !== 'Nenhum') {
      log.set('action', 'Parada')
      log.set('details', 'Motivo: ' + newB + (newDetails ? ' - ' + newDetails : ''))
    } else {
      log.set('action', 'Retomada')
      log.set('details', 'Gargalo resolvido')
    }
    $app.saveNoValidate(log)
  }

  if (stageChanged) {
    const log = new Record(logCollection)
    log.set('order_id', rec.id)
    if (e.auth && e.auth.id) log.set('user_id', e.auth.id)
    log.set('stage', rec.getString('stage'))
    log.set('action', 'Transição de Etapa')
    log.set('details', 'Mudou para: ' + rec.getString('stage'))
    $app.saveNoValidate(log)
  }

  if (statusChanged && !stageChanged && !bottleneckChanged) {
    const log = new Record(logCollection)
    log.set('order_id', rec.id)
    if (e.auth && e.auth.id) log.set('user_id', e.auth.id)
    log.set('stage', rec.getString('stage'))
    log.set('action', 'Mudança de Status')
    log.set('details', 'Status: ' + rec.getString('status'))
    $app.saveNoValidate(log)
  }

  e.next()
}, 'pcp_orders')
