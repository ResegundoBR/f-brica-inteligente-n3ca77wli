migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('users')
    col.fields.add(new TextField({ name: 'access_start_time' }))
    col.fields.add(new TextField({ name: 'access_end_time' }))
    col.fields.add(new JSONField({ name: 'access_days' }))
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('users')
    col.fields.removeByName('access_start_time')
    col.fields.removeByName('access_end_time')
    col.fields.removeByName('access_days')
    app.save(col)
  },
)
