migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('material_shortages')

    if (col.fields.getByName('order_id')) {
      col.fields.removeByName('order_id')
      col.fields.add(
        new RelationField({
          name: 'order_id',
          collectionId: app.findCollectionByNameOrId('pcp_orders').id,
          cascadeDelete: true,
          maxSelect: 1,
          required: false,
        }),
      )
    }

    if (col.fields.getByName('quantity')) {
      col.fields.removeByName('quantity')
      col.fields.add(new NumberField({ name: 'quantity', required: true, onlyInt: false }))
    }

    if (col.fields.getByName('unit_price')) {
      col.fields.removeByName('unit_price')
      col.fields.add(new NumberField({ name: 'unit_price', required: false, onlyInt: false }))
    }

    if (col.fields.getByName('received_quantity')) {
      col.fields.removeByName('received_quantity')
      col.fields.add(
        new NumberField({ name: 'received_quantity', required: false, onlyInt: false }),
      )
    }

    var dateFields = ['expected_date', 'purchase_date', 'quotation_date']
    dateFields.forEach(function (name) {
      if (col.fields.getByName(name)) {
        col.fields.removeByName(name)
        col.fields.add(new DateField({ name: name, required: false }))
      }
    })

    if (col.fields.getByName('supplier')) {
      col.fields.removeByName('supplier')
      col.fields.add(new TextField({ name: 'supplier', required: false }))
    }

    if (col.fields.getByName('status')) {
      col.fields.removeByName('status')
      col.fields.add(
        new SelectField({
          name: 'status',
          required: true,
          maxSelect: 1,
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
    }

    if (col.fields.getByName('priority')) {
      col.fields.removeByName('priority')
      col.fields.add(
        new SelectField({
          name: 'priority',
          required: false,
          maxSelect: 1,
          values: ['Sem pressa', 'Próximos dias', 'Urgente'],
        }),
      )
    }

    if (col.fields.getByName('request_type')) {
      col.fields.removeByName('request_type')
      col.fields.add(
        new SelectField({
          name: 'request_type',
          required: false,
          maxSelect: 1,
          values: ['Ferramentas', 'Materiais', 'Produtos', 'Insumos'],
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    // Down migration: constraints remain permissive — no revert needed
  },
)
