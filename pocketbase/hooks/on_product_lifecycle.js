onRecordAfterCreateSuccess((e) => {
  try {
    const logs = $app.findCollectionByNameOrId('activity_logs')
    const log = new Record(logs)
    log.set('product_id', e.record.id)
    const userId = e.auth ? e.auth.id : null
    log.set('user_id', userId || e.record.getString('owner') || null)

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
          notif.set('message', `Um novo produto foi cadastrado: "${e.record.getString('name')}".`)
          notif.set('read', false)
          $app.saveNoValidate(notif)
        }
      }
    } catch (notifErr) {
      $app.logger().error('Failed to send product create notifications', 'error', String(notifErr))
    }
  } catch (err) {
    $app.logger().error('Error logging product create', 'error', String(err))
  }
  e.next()
}, 'products')

onRecordAfterUpdateSuccess((e) => {
  try {
    const original = e.record.original()
    const newStatusId = e.record.getString('status')
    const oldStatusId = original.getString('status')

    const logs = $app.findCollectionByNameOrId('activity_logs')
    const userId = e.auth ? e.auth.id : null

    const changes = []
    const details = {}

    if (original.getString('name') !== e.record.getString('name')) {
      changes.push('Nome')
      details.old_name = original.getString('name')
      details.new_name = e.record.getString('name')
    }
    if (original.getString('code') !== e.record.getString('code')) {
      changes.push('Código')
      details.old_code = original.getString('code')
      details.new_code = e.record.getString('code')
    }
    if (original.getString('description') !== e.record.getString('description')) {
      changes.push('Descrição')
      details.old_desc = original.getString('description')
      details.new_desc = e.record.getString('description')
    }

    const oldFiles = original.getStringSlice('files').join(',')
    const newFiles = e.record.getStringSlice('files').join(',')
    if (oldFiles !== newFiles) changes.push('Arquivos')

    const oldCompFiles = original.getStringSlice('composition_files').join(',')
    const newCompFiles = e.record.getStringSlice('composition_files').join(',')
    if (oldCompFiles !== newCompFiles) changes.push('Arquivos de Composição')

    const oldEngFiles = original.getStringSlice('engineering_files').join(',')
    const newEngFiles = e.record.getStringSlice('engineering_files').join(',')
    if (oldEngFiles !== newEngFiles) changes.push('Arquivos de Engenharia')

    if (changes.length > 0) {
      const log = new Record(logs)
      log.set('product_id', e.record.id)
      log.set('user_id', userId)
      log.set('action', `Produto atualizado: ${changes.join(', ')}`)
      log.set('details', details)
      $app.saveNoValidate(log)
    }

    if (oldStatusId !== newStatusId && newStatusId) {
      const log = new Record(logs)
      log.set('product_id', e.record.id)

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
        if (ownerId && ownerId !== userId) {
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
              if (rev.id === userId) continue // don't notify the person who sent it
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
        if (ownerId && ownerId !== userId) {
          const notif = new Record(notifications)
          notif.set('user_id', ownerId)
          notif.set('message', `O revisor solicitou ajustes no produto "${productName}".`)
          notif.set('read', false)
          $app.saveNoValidate(notif)
        }
      }
    }
  } catch (err) {
    $app.logger().error('Error processing product update', 'error', String(err))
  }
  e.next()
}, 'products')
