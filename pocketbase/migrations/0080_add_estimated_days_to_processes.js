migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('product_processes')
    if (!collection.fields.getByName('estimated_days')) {
      collection.fields.add(
        new NumberField({
          name: 'estimated_days',
          min: 0,
        }),
      )
    }
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('product_processes')
    collection.fields.removeByName('estimated_days')
    app.save(collection)
  },
)
