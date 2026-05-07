migrate(
  (app) => {
    const statuses = app.findRecordsByFilter('product_statuses', '1=1', '', 100, 0)
    for (const status of statuses) {
      const name = status.getString('name')
      if (name.toLowerCase() === 'iniciado') {
        status.set('color', 'bg-orange-500 hover:bg-orange-600 text-white')
        app.save(status)
      } else if (name.toLowerCase() === 'validado') {
        status.set('color', 'bg-green-500 hover:bg-green-600 text-white')
        app.save(status)
      }
    }
  },
  (app) => {
    // Irreversível por padrão, a menos que saibamos a cor exata antiga.
  },
)
