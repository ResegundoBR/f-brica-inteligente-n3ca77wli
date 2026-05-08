migrate(
  (app) => {
    try {
      const records = app.findRecordsByFilter(
        'learning_evolution',
        "title = 'MOlde Concreto Pend Especial'",
        '',
        100,
        0,
      )
      for (const r of records) {
        app.delete(r)
      }
    } catch (_) {
      // collection might not exist or be empty
    }
  },
  (app) => {
    // down migration intentionally empty as we do not restore the test data
  },
)
