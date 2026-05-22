migrate(
  (app) => {
    const products = app.findRecordsByFilter('products', '1=1', '', 10000, 0)

    let ajusteStatusId = null
    let prontoStatusId = null
    let validadoStatusId = null

    try {
      ajusteStatusId = app.findFirstRecordByData('product_statuses', 'name', 'Ajuste/Pendência').id
    } catch (_) {}
    try {
      prontoStatusId = app.findFirstRecordByData('product_statuses', 'name', 'Pronto p/ Revisão').id
    } catch (_) {}
    try {
      validadoStatusId = app.findFirstRecordByData('product_statuses', 'name', 'Validado').id
    } catch (_) {}

    for (const product of products) {
      if (validadoStatusId && product.getString('status') === validadoStatusId) {
        continue
      }

      const points = app.findRecordsByFilter(
        'revision_points',
        `product_id = '${product.id}'`,
        '',
        1000,
        0,
      )
      if (points.length > 0) {
        const allResolved = points.every((p) => p.getBool('resolved') === true)
        const targetStatusId = allResolved ? prontoStatusId : ajusteStatusId

        if (targetStatusId && product.getString('status') !== targetStatusId) {
          product.set('status', targetStatusId)
          app.save(product)
        }
      }
    }
  },
  (app) => {
    // Irreversible since previous individual states are lost
  },
)
