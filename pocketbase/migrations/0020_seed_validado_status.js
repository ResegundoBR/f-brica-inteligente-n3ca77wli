migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('product_statuses')
    try {
      app.findFirstRecordByData('product_statuses', 'name', 'Validado')
    } catch (_) {
      const record = new Record(collection)
      record.set('name', 'Validado')
      record.set('color', 'success')
      record.set('active', true)
      app.save(record)
    }
  },
  (app) => {
    try {
      const record = app.findFirstRecordByData('product_statuses', 'name', 'Validado')
      app.delete(record)
    } catch (_) {}
  },
)
