migrate(
  (app) => {
    const rolesCol = app.findCollectionByNameOrId('roles')
    const statusesCol = app.findCollectionByNameOrId('product_statuses')

    const roles = [
      { name: 'admin', description: 'Administrador do sistema', active: true },
      { name: 'reviewer', description: 'Revisador técnico', active: true },
      { name: 'registrator', description: 'Registrador de dados', active: true },
    ]
    const roleMap = {}
    for (const r of roles) {
      const record = new Record(rolesCol)
      record.set('name', r.name)
      record.set('description', r.description)
      record.set('active', r.active)
      app.save(record)
      roleMap[r.name] = record.id
    }

    const statuses = [
      { name: 'rascunho', color: 'secondary', active: true },
      { name: 'revisao', color: 'default', active: true },
      { name: 'pendencia', color: 'destructive', active: true },
      { name: 'validado', color: 'outline', active: true },
    ]
    const statusMap = {}
    for (const s of statuses) {
      const record = new Record(statusesCol)
      record.set('name', s.name)
      record.set('color', s.color)
      record.set('active', s.active)
      app.save(record)
      statusMap[s.name] = record.id
    }

    const users = app.findRecordsByFilter('users', '1=1', '', 100, 0)
    for (const u of users) {
      u.set('role', roleMap['admin'])
      u.set('active', true)
      app.saveNoValidate(u)
    }

    const products = app.findRecordsByFilter('products', '1=1', '', 100, 0)
    for (const p of products) {
      p.set('status', statusMap['rascunho'])
      app.saveNoValidate(p)
    }
  },
  (app) => {
    // Revert operations
  },
)
