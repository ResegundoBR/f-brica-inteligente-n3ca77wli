onRecordAfterCreateSuccess((e) => {
  const logs = $app.findCollectionByNameOrId('activity_logs')
  const log = new Record(logs)
  log.set('product_id', e.record.id)
  log.set('user_id', e.record.getString('owner') || null)
  log.set('action', 'Produto criado')
  log.set('details', { status: e.record.getString('status') })
  $app.saveNoValidate(log)
  e.next()
}, 'products')

onRecordAfterUpdateSuccess((e) => {
  const oldStatus = e.record.original().getString('status')
  const newStatus = e.record.getString('status')

  if (oldStatus !== newStatus) {
    const logs = $app.findCollectionByNameOrId('activity_logs')
    const log = new Record(logs)
    log.set('product_id', e.record.id)

    let userId = null
    try {
      userId = e.auth ? e.auth.id : null
    } catch (_) {}

    log.set('user_id', userId)
    log.set('action', `Status alterado de ${oldStatus} para ${newStatus}`)
    log.set('details', { old: oldStatus, new: newStatus })
    $app.saveNoValidate(log)

    if (newStatus === 'revisao') {
      const reviewers = $app.findRecordsByFilter(
        'users',
        "role = 'reviewer' || role = 'admin'",
        '',
        100,
        0,
      )
      const notifications = $app.findCollectionByNameOrId('notifications')

      for (const rev of reviewers) {
        const notif = new Record(notifications)
        notif.set('user_id', rev.id)
        notif.set('message', `Produto "${e.record.getString('name')}" enviado para revisão.`)
        notif.set('read', false)
        $app.saveNoValidate(notif)
      }
    }
  }
  e.next()
}, 'products')
