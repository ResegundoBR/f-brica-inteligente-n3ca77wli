migrate(
  (app) => {
    const pcpOrdersCol = app.findCollectionByNameOrId('pcp_orders')

    // 1. Criar coleção pcp_order_deliveries
    const deliveriesCol = new Collection({
      name: 'pcp_order_deliveries',
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
          name: 'quantity',
          type: 'number',
          required: true,
          min: 1,
        },
        {
          name: 'nf',
          type: 'text',
          required: false,
        },
        {
          name: 'transportadora',
          type: 'text',
          required: false,
        },
        {
          name: 'data_saida',
          type: 'date',
          required: false,
        },
        {
          name: 'created_by',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        {
          name: 'notes',
          type: 'text',
          required: false,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_pcp_order_deliveries_order ON pcp_order_deliveries (order_id)',
        'CREATE INDEX idx_pcp_order_deliveries_created ON pcp_order_deliveries (created)',
      ],
    })
    app.save(deliveriesCol)

    // 2. Adicionar campo expedicao_parcial ou campos de saldo em pcp_orders caso queira (opcional, mas bom ter expedicao_acumulada se conveniente)
    // Vamos manter em pcp_order_deliveries como fonte da verdade, mas também podemos adicionar delivered_quantity na OP para consultas rápidas
    if (!pcpOrdersCol.fields.getByName('delivered_quantity')) {
      pcpOrdersCol.fields.add(new NumberField({ name: 'delivered_quantity', required: false }))
      app.save(pcpOrdersCol)
    }
  },
  (app) => {
    try {
      const deliveriesCol = app.findCollectionByNameOrId('pcp_order_deliveries')
      app.delete(deliveriesCol)
    } catch (_) {}

    try {
      const pcpOrdersCol = app.findCollectionByNameOrId('pcp_orders')
      if (pcpOrdersCol.fields.getByName('delivered_quantity')) {
        pcpOrdersCol.fields.removeByName('delivered_quantity')
        app.save(pcpOrdersCol)
      }
    } catch (_) {}
  },
)
