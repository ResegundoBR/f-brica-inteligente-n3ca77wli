migrate(
  (app) => {
    const statuses = app.findRecordsByFilter('product_statuses', '1=1', '', 100, 0)
    for (const status of statuses) {
      const name = status.getString('name').toLowerCase()
      if (name === 'iniciado') {
        status.set('color', 'warning')
        app.save(status)
      } else if (name === 'validado') {
        status.set('color', 'success')
        app.save(status)
      }
    }
  },
  (app) => {
    // Can't revert reliably without knowing previous state
  },
)
