migrate(
  (app) => {
    app
      .db()
      .newQuery(`
    DELETE FROM learning_evolution 
    WHERE title LIKE '%teste%' 
       OR description LIKE '%teste%'
  `)
      .execute()
  },
  (app) => {
    // down: nothing to do since we deleted test data
  },
)
