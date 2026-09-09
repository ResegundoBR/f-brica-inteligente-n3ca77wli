migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    if (!col.fields.getByName('promised_date')) {
      col.fields.add(new DateField({ name: 'promised_date', required: false }))
    }

    if (!col.fields.getByName('promised_note')) {
      col.fields.add(new TextField({ name: 'promised_note', required: false }))
    }

    if (!col.fields.getByName('promised_by')) {
      col.fields.add(
        new RelationField({
          name: 'promised_by',
          required: false,
          collectionId: usersCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }

    if (!col.fields.getByName('promised_at')) {
      col.fields.add(new DateField({ name: 'promised_at', required: false }))
    }

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('pcp_orders')
      try {
        col.fields.removeByName('promised_date')
      } catch (_) {}
      try {
        col.fields.removeByName('promised_note')
      } catch (_) {}
      try {
        col.fields.removeByName('promised_by')
      } catch (_) {}
      try {
        col.fields.removeByName('promised_at')
      } catch (_) {}
      app.save(col)
    } catch (_) {}
  },
)
