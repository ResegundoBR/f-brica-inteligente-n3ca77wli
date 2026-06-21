migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_order_observations')
    if (!col.fields.getByName('created')) {
      col.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    }
    if (!col.fields.getByName('updated')) {
      col.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_order_observations')
    col.fields.removeByName('created')
    col.fields.removeByName('updated')
    app.save(col)
  },
)
