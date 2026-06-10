migrate(
  (app) => {
    const products = app.findCollectionByNameOrId('products')
    const categories = app.findCollectionByNameOrId('composition_categories')

    products.fields.add(
      new RelationField({
        name: 'category',
        collectionId: categories.id,
        maxSelect: 1,
        cascadeDelete: false,
      }),
    )
    app.save(products)
  },
  (app) => {
    const products = app.findCollectionByNameOrId('products')
    products.fields.removeByName('category')
    app.save(products)
  },
)
