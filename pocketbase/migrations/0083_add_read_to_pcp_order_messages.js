migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_order_messages')

    if (!col.fields.getByName('read')) {
      col.fields.add(new BoolField({ name: 'read' }))
    }

    col.updateRule = "@request.auth.id != ''"
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_order_messages')
    const field = col.fields.getByName('read')
    if (field) col.fields.remove(field)
    col.updateRule = null
    app.save(col)
  },
)
