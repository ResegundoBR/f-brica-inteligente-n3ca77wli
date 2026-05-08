onRecordAfterCreateSuccess((e) => {
  try {
    const point = $app.findRecordById('revision_points', e.record.getString('revision_point_id'))
    const logs = $app.findCollectionByNameOrId('activity_logs')
    const log = new Record(logs)
    log.set('product_id', point.getString('product_id'))
    log.set('user_id', e.auth ? e.auth.id : null)
    log.set('action', `Nota adicionada ao ponto de revisão`)
    $app.saveNoValidate(log)
  } catch (err) {
    $app.logger().error('Error logging revision note create', 'error', String(err))
  }
  e.next()
}, 'revision_notes')
