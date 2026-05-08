migrate((app) => {
  const roles = ['Registrador', 'registrador']

  for (const roleName of roles) {
    try {
      const role = app.findFirstRecordByData('roles', 'name', roleName)
      role.set('access_dashboard', true)
      role.set('access_catalog', true)
      role.set('access_learning', false)
      role.set('access_users', false)
      app.save(role)
    } catch (_) {
      // Role not found, skip
    }
  }
})
