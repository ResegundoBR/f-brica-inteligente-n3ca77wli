migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('roles')
    col.fields.add(new BoolField({ name: 'access_dashboard' }))
    col.fields.add(new BoolField({ name: 'access_catalog' }))
    col.fields.add(new BoolField({ name: 'access_learning' }))
    col.fields.add(new BoolField({ name: 'access_users' }))
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('roles')
    col.fields.removeByName('access_dashboard')
    col.fields.removeByName('access_catalog')
    col.fields.removeByName('access_learning')
    col.fields.removeByName('access_users')
    app.save(col)
  },
)
