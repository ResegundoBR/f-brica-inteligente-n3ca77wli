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
  } catch (err) {
    $app.logger().error('Error logging revision note create', 'error', String(err))
  }
  e.next()
}, 'revision_notes')
