migrate(
  (app) => {
    const pcpOrdersCol = app.findCollectionByNameOrId('pcp_orders')
    const invCol = app.findCollectionByNameOrId('inventory')
    const invMovCol = app.findCollectionByNameOrId('inventory_movements')

    const collection = new Collection({
      name: 'pcp_retroactive_withdrawals',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'order_id',
          type: 'relation',
          required: true,
          collectionId: pcpOrdersCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'order_number', type: 'text', required: true },
        { name: 'material_code', type: 'text', required: false },
        { name: 'material_description', type: 'text', required: true },
        { name: 'unit', type: 'text', required: false },
        { name: 'quantity', type: 'number', required: true },
        { name: 'reason', type: 'text', required: true },
        {
          name: 'requested_by',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['Pendente', 'Aprovada', 'Rejeitada'],
          maxSelect: 1,
        },
        {
          name: 'reviewed_by',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'reviewed_at', type: 'date', required: false },
        { name: 'review_note', type: 'text', required: false },
        {
          name: 'inventory_id',
          type: 'relation',
          required: false,
          collectionId: invCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'withdrawal_id',
          type: 'relation',
          required: false,
          collectionId: invMovCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_retro_withdrawals_status ON pcp_retroactive_withdrawals (status)',
        'CREATE INDEX idx_retro_withdrawals_order ON pcp_retroactive_withdrawals (order_id)',
        'CREATE INDEX idx_retro_withdrawals_requested_by ON pcp_retroactive_withdrawals (requested_by)',
        'CREATE INDEX idx_retro_withdrawals_created ON pcp_retroactive_withdrawals (created DESC)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('pcp_retroactive_withdrawals')
      app.delete(col)
    } catch (_) {}
  },
)
