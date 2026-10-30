migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_order_materials')
    if (!col.fields.getByName('category')) {
      col.fields.add(new TextField({ name: 'category', required: false }))
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('pcp_order_materials')
      const field = col.fields.getByName('category')
      if (field) {
        col.fields.removeByName('category')
        app.save(col)
      }
    } catch (_) {}
  },
)
