migrate(
  (app) => {
    const pcpOrdersCol = app.findCollectionByNameOrId('pcp_orders')
    const collection = new Collection({
      name: 'pcp_order_materials',
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
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'sector',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['FABRICAÇÃO', 'PREPARAÇÃO', 'MONTAGEM', 'EXPEDIÇÃO'],
        },
        { name: 'code', type: 'text', required: false },
        { name: 'description', type: 'text', required: true },
        { name: 'quantity', type: 'number', required: true },
        { name: 'unit', type: 'text', required: false },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['Pendente', 'Separado', 'Falta'],
        },
        { name: 'measurements', type: 'text', required: false },
        {
          name: 'separated_by',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'separated_at', type: 'date', required: false },
        { name: 'notes', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_pcp_order_materials_order ON pcp_order_materials (order_id)',
        'CREATE INDEX idx_pcp_order_materials_status ON pcp_order_materials (status)',
        'CREATE INDEX idx_pcp_order_materials_code ON pcp_order_materials (code)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('pcp_order_materials')
      app.delete(collection)
    } catch (_) {}
  },
)
