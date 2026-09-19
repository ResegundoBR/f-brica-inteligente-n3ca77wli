migrate(
  (app) => {
    const collection = new Collection({
      name: 'material_separations',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'title', type: 'text' },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['Pendente', 'Em_Separacao', 'Concluida', 'Cancelada'],
          maxSelect: 1,
        },
        { name: 'date', type: 'date' },
        { name: 'op_numbers', type: 'json' },
        { name: 'order_ids', type: 'json' },
        { name: 'items', type: 'json' },
        { name: 'separated_items', type: 'json' },
        { name: 'shortage_items', type: 'json' },
        { name: 'separated_count', type: 'number' },
        { name: 'shortage_count', type: 'number' },
        { name: 'total_items_count', type: 'number' },
        { name: 'created_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'finished_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'finished_at', type: 'date' },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_material_separations_status ON material_separations (status)',
        'CREATE INDEX idx_material_separations_created ON material_separations (created DESC)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('material_separations')
      app.delete(col)
    } catch (_) {}
  },
)
