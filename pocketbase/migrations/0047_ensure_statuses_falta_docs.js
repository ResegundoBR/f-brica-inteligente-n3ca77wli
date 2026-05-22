migrate(
  (app) => {
    const statuses = app.findCollectionByNameOrId('product_statuses')

    // Ensure "Falta Docs" exists
    try {
      app.findFirstRecordByData('product_statuses', 'name', 'Falta Docs')
    } catch (_) {
      const r = new Record(statuses)
      r.set('name', 'Falta Docs')
      r.set('color', '#FFEB3B')
      r.set('active', true)
      app.save(r)
    }

    // Ensure "Pronto p/ Revisão" exists
    try {
      app.findFirstRecordByData('product_statuses', 'name', 'Pronto p/ Revisão')
    } catch (_) {
      const r = new Record(statuses)
      r.set('name', 'Pronto p/ Revisão')
      r.set('color', '#FF9800')
      r.set('active', true)
      app.save(r)
    }
  },
  (app) => {},
)
