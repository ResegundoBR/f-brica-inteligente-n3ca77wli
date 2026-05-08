onRecordAfterCreateSuccess((e) => {
  try {
    const logs = $app.findCollectionByNameOrId('activity_logs')
    const userId = e.auth ? e.auth.id : null
    const log = new Record(logs)
    log.set('product_id', e.record.getString('product_id'))
    log.set('user_id', userId)
    log.set('action', `Novo processo adicionado: ${e.record.getString('name')}`)
    $app.saveNoValidate(log)

    const product = $app.findRecordById('products', e.record.getString('product_id'))
    const ownerId = product.getString('owner')
    if (ownerId && ownerId !== userId) {
      const notifications = $app.findCollectionByNameOrId('notifications')
      const notif = new Record(notifications)
      notif.set('user_id', ownerId)
      notif.set(
        'message',
        `Um novo processo "${e.record.getString('name')}" foi adicionado ao produto "${product.getString('name')}".`,
      )
      notif.set('read', false)
      $app.saveNoValidate(notif)
    }
  } catch (err) {
    $app.logger().error('Error logging process create', 'error', String(err))
  }
  e.next()
}, 'product_processes')

onRecordAfterUpdateSuccess((e) => {
  try {
    const original = e.record.original()
    const logs = $app.findCollectionByNameOrId('activity_logs')
    const userId = e.auth ? e.auth.id : null

    let action = ''
    if (original.getString('name') !== e.record.getString('name')) {
      action = `Processo renomeado de "${original.getString('name')}" para "${e.record.getString('name')}"`
    } else if (original.getString('description') !== e.record.getString('description')) {
      action = `Descrição do processo "${e.record.getString('name')}" atualizada`
    } else if (original.getInt('order') !== e.record.getInt('order')) {
      action = `Ordem do processo "${e.record.getString('name')}" alterada`
    } else if (
      original.getStringSlice('image').join(',') !== e.record.getStringSlice('image').join(',')
    ) {
      action = `Imagens do processo "${e.record.getString('name')}" atualizadas`
    }

    if (action) {
      const log = new Record(logs)
      log.set('product_id', e.record.getString('product_id'))
      log.set('user_id', userId)
      log.set('action', action)

      const details = {}
      if (original.getString('description') !== e.record.getString('description')) {
        details.old_desc = original.getString('description')
        details.new_desc = e.record.getString('description')
      }
      log.set('details', details)

      $app.saveNoValidate(log)

      const product = $app.findRecordById('products', e.record.getString('product_id'))
      const ownerId = product.getString('owner')
      if (ownerId && ownerId !== userId) {
        const notifications = $app.findCollectionByNameOrId('notifications')
        const notif = new Record(notifications)
        notif.set('user_id', ownerId)
        notif.set(
          'message',
          `O processo "${e.record.getString('name')}" do produto "${product.getString('name')}" foi atualizado.`,
        )
        notif.set('read', false)
        $app.saveNoValidate(notif)
      }
    }
  } catch (err) {
    $app.logger().error('Error logging process update', 'error', String(err))
  }
  e.next()
}, 'product_processes')

onRecordAfterDeleteSuccess((e) => {
  try {
    const logs = $app.findCollectionByNameOrId('activity_logs')
    const log = new Record(logs)
    log.set('product_id', e.record.getString('product_id'))
    log.set('user_id', e.auth ? e.auth.id : null)
    log.set('action', `Processo removido: ${e.record.getString('name')}`)
    $app.saveNoValidate(log)
  } catch (err) {
    $app.logger().error('Error logging process delete', 'error', String(err))
  }
  e.next()
}, 'product_processes')
