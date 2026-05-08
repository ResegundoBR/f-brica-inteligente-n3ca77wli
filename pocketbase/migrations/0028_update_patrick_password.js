migrate(
  (app) => {
    try {
      const record = app.findFirstRecordByData('users', 'name', 'Patrick')
      record.setPassword('Jc45#iKl')
      app.save(record)
    } catch (_) {
      // record not found, skip safely
    }
  },
  (app) => {
    // down migration cannot safely revert to unknown previous password
  },
)
