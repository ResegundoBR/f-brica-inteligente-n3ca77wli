migrate(
  (app) => {
    const collection = new Collection({
      name: 'pcp_order_logs',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'order_id',
          type: 'relation',
          required: true,
          collectionId: app.findCollectionByNameOrId('pcp_orders').id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'user_id',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'stage', type: 'text' },
        { name: 'action', type: 'text' },
        { name: 'details', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_pcp_order_logs_order ON pcp_order_logs (order_id)'],
    })
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('pcp_order_logs')
    app.delete(collection)
  },
)
