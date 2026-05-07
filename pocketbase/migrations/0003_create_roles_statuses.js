migrate(
  (app) => {
    const roles = new Collection({
      name: 'roles',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'description', type: 'text' },
        { name: 'active', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(roles)

    const statuses = new Collection({
      name: 'product_statuses',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'color', type: 'text' },
        { name: 'active', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(statuses)

    const users = app.findCollectionByNameOrId('users')
    users.fields.removeByName('role')
    users.fields.add(new RelationField({ name: 'role', collectionId: roles.id, maxSelect: 1 }))
    users.fields.add(new BoolField({ name: 'active' }))
    app.save(users)

    const products = app.findCollectionByNameOrId('products')
    products.fields.removeByName('status')
    products.fields.add(
      new RelationField({ name: 'status', collectionId: statuses.id, maxSelect: 1 }),
    )
    products.createRule = "@request.auth.id != ''"
    products.deleteRule = "@request.auth.id != ''"
    app.save(products)
  },
  (app) => {
    // Revert operations
  },
)
