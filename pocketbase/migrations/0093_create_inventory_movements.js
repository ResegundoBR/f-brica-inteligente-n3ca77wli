migrate(
  (app) => {
    const collection = new Collection({
      name: 'inventory_movements',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'inventory_id',
          type: 'relation',
          required: true,
          collectionId: app.findCollectionByNameOrId('inventory').id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'user_id',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'quantity', type: 'number', required: true },
        {
          name: 'type',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['Entrada', 'Saída'],
        },
        { name: 'reason', type: 'text', required: false },
        {
          name: 'order_id',
          type: 'relation',
          required: false,
          collectionId: app.findCollectionByNameOrId('pcp_orders').id,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_inventory_movements_inventory_id ON inventory_movements (inventory_id)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('inventory_movements')
      app.delete(collection)
    } catch (_) {}
  },
)
