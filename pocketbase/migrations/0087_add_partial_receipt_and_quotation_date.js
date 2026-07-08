migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('material_shortages')

    if (!col.fields.getByName('received_quantity')) {
      col.fields.add(
        new NumberField({
          name: 'received_quantity',
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('quotation_date')) {
      col.fields.add(
        new DateField({
          name: 'quotation_date',
          required: false,
        }),
      )
    }

    col.fields.removeByName('status')
    col.fields.add(
      new SelectField({
        name: 'status',
        required: true,
        values: [
          'Pendente',
          'Liberado_Estoque',
          'Cotação',
          'Compra',
          'Recebido',
          'Recebido_Parcial',
          'Cancelado',
        ],
      }),
    )

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('material_shortages')

    col.fields.removeByName('received_quantity')
    col.fields.removeByName('quotation_date')

    col.fields.removeByName('status')
    col.fields.add(
      new SelectField({
        name: 'status',
        required: true,
        values: ['Pendente', 'Liberado_Estoque', 'Cotação', 'Compra', 'Recebido', 'Cancelado'],
      }),
    )

    app.save(col)
  },
)
