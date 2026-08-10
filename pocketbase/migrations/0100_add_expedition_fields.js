migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')

    if (!col.fields.getByName('nf')) {
      col.fields.add(new TextField({ name: 'nf', required: false }))
    }

    if (!col.fields.getByName('transportadora')) {
      col.fields.add(new TextField({ name: 'transportadora', required: false }))
    }

    if (!col.fields.getByName('data_saida')) {
      col.fields.add(new DateField({ name: 'data_saida', required: false }))
    }

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('pcp_orders')
      try {
        col.fields.removeByName('nf')
      } catch (_) {}
      try {
        col.fields.removeByName('transportadora')
      } catch (_) {}
      try {
        col.fields.removeByName('data_saida')
      } catch (_) {}
      app.save(col)
    } catch (_) {}
  },
)
