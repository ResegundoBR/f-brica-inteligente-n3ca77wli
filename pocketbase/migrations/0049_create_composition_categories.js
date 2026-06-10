migrate(
  (app) => {
    const collection = new Collection({
      name: 'composition_categories',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.role.name = 'admin' || @request.auth.role.name = 'Administrador'",
      deleteRule: "@request.auth.role.name = 'admin' || @request.auth.role.name = 'Administrador'",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_composition_categories_name ON composition_categories (name COLLATE NOCASE)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('composition_categories')
    app.delete(collection)
  },
)
