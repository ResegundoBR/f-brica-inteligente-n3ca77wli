migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('learning_evolution')
    col.deleteRule =
      "@request.auth.id != '' && (user_id = @request.auth.id || @request.auth.role.name = 'admin' || @request.auth.role.name = 'Administrador')"
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('learning_evolution')
    col.deleteRule = "@request.auth.id != '' && user_id = @request.auth.id"
    app.save(col)
  },
)
