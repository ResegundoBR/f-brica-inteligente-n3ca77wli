migrate(
  (app) => {
    const roles = app.findCollectionByNameOrId('roles')
    let registrador

    try {
      registrador = app.findFirstRecordByData('roles', 'name', 'Registrador')
    } catch (_) {
      registrador = new Record(roles)
      registrador.set('name', 'Registrador')
    }

    registrador.set('active', true)
    registrador.set('access_dashboard', true)
    registrador.set('access_catalog', true)
    registrador.set('access_learning', false)
    registrador.set('access_users', false)

    app.save(registrador)

    // Find user "Richard" or create one if doesn't exist to validate his profile
    const users = app.findCollectionByNameOrId('users')
    let richard
    try {
      richard = app.findFirstRecordByFilter('users', "name ~ 'Richard' || name ~ 'richard'")
      richard.set('role', registrador.id)
      app.save(richard)
    } catch (_) {
      try {
        richard = new Record(users)
        richard.setEmail('richard@example.com')
        richard.setPassword('Skip@Pass')
        richard.setVerified(true)
        richard.set('name', 'Richard')
        richard.set('role', registrador.id)
        richard.set('active', true)
        app.save(richard)
      } catch (e) {
        console.log('Failed to create Richard user: ', e)
      }
    }
  },
  (app) => {
    // Revert is optional, we leave the role intact to prevent breaking changes on rollback.
  },
)
