migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('learning_evolution')

    if (!col.fields.getByName('validated')) {
      col.fields.add(new BoolField({ name: 'validated' }))
    }

    col.updateRule =
      "@request.auth.id != '' && (user_id = @request.auth.id || @request.auth.role.name = 'admin' || @request.auth.role.name = 'Administrador' || @request.auth.role.name = 'revisador' || @request.auth.role.name = 'Revisador')"

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('learning_evolution')

    if (col.fields.getByName('validated')) {
      col.fields.removeByName('validated')
    }

    col.updateRule = "@request.auth.id != '' && user_id = @request.auth.id"
    app.save(col)
  },
)
