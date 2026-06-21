migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')
    col.fields.add(
      new TextField({
        name: 'op_number',
        required: false,
      }),
    )
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')
    col.fields.removeByName('op_number')
    app.save(col)
  },
)
