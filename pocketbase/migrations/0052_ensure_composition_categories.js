migrate(
  (app) => {
    const categories = ['Tubos e Barras', 'Repuxo', 'Usinagem', 'Corte a Laser']
    const col = app.findCollectionByNameOrId('composition_categories')

    const existingRecords = app.findRecordsByFilter('composition_categories', '1=1', '', 1000, 0)
    const existingNames = existingRecords.map((r) => r.getString('name').toLowerCase())

    for (const name of categories) {
      if (!existingNames.includes(name.toLowerCase())) {
        const record = new Record(col)
        record.set('name', name)
        app.save(record)
      }
    }
  },
  (app) => {
    // Safe down migration: leave seeded categories as they might be in use
  },
)
