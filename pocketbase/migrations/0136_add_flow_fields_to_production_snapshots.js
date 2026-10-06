migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_production_snapshots')

    if (!col.fields.getByName('entered_units')) {
      col.fields.add(
        new NumberField({
          name: 'entered_units',
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('exited_units')) {
      col.fields.add(
        new NumberField({
          name: 'exited_units',
          required: false,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('pcp_production_snapshots')
      col.fields.removeByName('entered_units')
      col.fields.removeByName('exited_units')
      app.save(col)
    } catch (_) {}
  },
)
