migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('ordens_de_compra')

    if (!col.fields.getByName('payment_terms')) {
      col.fields.add(new TextField({ name: 'payment_terms', required: false }))
    }

    if (!col.fields.getByName('delivery_type')) {
      col.fields.add(
        new SelectField({
          name: 'delivery_type',
          required: false,
          values: ['Entrega', 'Retira'],
          maxSelect: 1,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('ordens_de_compra')
      try {
        col.fields.removeByName('payment_terms')
      } catch (_) {}
      try {
        col.fields.removeByName('delivery_type')
      } catch (_) {}
      app.save(col)
    } catch (_) {}
  },
)
