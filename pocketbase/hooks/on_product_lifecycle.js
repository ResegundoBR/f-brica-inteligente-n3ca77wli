onRecordAfterCreateSuccess((e) => {
  const logs = $app.findCollectionByNameOrId('activity_logs')
  const log = new Record(logs)
  log.set('product_id', e.record.id)
  log.set('user_id', e.record.getString('owner') || null)

  let statusName = e.record.getString('status')
  try {
    if (statusName) {
      const s = $app.findRecordById('product_statuses', statusName)
      statusName = s.getString('name')
    }
  } catch (_) {}

  log.set('action', `Produto criado com status ${statusName || 'Nenhum'}`)
  log.set('details', { status: e.record.getString('status') })
  $app.saveNoValidate(log)
  e.next()
}, 'products')

onRecordAfterUpdateSuccess((e) => {
  const oldStatusId = e.record.original().getString('status')
  const newStatusId = e.record.getString('status')

  if (oldStatusId !== newStatusId && newStatusId) {
    const logs = $app.findCollectionByNameOrId('activity_logs')
    const log = new Record(logs)
    log.set('product_id', e.record.id)

    let userId = null
    try {
      userId = e.auth ? e.auth.id : null
    } catch (_) {}

    let oldStatusName = oldStatusId
    let newStatusName = newStatusId

    try {
      if (oldStatusId) {
        const oldS = $app.findRecordById('product_statuses', oldStatusId)
        oldStatusName = oldS.getString('name')
      }
    } catch (_) {}
    try {
      if (newStatusId) {
        const newS = $app.findRecordById('product_statuses', newStatusId)
        newStatusName = newS.getString('name')
      }
    } catch (_) {}

    log.set('user_id', userId)
    log.set('action', `Status alterado de ${oldStatusName || 'Nenhum'} para ${newStatusName}`)
    log.set('details', { old: oldStatusId, new: newStatusId })
    $app.saveNoValidate(log)

    const newStatusNameLower = newStatusName.toLowerCase()
    const notifications = $app.findCollectionByNameOrId('notifications')
    const productName = e.record.getString('name')

    if (newStatusNameLower === 'validado') {
      const ownerId = e.record.getString('owner')
      if (ownerId) {
        const notif = new Record(notifications)
        notif.set('user_id', ownerId)
        notif.set('message', `O produto "${productName}" foi validado com sucesso.`)
        notif.set('read', false)
        $app.saveNoValidate(notif)
      }
    } else if (newStatusNameLower.includes('revisão') || newStatusNameLower.includes('revisao')) {
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

          for (const rev of reviewers) {
            const notif = new Record(notifications)
            notif.set('user_id', rev.id)
            notif.set('message', `O produto "${productName}" foi enviado para revisão.`)
            notif.set('read', false)
            $app.saveNoValidate(notif)
          }
        }
      } catch (err) {
        $app.logger().error('Failed to send review notifications', 'error', String(err))
      }
    } else if (
      newStatusNameLower.includes('ajuste') ||
      newStatusNameLower.includes('pendente') ||
      newStatusNameLower.includes('correção') ||
      newStatusNameLower.includes('correcao')
    ) {
      const ownerId = e.record.getString('owner')
      if (ownerId) {
        const notif = new Record(notifications)
        notif.set('user_id', ownerId)
        notif.set('message', `O revisor solicitou ajustes no produto "${productName}".`)
        notif.set('read', false)
        $app.saveNoValidate(notif)
      }
    }
  }
  e.next()
}, 'products')
