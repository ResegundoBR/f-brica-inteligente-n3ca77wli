migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')

    if (!col.fields.getByName('manual_sequence')) {
      col.fields.add(
        new NumberField({
          name: 'manual_sequence',
          required: false,
          onlyInt: true,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('pcp_orders')
      try {
        col.fields.removeByName('manual_sequence')
      } catch (_) {}
      app.save(col)
    } catch (_) {}
  },
)
