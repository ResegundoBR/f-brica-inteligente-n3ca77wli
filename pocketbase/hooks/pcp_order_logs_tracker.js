// @deps
onRecordUpdateRequest((e) => {
  const original = e.record.original()
  const originalStatus = original.getString('status')
  const originalStage = original.getString('stage')

  e.next()

  const currentStatus = e.record.getString('status')
  const currentStage = e.record.getString('stage')

  if (originalStatus !== currentStatus || originalStage !== currentStage) {
    const log = new Record($app.findCollectionByNameOrId('pcp_order_logs'))
    log.set('order_id', e.record.id)

    log.set('user_id', e.auth?.id || null)
    log.set('stage', currentStage)

    let action = ''
    let details = ''

    if (originalStatus !== 'Parado' && currentStatus === 'Parado') {
      action = 'Pausa na Produção (Parado)'
      const reason = e.record.getString('bottleneck_reason') || 'Nenhum'
      const detailStr = e.record.getString('bottleneck_details') || ''
      details = JSON.stringify({ reason, details: detailStr })
    } else if (originalStatus === 'Parado' && currentStatus !== 'Parado') {
      action = 'Retomada da Produção'
    } else if (originalStage !== currentStage) {
      action = `Avançou para ${currentStage}`
    } else {
      action = `Status alterado para ${currentStatus}`
    }

    log.set('action', action)
    log.set('details', details)
    $app.saveNoValidate(log)
  }
}, 'pcp_orders')

onRecordCreateRequest((e) => {
  e.next()

  const log = new Record($app.findCollectionByNameOrId('pcp_order_logs'))
  log.set('order_id', e.record.id)

  log.set('user_id', e.auth?.id || null)
  log.set('stage', e.record.getString('stage'))
  log.set('action', `OP Criada na etapa ${e.record.getString('stage')}`)
  log.set('details', '')
  $app.saveNoValidate(log)
}, 'pcp_orders')
