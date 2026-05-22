onRecordAfterCreateSuccess((e) => {
  try {
    const logs = $app.findCollectionByNameOrId('activity_logs')
    const log = new Record(logs)
    const productId = e.record.getString('product_id')
    log.set('product_id', productId)
    log.set('user_id', e.auth ? e.auth.id : null)
    log.set('action', `Novo ponto de revisão adicionado: ${e.record.getString('description')}`)
    $app.saveNoValidate(log)

    try {
      const product = $app.findRecordById('products', productId)
      let validadoId = null
      try {
        validadoId = $app.findFirstRecordByData('product_statuses', 'name', 'Validado').id
      } catch (_) {}

      if (product.getString('status') !== validadoId) {
        const allPoints = $app.findRecordsByFilter(
          'revision_points',
          `product_id = '${productId}'`,
          '',
          1000,
          0,
        )
        if (allPoints.length > 0) {
          const allResolved = allPoints.every((p) => p.getBool('resolved') === true)
          let targetStatusName = allResolved ? 'Pronto p/ Revisão' : 'Ajuste/Pendência'

          if (allResolved) {
            const hasFiles = product.getStringSlice('files').length > 0
            const hasEngFiles = product.getStringSlice('engineering_files').length > 0
            if (!hasFiles || !hasEngFiles) {
              targetStatusName = 'Falta Docs'
            }
          }

          const status = $app.findFirstRecordByData('product_statuses', 'name', targetStatusName)
          if (product.getString('status') !== status.id) {
            product.set('status', status.id)
            $app.saveNoValidate(product)
          }
        }
      }
    } catch (_) {}
  } catch (err) {
    $app.logger().error('Error logging revision point create', 'error', String(err))
  }
  e.next()
}, 'revision_points')

onRecordAfterDeleteSuccess((e) => {
  try {
    const logs = $app.findCollectionByNameOrId('activity_logs')
    const log = new Record(logs)
    const productId = e.record.getString('product_id')
    log.set('product_id', productId)
    log.set('user_id', e.auth ? e.auth.id : null)
    log.set('action', `Ponto de revisão removido: ${e.record.getString('description')}`)
    $app.saveNoValidate(log)

    try {
      const product = $app.findRecordById('products', productId)
      let validadoId = null
      try {
        validadoId = $app.findFirstRecordByData('product_statuses', 'name', 'Validado').id
      } catch (_) {}

      if (product.getString('status') !== validadoId) {
        const allPoints = $app.findRecordsByFilter(
          'revision_points',
          `product_id = '${productId}'`,
          '',
          1000,
          0,
        )
        if (allPoints.length > 0) {
          const allResolved = allPoints.every((p) => p.getBool('resolved') === true)
          let targetStatusName = allResolved ? 'Pronto p/ Revisão' : 'Ajuste/Pendência'

          if (allResolved) {
            const hasFiles = product.getStringSlice('files').length > 0
            const hasEngFiles = product.getStringSlice('engineering_files').length > 0
            if (!hasFiles || !hasEngFiles) {
              targetStatusName = 'Falta Docs'
            }
          }

          const status = $app.findFirstRecordByData('product_statuses', 'name', targetStatusName)
          if (product.getString('status') !== status.id) {
            product.set('status', status.id)
            $app.saveNoValidate(product)
          }
        }
      }
    } catch (_) {}
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

    try {
      if (original.getBool('resolved') !== e.record.getBool('resolved')) {
        const isResolved = e.record.getBool('resolved')
        const historyCol = $app.findCollectionByNameOrId('revision_history')
        const historyRec = new Record(historyCol)
        historyRec.set('revision_point_id', e.record.id)
        historyRec.set('user_id', userId)
        historyRec.set(
          'action',
          isResolved ? 'Status alterado para Resolvido' : 'Status alterado para Pendente',
        )
        $app.saveNoValidate(historyRec)

        if (isResolved) {
          const pointCreatorId = e.record.getString('user_id')
          if (pointCreatorId && userId && pointCreatorId !== userId) {
            const product = $app.findRecordById('products', e.record.getString('product_id'))
            const notifsCol = $app.findCollectionByNameOrId('notifications')
            const notif = new Record(notifsCol)
            notif.set('user_id', pointCreatorId)
            const authorName = e.auth
              ? e.auth.getString('name') || e.auth.getString('email')
              : 'Sistema'
            notif.set(
              'message',
              `O ponto de revisão no produto ${product.getString('name')} foi marcado como Resolvido por ${authorName}.`,
            )
            notif.set('action_url', `/catalogo/${product.id}?tab=revisao`)
            $app.saveNoValidate(notif)
          }
        }
      }

      const productId = e.record.getString('product_id')
      const product = $app.findRecordById('products', productId)
      let validadoId = null
      try {
        validadoId = $app.findFirstRecordByData('product_statuses', 'name', 'Validado').id
      } catch (_) {}

      if (product.getString('status') !== validadoId) {
        const allPoints = $app.findRecordsByFilter(
          'revision_points',
          `product_id = '${productId}'`,
          '',
          1000,
          0,
        )
        if (allPoints.length > 0) {
          const allResolved = allPoints.every((p) => p.getBool('resolved') === true)
          let targetStatusName = allResolved ? 'Pronto p/ Revisão' : 'Ajuste/Pendência'

          if (allResolved) {
            const hasFiles = product.getStringSlice('files').length > 0
            const hasEngFiles = product.getStringSlice('engineering_files').length > 0
            if (!hasFiles || !hasEngFiles) {
              targetStatusName = 'Falta Docs'
            }
          }

          const status = $app.findFirstRecordByData('product_statuses', 'name', targetStatusName)
          if (product.getString('status') !== status.id) {
            product.set('status', status.id)
            $app.saveNoValidate(product)
          }
        }
      }
    } catch (_) {}
  } catch (err) {
    $app.logger().error('Error logging revision point update', 'error', String(err))
  }
  e.next()
}, 'revision_points')
