migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('product_statuses')

    const mappings = [
      { oldNames: ['iniciado', 'rascunho'], newName: 'Falta docs', color: '#FFEB3B' },
      {
        oldNames: ['revisão', 'revisao', 'em revisão'],
        newName: 'Pronto p/ Revisão',
        color: '#FF9800',
      },
      {
        oldNames: ['pendência', 'pendencia', 'com pendência'],
        newName: 'Ajuste/Pendência',
        color: '#2196F3',
      },
      { oldNames: ['validado'], newName: 'Validado', color: '#4CAF50' },
    ]

    const records = app.findRecordsByFilter('product_statuses', '1=1', '', 100, 0)

    for (const mapping of mappings) {
      let found = false

      // First, look for a record that already has the new name
      for (const record of records) {
        if (record.getString('name').toLowerCase() === mapping.newName.toLowerCase()) {
          record.set('name', mapping.newName)
          record.set('color', mapping.color)
          app.save(record)
          found = true
          break
        }
      }

      // If not found by new name, try to find by old name
      if (!found) {
        for (const record of records) {
          if (mapping.oldNames.includes(record.getString('name').toLowerCase())) {
            record.set('name', mapping.newName)
            record.set('color', mapping.color)
            app.save(record)
            found = true
            break
          }
        }
      }

      // If still not found, create it
      if (!found) {
        const newRecord = new Record(col)
        newRecord.set('name', mapping.newName)
        newRecord.set('color', mapping.color)
        newRecord.set('active', true)
        app.save(newRecord)
      }
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('product_statuses')
    const mappings = [
      { newName: 'Falta docs', oldName: 'Iniciado', color: '#F97316' },
      { newName: 'Pronto p/ Revisão', oldName: 'Revisão', color: '#3B82F6' },
      { newName: 'Ajuste/Pendência', oldName: 'Pendência', color: '#EF4444' },
      { newName: 'Validado', oldName: 'Validado', color: '#22C55E' },
    ]
    const records = app.findRecordsByFilter('product_statuses', '1=1', '', 100, 0)

    for (const mapping of mappings) {
      for (const record of records) {
        if (record.getString('name') === mapping.newName) {
          record.set('name', mapping.oldName)
          record.set('color', mapping.color)
          app.save(record)
        }
      }
    }
  },
)
