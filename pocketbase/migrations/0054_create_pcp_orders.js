migrate(
  (app) => {
    const collection = new Collection({
      name: 'pcp_orders',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'order_number', type: 'text', required: true },
        { name: 'client_name', type: 'text', required: true },
        {
          name: 'product_id',
          type: 'relation',
          required: false,
          collectionId: app.findCollectionByNameOrId('products').id,
          maxSelect: 1,
        },
        { name: 'is_special', type: 'bool', required: false },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['Fila', 'Em Andamento', 'Revisão', 'Concluído'],
          maxSelect: 1,
        },
        {
          name: 'stage',
          type: 'select',
          required: true,
          values: ['Corte', 'Montagem', 'Acabamento', 'Expedição'],
          maxSelect: 1,
        },
        { name: 'annex', type: 'file', maxSelect: 1, maxSize: 10485760 },
        {
          name: 'bottleneck_reason',
          type: 'select',
          required: false,
          values: ['Nenhum', 'Falta de Material', 'Dúvida Técnica', 'Sobrecarga'],
          maxSelect: 1,
        },
        { name: 'delivery_date', type: 'date', required: true },
        { name: 'started_at', type: 'date', required: false },
        { name: 'finished_at', type: 'date', required: false },
        {
          name: 'operator_id',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_pcp_orders_status ON pcp_orders (status)',
        'CREATE INDEX idx_pcp_orders_stage ON pcp_orders (stage)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('pcp_orders')
    app.delete(collection)
  },
)
