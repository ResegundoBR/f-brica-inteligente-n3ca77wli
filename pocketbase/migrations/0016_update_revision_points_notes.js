migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('revision_points')
    col.fields.add(new TextField({ name: 'notes' }))
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('revision_points')
    col.fields.removeByName('notes')
    app.save(col)
  },
)
