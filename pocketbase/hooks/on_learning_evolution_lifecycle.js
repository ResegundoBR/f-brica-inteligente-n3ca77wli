onRecordAfterCreateSuccess((e) => {
  try {
    const userId = e.auth ? e.auth.id : null

    try {
      const roles = $app.findRecordsByFilter(
        'roles',
        "name = 'admin' || name = 'Administrador' || name = 'reviewer' || name = 'revisador' || name = 'Revisador'",
        '',
        100,
        0,
      )
      if (roles.length > 0) {
        const roleConditions = roles.map((r) => `role = '${r.id}'`).join(' || ')
        const reviewers = $app.findRecordsByFilter('users', roleConditions, '', 1000, 0)
        const notifications = $app.findCollectionByNameOrId('notifications')

        for (const rev of reviewers) {
          if (rev.id === userId) continue // don't notify the creator
          const notif = new Record(notifications)
          notif.set('user_id', rev.id)
          notif.set(
            'message',
            `Um novo aprendizado foi cadastrado: "${e.record.getString('title')}".`,
          )
          notif.set('read', false)
          $app.saveNoValidate(notif)
        }
      }
    } catch (notifErr) {
      $app
        .logger()
        .error('Failed to send learning evolution create notifications', 'error', String(notifErr))
    }
  } catch (err) {
    $app.logger().error('Error logging learning evolution create', 'error', String(err))
  }
  e.next()
}, 'learning_evolution')
