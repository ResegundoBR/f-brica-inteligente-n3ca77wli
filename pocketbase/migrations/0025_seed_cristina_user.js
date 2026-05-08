migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'cristina.milani@planagroup.com.br')
      return // already seeded
    } catch (_) {}

    const record = new Record(users)
    record.setEmail('cristina.milani@planagroup.com.br')
    record.setPassword('Skip@Pass')
    record.setVerified(true)
    record.set('name', 'Cristina Milani')
    record.set('must_change_password', true)
    record.set('active', true)

    try {
      const roles = app.findRecordsByFilter(
        'roles',
        "name = 'Administrador' || name = 'admin'",
        '',
        1,
        0,
      )
      if (roles && roles.length > 0) {
        record.set('role', roles[0].id)
      }
    } catch (_) {}

    app.save(record)
  },
  (app) => {
    try {
      const record = app.findAuthRecordByEmail(
        '_pb_users_auth_',
        'cristina.milani@planagroup.com.br',
      )
      app.delete(record)
    } catch (_) {}
  },
)
