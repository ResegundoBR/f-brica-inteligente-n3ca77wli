migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const adminRule =
      "id = @request.auth.id || @request.auth.role.access_users = true || @request.auth.role.name = 'admin' || @request.auth.role.name = 'Administrador'"

    users.listRule = adminRule
    users.viewRule = adminRule
    users.updateRule = adminRule
    users.deleteRule = adminRule

    app.save(users)

    try {
      const iniciado = app.findFirstRecordByData('product_statuses', 'name', 'Iniciado')
      iniciado.set('color', 'warning')
      app.save(iniciado)
    } catch (_) {}

    try {
      const validado = app.findFirstRecordByData('product_statuses', 'name', 'Validado')
      validado.set('color', 'success')
      app.save(validado)
    } catch (_) {}
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.listRule = 'id = @request.auth.id'
    users.viewRule = 'id = @request.auth.id'
    users.updateRule = 'id = @request.auth.id'
    users.deleteRule = 'id = @request.auth.id'
    app.save(users)

    try {
      const iniciado = app.findFirstRecordByData('product_statuses', 'name', 'Iniciado')
      iniciado.set('color', 'default')
      app.save(iniciado)
    } catch (_) {}

    try {
      const validado = app.findFirstRecordByData('product_statuses', 'name', 'Validado')
      validado.set('color', 'default')
      app.save(validado)
    } catch (_) {}
  },
)
