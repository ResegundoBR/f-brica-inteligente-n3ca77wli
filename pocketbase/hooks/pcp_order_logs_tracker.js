// @deps
onRecordAfterUpdateSuccess((e) => {
  const original = e.record.original()
  const current = e.record

  if (
    original.getString('status') !== current.getString('status') ||
    original.getString('stage') !== current.getString('stage')
  ) {
    const log = new Record($app.findCollectionByNameOrId('pcp_order_logs'))
    log.set('order_id', current.id)

    let userId = null
    try {
      const auth = e.requestInfo().auth
      if (auth) userId = auth.id
    } catch (_) {}

    log.set('user_id', userId)
    log.set('stage', current.getString('stage'))

    let action = ''
    let details = ''

    if (original.getString('status') !== 'Parado' && current.getString('status') === 'Parado') {
      action = 'Pausa na Produção (Parado)'
      const reason = current.getString('bottleneck_reason') || 'Nenhum'
      const detailStr = current.getString('bottleneck_details') || ''
      details = JSON.stringify({ reason, details: detailStr })
    } else if (
      original.getString('status') === 'Parado' &&
      current.getString('status') !== 'Parado'
    ) {
      action = 'Retomada da Produção'
    } else if (original.getString('stage') !== current.getString('stage')) {
      action = `Avançou para ${current.getString('stage')}`
    } else {
      action = `Status alterado para ${current.getString('status')}`
    }

    log.set('action', action)
    log.set('details', details)
    $app.save(log)
  }

  e.next()
}, 'pcp_orders')

onRecordAfterCreateSuccess((e) => {
  const current = e.record
  const log = new Record($app.findCollectionByNameOrId('pcp_order_logs'))
  log.set('order_id', current.id)

  let userId = null
  try {
    const auth = e.requestInfo().auth
    if (auth) userId = auth.id
  } catch (_) {}

  log.set('user_id', userId)
  log.set('stage', current.getString('stage'))
  log.set('action', `OP Criada na etapa ${current.getString('stage')}`)
  log.set('details', '')
  $app.save(log)
  e.next()
}, 'pcp_orders')
