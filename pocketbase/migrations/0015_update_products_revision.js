migrate(
  (app) => {
    const products = app.findCollectionByNameOrId('products')

    products.fields.add(
      new TextField({
        name: 'code',
        required: false,
      }),
    )

    products.fields.add(
      new FileField({
        name: 'composition_files',
        maxSelect: 10,
        maxSize: 52428800,
        mimeTypes: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
      }),
    )

    app.save(products)

    // Set default code for existing products based on ID
    app.db().newQuery("UPDATE products SET code = id WHERE code = '' OR code IS NULL").execute()

    // Make field required after populating
    const pUpdated = app.findCollectionByNameOrId('products')
    const codeField = pUpdated.fields.getByName('code')
    if (codeField) {
      codeField.required = true
      app.save(pUpdated)
    }

    const revisions = app.findCollectionByNameOrId('revision_points')
    revisions.fields.add(
      new BoolField({
        name: 'resolved',
      }),
    )

    app.save(revisions)
  },
  (app) => {
    const products = app.findCollectionByNameOrId('products')
    products.fields.removeByName('code')
    products.fields.removeByName('composition_files')
    app.save(products)

    const revisions = app.findCollectionByNameOrId('revision_points')
    revisions.fields.removeByName('resolved')
    app.save(revisions)
  },
)
