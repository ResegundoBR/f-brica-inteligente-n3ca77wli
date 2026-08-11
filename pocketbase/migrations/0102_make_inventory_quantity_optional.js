migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('inventory')
    const field = col.fields.getByName('quantity')
    if (field) {
      field.required = false
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('inventory')
    const field = col.fields.getByName('quantity')
    if (field) {
      field.required = true
    }
    app.save(col)
  },
)
