migrate(
  (app) => {
    const roles = app.findCollectionByNameOrId('roles')
    if (!roles.fields.getByName('access_catalog_consultation')) {
      roles.fields.add(new BoolField({ name: 'access_catalog_consultation' }))
    }
    app.save(roles)

    try {
      const existing = app.findFirstRecordByData('product_statuses', 'name', 'Ajuste/Pendência')
      if (existing.getString('color') !== 'purple') {
        existing.set('color', 'purple')
        app.save(existing)
      }
    } catch (_) {
      const statuses = app.findCollectionByNameOrId('product_statuses')
      const record = new Record(statuses)
      record.set('name', 'Ajuste/Pendência')
      record.set('color', 'purple')
      record.set('active', true)
      app.save(record)
    }

    const allRoles = app.findRecordsByFilter('roles', '1=1', '', 1000, 0)
    for (const role of allRoles) {
      if (role.getBool('access_operator') || role.getBool('access_produto_processos')) {
        if (!role.getBool('access_catalog_consultation')) {
          role.set('access_catalog_consultation', true)
          app.save(role)
        }
      }
    }
  },
  (app) => {
    const roles = app.findCollectionByNameOrId('roles')
    if (roles.fields.getByName('access_catalog_consultation')) {
      roles.fields.removeByName('access_catalog_consultation')
    }
    app.save(roles)
  },
)
