migrate(
  (app) => {
    try {
      let prontoRevStatus
      try {
        prontoRevStatus = app.findFirstRecordByData('product_statuses', 'name', 'Pronto p/ Revisão')
      } catch (_) {
        return // No records can be in this status if it doesn't exist
      }

      let faltaDocsStatus
      try {
        faltaDocsStatus = app.findFirstRecordByData('product_statuses', 'name', 'Falta Docs')
      } catch (_) {
        return
      }

      const products = app.findRecordsByFilter(
        'products',
        `status = '${prontoRevStatus.id}'`,
        '',
        1000,
        0,
      )

      for (const p of products) {
        const files = p.getStringSlice('files')
        const engFiles = p.getStringSlice('engineering_files')

        if (files.length === 0 || engFiles.length === 0) {
          p.set('status', faltaDocsStatus.id)
          app.saveNoValidate(p)
        }
      }
    } catch (err) {
      console.log('Error in 0048: ', err)
    }
  },
  (app) => {},
)
