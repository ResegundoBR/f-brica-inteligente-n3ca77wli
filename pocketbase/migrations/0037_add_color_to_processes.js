migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('product_processes')
    if (!col.fields.getByName('color')) {
      col.fields.add(new TextField({ name: 'color' }))
    }
    app.save(col)

    try {
      const records = app.findRecordsByFilter('product_processes', '1=1', '', 10000, 0)
      const colors = {
        corte: '#22c55e',
        desbaste: '#facc15',
        dobra: '#3b82f6',
        calandra: '#a855f7',
        solda: '#f97316',
        'acabamento solda': '#fb923c',
        furo: '#ec4899',
        rosca: '#06b6d4',
      }
      for (const record of records) {
        const name = record.getString('name').toLowerCase()
        record.set('color', colors[name] || '#94a3b8')
        app.save(record)
      }
    } catch (e) {
      console.log('No records to update or error during update', e)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('product_processes')
    if (col.fields.getByName('color')) {
      col.fields.removeByName('color')
    }
    app.save(col)
  },
)
