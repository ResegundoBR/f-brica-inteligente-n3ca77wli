migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('products')
    collection.fields.add(
      new FileField({
        name: 'engineering_files',
        maxSelect: 99,
        maxSize: 52428800,
      }),
    )
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('products')
    collection.fields.removeByName('engineering_files')
    app.save(collection)
  },
)
