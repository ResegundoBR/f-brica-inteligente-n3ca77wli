migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('product_processes')
    const field = col.fields.getByName('image')
    if (field) {
      field.maxSelect = 10
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('product_processes')
    const field = col.fields.getByName('image')
    if (field) {
      field.maxSelect = 1
      app.save(col)
    }
  },
)
