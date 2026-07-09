migrate(
  (app) => {
    const collection = new Collection({
      name: 'inventory',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'code', type: 'text', required: true },
        { name: 'description', type: 'text', required: true },
        { name: 'quantity', type: 'number', required: true },
        { name: 'min_quantity', type: 'number', required: false },
        { name: 'unit', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_inventory_code ON inventory (code COLLATE NOCASE)'],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('inventory')
      app.delete(collection)
    } catch (_) {}
  },
)
