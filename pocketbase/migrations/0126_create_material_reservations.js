migrate(
  (app) => {
    const invCol = app.findCollectionByNameOrId('inventory')
    const sepCol = app.findCollectionByNameOrId('material_separations')

    const collection = new Collection({
      name: 'material_reservations',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'inventory_id',
          type: 'relation',
          required: false,
          collectionId: invCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'separation_id',
          type: 'relation',
          required: true,
          collectionId: sepCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'item_id', type: 'text', required: true },
        { name: 'code', type: 'text' },
        { name: 'description', type: 'text' },
        { name: 'quantity', type: 'number', required: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['Ativa', 'Baixada', 'Liberada'],
          maxSelect: 1,
        },
        { name: 'created_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_material_reservations_status ON material_reservations (status)',
        'CREATE INDEX idx_material_reservations_separation ON material_reservations (separation_id)',
        'CREATE INDEX idx_material_reservations_code ON material_reservations (code)',
        'CREATE INDEX idx_material_reservations_item ON material_reservations (separation_id, item_id)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('material_reservations')
      app.delete(col)
    } catch (_) {}
  },
)
