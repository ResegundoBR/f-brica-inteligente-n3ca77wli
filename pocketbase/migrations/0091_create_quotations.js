migrate(
  (app) => {
    const collection = new Collection({
      name: 'quotations',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'material_shortage_id',
          type: 'relation',
          required: true,
          collectionId: app.findCollectionByNameOrId('material_shortages').id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'supplier', type: 'text', required: true },
        { name: 'price', type: 'number', required: true },
        { name: 'delivery_days', type: 'number', required: false },
        { name: 'selected', type: 'bool', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_quotations_material_shortage_id ON quotations (material_shortage_id)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('quotations')
      app.delete(collection)
    } catch (_) {}
  },
)
