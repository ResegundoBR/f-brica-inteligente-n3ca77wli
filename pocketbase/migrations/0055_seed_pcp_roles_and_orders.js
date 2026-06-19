migrate(
  (app) => {
    const roles = app.findRecordsByFilter(
      'roles',
      'name ~ "Admin" || name ~ "admin" || name ~ "Administrador"',
      '',
      10,
      0,
    )
    for (const role of roles) {
      role.set('access_pcp', true)
      role.set('access_operator', true)
      role.set('access_commercial', true)
      app.save(role)
    }

    let adminId = ''
    try {
      adminId = app.findAuthRecordByEmail(
        '_pb_users_auth_',
        'reginaldo.segundo@planagroup.com.br',
      ).id
    } catch (_) {}

    let productId = ''
    try {
      productId = app.findFirstRecordByFilter('products', '1=1').id
    } catch (_) {}

    const ordersCol = app.findCollectionByNameOrId('pcp_orders')

    if (app.countRecords('pcp_orders') === 0) {
      const o1 = new Record(ordersCol)
      o1.set('order_number', 'OP-2026-001')
      o1.set('client_name', 'Acme Corp')
      if (productId) o1.set('product_id', productId)
      o1.set('is_special', false)
      o1.set('status', 'Em Andamento')
      o1.set('stage', 'Montagem')
      o1.set('bottleneck_reason', 'Nenhum')
      const d = new Date()
      d.setDate(d.getDate() + 5)
      o1.set('delivery_date', d.toISOString())
      if (adminId) o1.set('operator_id', adminId)
      app.save(o1)

      const o2 = new Record(ordersCol)
      o2.set('order_number', 'OP-2026-002')
      o2.set('client_name', 'Stark Ind')
      o2.set('is_special', true)
      o2.set('status', 'Fila')
      o2.set('stage', 'Corte')
      o2.set('bottleneck_reason', 'Falta de Material')
      const d2 = new Date()
      d2.setDate(d2.getDate() + 2)
      o2.set('delivery_date', d2.toISOString())
      app.save(o2)
    }
  },
  (app) => {
    try {
      const ordersCol = app.findCollectionByNameOrId('pcp_orders')
      app.truncateCollection(ordersCol)
    } catch (_) {}
  },
)
