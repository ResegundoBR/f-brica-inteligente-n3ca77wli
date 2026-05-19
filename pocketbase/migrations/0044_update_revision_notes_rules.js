migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('revision_notes')
    // Ensure product owners and any authorized users can create notes
    col.createRule = "@request.auth.id != ''"
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('revision_notes')
    col.createRule = "@request.auth.id != ''"
    app.save(col)
  },
)
