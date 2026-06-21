onRecordUpdateRequest((e) => {
  const oldStage = e.record.original().getString('stage')
  const newStage = e.record.getString('stage')
  const oldStatus = e.record.original().getString('status')
  const newStatus = e.record.getString('status')

  if (oldStage !== newStage || oldStatus !== newStatus) {
    let action = ''
    let details = ''

    if (oldStage !== newStage && oldStatus !== newStatus) {
      action = 'Atualização de Etapa e Status'
      details = `Etapa alterada para ${newStage} e Status para ${newStatus}`
    } else if (oldStage !== newStage) {
      action = 'Alteração de Etapa'
      details = `Etapa alterada de ${oldStage} para ${newStage}`
    } else {
      action = 'Alteração de Status'
      details = `Status alterado de ${oldStatus} para ${newStatus}`
    }

    const log = new Record($app.findCollectionByNameOrId('pcp_order_logs'))
    log.set('order_id', e.record.id)
    log.set('stage', newStage)
    log.set('action', action)
    log.set('details', details)
    if (e.auth && e.auth.id) {
      log.set('user_id', e.auth.id)
    }

    try {
      $app.saveNoValidate(log)
    } catch (err) {
      $app.logger().error('Failed to save pcp_order_log', 'error', err.message)
    }
  }

  e.next()
}, 'pcp_orders')
