migrate(
  (app) => {
    app.db().newQuery('DELETE FROM activity_logs').execute()
  },
  (app) => {
    // Cannot restore deleted logs
  },
)
