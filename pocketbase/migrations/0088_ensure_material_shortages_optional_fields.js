migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('material_shortages')

    var dateFieldNames = ['expected_date', 'purchase_date', 'quotation_date']
    dateFieldNames.forEach(function (name) {
      if (col.fields.getByName(name)) {
        col.fields.removeByName(name)
        col.fields.add(new DateField({ name: name, required: false }))
      }
    })

    if (col.fields.getByName('unit_price')) {
      col.fields.removeByName('unit_price')
      col.fields.add(new NumberField({ name: 'unit_price', required: false }))
    }

    if (col.fields.getByName('received_quantity')) {
      col.fields.removeByName('received_quantity')
      col.fields.add(new NumberField({ name: 'received_quantity', required: false }))
    }

    if (col.fields.getByName('supplier')) {
      col.fields.removeByName('supplier')
      col.fields.add(new TextField({ name: 'supplier', required: false }))
    }

    app.save(col)
  },
  (app) => {
    // Down migration: leaving fields optional is safe — no revert needed
  },
)
