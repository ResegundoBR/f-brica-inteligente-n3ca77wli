migrate(
  (app) => {
    try {
      app.findFirstRecordByData('product_statuses', 'name', 'Validado')
    } catch (_) {
      const col = app.findCollectionByNameOrId('product_statuses')
      const record = new Record(col)
      record.set('name', 'Validado')
      record.set('color', 'bg-emerald-600')
      record.set('active', true)
      app.save(record)
    }
  },
  (app) => {
    // Irreversible
  },
)
