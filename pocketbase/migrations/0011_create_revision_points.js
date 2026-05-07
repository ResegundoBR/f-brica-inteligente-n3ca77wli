migrate(
  (app) => {
    const productsCol = app.findCollectionByNameOrId('products')

    const collection = new Collection({
      name: 'revision_points',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && user_id = @request.auth.id",
      deleteRule: "@request.auth.id != '' && user_id = @request.auth.id",
      fields: [
        {
          name: 'product_id',
          type: 'relation',
          required: true,
          collectionId: productsCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'user_id',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'description', type: 'text', required: true },
        { name: 'files', type: 'file', required: false, maxSelect: 10, maxSize: 52428800 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('revision_points')
    app.delete(collection)
  },
)
