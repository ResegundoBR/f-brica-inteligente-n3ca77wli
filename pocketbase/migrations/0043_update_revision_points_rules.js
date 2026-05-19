migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('revision_points')
    col.updateRule =
      "@request.auth.id != '' && (user_id = @request.auth.id || product_id.owner = @request.auth.id || @request.auth.role.name = 'admin' || @request.auth.role.name = 'Administrador' || @request.auth.role.name = 'revisador' || @request.auth.role.name = 'Revisador')"
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('revision_points')
    col.updateRule = "@request.auth.id != '' && user_id = @request.auth.id"
    app.save(col)
  },
)
