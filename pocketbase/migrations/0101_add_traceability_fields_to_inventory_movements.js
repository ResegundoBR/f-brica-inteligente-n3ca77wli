migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('inventory_movements')

    if (!col.fields.getByName('purchase_date')) {
      col.fields.add(new DateField({ name: 'purchase_date', required: false }))
    }
    if (!col.fields.getByName('arrival_date')) {
      col.fields.add(new DateField({ name: 'arrival_date', required: false }))
    }
    if (!col.fields.getByName('unit_price')) {
      col.fields.add(new NumberField({ name: 'unit_price', required: false }))
    }
    if (!col.fields.getByName('total_value')) {
      col.fields.add(new NumberField({ name: 'total_value', required: false }))
    }
    if (!col.fields.getByName('freight')) {
      col.fields.add(new NumberField({ name: 'freight', required: false }))
    }
    if (!col.fields.getByName('exit_date')) {
      col.fields.add(new DateField({ name: 'exit_date', required: false }))
    }
    if (!col.fields.getByName('balance_after')) {
      col.fields.add(new NumberField({ name: 'balance_after', required: false }))
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('inventory_movements')
    try {
      col.fields.removeByName('purchase_date')
    } catch (_) {}
    try {
      col.fields.removeByName('arrival_date')
    } catch (_) {}
    try {
      col.fields.removeByName('unit_price')
    } catch (_) {}
    try {
      col.fields.removeByName('total_value')
    } catch (_) {}
    try {
      col.fields.removeByName('freight')
    } catch (_) {}
    try {
      col.fields.removeByName('exit_date')
    } catch (_) {}
    try {
      col.fields.removeByName('balance_after')
    } catch (_) {}
    app.save(col)
  },
)
