migrate((app) => {
  // Update products.files to support multiple files
  try {
    const productsCol = app.findCollectionByNameOrId('products')
    const pField = productsCol.fields.getByName('files')
    if (pField) {
      pField.maxSelect = 99
      app.save(productsCol)
    }
  } catch (_) {}

  // Update revision_points.files to support multiple files
  try {
    const revCol = app.findCollectionByNameOrId('revision_points')
    const rField = revCol.fields.getByName('files')
    if (rField) {
      rField.maxSelect = 99
      app.save(revCol)
    }
  } catch (_) {}
})
