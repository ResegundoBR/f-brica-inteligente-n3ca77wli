migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('product_statuses')

    try {
      const iniciado = app.findFirstRecordByData('product_statuses', 'name', 'Iniciado')
      iniciado.set('color', 'bg-orange-500')
      app.save(iniciado)
    } catch (_) {}

    try {
      const validado = app.findFirstRecordByData('product_statuses', 'name', 'Validado')
      validado.set('color', 'bg-green-500')
      app.save(validado)
    } catch (_) {}
  },
  (app) => {},
)
