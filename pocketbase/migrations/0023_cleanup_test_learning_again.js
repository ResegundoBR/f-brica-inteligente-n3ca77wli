migrate(
  (app) => {
    app.db().newQuery('DELETE FROM learning_evolution').execute()
  },
  (app) => {
    // Irreversible
  },
)
