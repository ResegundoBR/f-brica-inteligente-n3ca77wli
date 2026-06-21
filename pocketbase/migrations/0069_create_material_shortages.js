migrate(
  (app) => {
    const collection = new Collection({
      name: 'material_shortages',
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
          collectionId: app.findCollectionByNameOrId('pcp_orders').id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'description', type: 'text', required: true },
        { name: 'code', type: 'text' },
        { name: 'quantity', type: 'number', required: true },
        { name: 'sector', type: 'text', required: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['Pendente', 'Liberado_Estoque', 'Cotação', 'Compra', 'Recebido', 'Cancelado'],
        },
        { name: 'supplier', type: 'text' },
        { name: 'expected_date', type: 'date' },
        { name: 'observation', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_material_shortages_order ON material_shortages (order_id)',
        'CREATE INDEX idx_material_shortages_status ON material_shortages (status)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('material_shortages')
    app.delete(collection)
  },
)
