migrate(
  (app) => {
    const statusesCol = app.findCollectionByNameOrId('product_statuses')

    const requiredStatuses = [
      { name: 'Falta Docs', color: '#FFEB3B' },
      { name: 'Pronto p/ Revisão', color: '#FF9800' },
      { name: 'Ajuste/Pendência', color: '#2196F3' },
      { name: 'Validado', color: '#4CAF50' },
    ]

    for (const st of requiredStatuses) {
      let existing
      try {
        existing = app.findFirstRecordByData('product_statuses', 'name', st.name)
      } catch (_) {
        if (st.name === 'Falta Docs') {
          try {
            existing = app.findFirstRecordByData('product_statuses', 'name', 'Iniciado')
          } catch (_) {}
        } else if (st.name === 'Pronto p/ Revisão') {
          try {
            existing = app.findFirstRecordByData('product_statuses', 'name', 'Revisão')
          } catch (_) {}
          if (!existing) {
            try {
              existing = app.findFirstRecordByData('product_statuses', 'name', 'Revisao')
            } catch (_) {}
          }
        } else if (st.name === 'Ajuste/Pendência') {
          try {
            existing = app.findFirstRecordByData('product_statuses', 'name', 'Pendência')
          } catch (_) {}
          if (!existing) {
            try {
              existing = app.findFirstRecordByData('product_statuses', 'name', 'Pendencia')
            } catch (_) {}
          }
        }
      }

      if (existing) {
        existing.set('name', st.name)
        existing.set('color', st.color)
        app.save(existing)
      } else {
        const record = new Record(statusesCol)
        record.set('name', st.name)
        record.set('color', st.color)
        record.set('active', true)
        app.save(record)
      }
    }

    try {
      const validado = app.findFirstRecordByData('product_statuses', 'name', 'Validado')
      validado.set('color', '#4CAF50')
      app.save(validado)
    } catch (_) {}
  },
  (app) => {
    // no-op
  },
)
