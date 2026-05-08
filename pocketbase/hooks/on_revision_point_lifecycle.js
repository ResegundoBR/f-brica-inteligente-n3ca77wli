onRecordAfterCreateSuccess((e) => {
  try {
    const logs = $app.findCollectionByNameOrId('activity_logs')
    const log = new Record(logs)
    log.set('product_id', e.record.getString('product_id'))
    log.set('user_id', e.auth ? e.auth.id : null)
    log.set('action', `Novo ponto de revisão adicionado: ${e.record.getString('description')}`)
    $app.saveNoValidate(log)
  } catch (err) {
    $app.logger().error('Error logging revision point create', 'error', String(err))
  }
  e.next()
}, 'revision_points')

onRecordAfterDeleteSuccess((e) => {
  try {
    const logs = $app.findCollectionByNameOrId('activity_logs')
    const log = new Record(logs)
    log.set('product_id', e.record.getString('product_id'))
    log.set('user_id', e.auth ? e.auth.id : null)
    log.set('action', `Ponto de revisão removido: ${e.record.getString('description')}`)
    $app.saveNoValidate(log)
  } catch (err) {
    $app.logger().error('Error logging revision point delete', 'error', String(err))
  }
  e.next()
}, 'revision_points')

onRecordAfterUpdateSuccess((e) => {
  try {
    const original = e.record.original()
    const logs = $app.findCollectionByNameOrId('activity_logs')
    const userId = e.auth ? e.auth.id : null

    let action = ''
    if (original.getBool('resolved') !== e.record.getBool('resolved')) {
      action = e.record.getBool('resolved')
        ? `Ponto de revisão marcado como resolvido`
        : `Ponto de revisão reaberto`
    } else if (original.getString('description') !== e.record.getString('description')) {
      action = `Descrição do ponto de revisão atualizada`
    } else if (original.getString('notes') !== e.record.getString('notes')) {
      action = `Observação do ponto de revisão atualizada`
    } else if (
      original.getStringSlice('files').join(',') !== e.record.getStringSlice('files').join(',')
    ) {
      action = `Arquivos do ponto de revisão atualizados`
    }

    if (action) {
      const log = new Record(logs)
      log.set('product_id', e.record.getString('product_id'))
      log.set('user_id', userId)
      log.set('action', action)
      $app.saveNoValidate(log)
    }
  } catch (err) {
    $app.logger().error('Error logging revision point update', 'error', String(err))
  }
  e.next()
}, 'revision_points')
