migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('material_shortages')

    col.fields.add(
      new SelectField({
        name: 'priority',
        values: ['Sem pressa', 'Próximos dias', 'Urgente'],
        required: false,
      }),
    )

    col.fields.add(
      new SelectField({
        name: 'request_type',
        values: ['Ferramentas', 'Materiais', 'Produtos', 'Insumos'],
        required: false,
      }),
    )

    const orderIdField = col.fields.getByName('order_id')
    if (orderIdField) {
      orderIdField.required = false
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('material_shortages')

    col.fields.removeByName('priority')
    col.fields.removeByName('request_type')

    const orderIdField = col.fields.getByName('order_id')
    if (orderIdField) {
      orderIdField.required = true
    }

    app.save(col)
  },
)
