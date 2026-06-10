migrate(
  (app) => {
    const categories = ['Tubos e Barras', 'Repuxo', 'Usinagem', 'Corte a Laser']
    const col = app.findCollectionByNameOrId('composition_categories')

    for (const name of categories) {
      try {
        app.findFirstRecordByData('composition_categories', 'name', name)
      } catch (_) {
        const record = new Record(col)
        record.set('name', name)
        app.save(record)
      }
    }
  },
  (app) => {
    const categories = ['Tubos e Barras', 'Repuxo', 'Usinagem', 'Corte a Laser']
    for (const name of categories) {
      try {
        const record = app.findFirstRecordByData('composition_categories', 'name', name)
        app.delete(record)
      } catch (_) {}
    }
  },
)
