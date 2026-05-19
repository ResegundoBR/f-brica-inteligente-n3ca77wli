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

    if (point.getBool('resolved')) {
      point.set('resolved', false)
      $app.saveNoValidate(point)

      try {
        const historyCol = $app.findCollectionByNameOrId('revision_history')
        const historyRec = new Record(historyCol)
        historyRec.set('revision_point_id', point.id)
        historyRec.set('user_id', userId)
        historyRec.set('action', 'Status redefinido para Pendente devido a nova nota.')
        $app.saveNoValidate(historyRec)
      } catch (err2) {
        $app.logger().error('Error logging revision note status reset', 'error', String(err2))
      }
    }
  } catch (err) {
    $app.logger().error('Error logging revision note create', 'error', String(err))
  }
  e.next()
}, 'revision_notes')
