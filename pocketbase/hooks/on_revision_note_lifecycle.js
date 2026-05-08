onRecordAfterCreateSuccess((e) => {
  try {
    const point = $app.findRecordById('revision_points', e.record.getString('revision_point_id'))
    const product = $app.findRecordById('products', point.getString('product_id'))
    const userId = e.auth ? e.auth.id : null

    const logs = $app.findCollectionByNameOrId('activity_logs')
    const log = new Record(logs)
    log.set('product_id', point.getString('product_id'))
    log.set('user_id', userId)
    log.set('action', `Nota adicionada ao ponto de revisão`)
    $app.saveNoValidate(log)

    const ownerId = product.getString('owner')
    if (ownerId && ownerId !== userId) {
      const notifications = $app.findCollectionByNameOrId('notifications')
      const notif = new Record(notifications)
      notif.set('user_id', ownerId)
      notif.set(
        'message',
        `Nova nota adicionada na revisão do produto "${product.getString('name')}".`,
      )
      notif.set('read', false)
      $app.saveNoValidate(notif)
    }
  } catch (err) {
    $app.logger().error('Error logging revision note create', 'error', String(err))
  }
  e.next()
}, 'revision_notes')
