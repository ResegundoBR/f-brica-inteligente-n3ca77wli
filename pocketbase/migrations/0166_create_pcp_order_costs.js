migrate(
  (app) => {
    // ---- pcp_cost_settings (config global: valor/hora padrão e overhead %) ----
    let settingsCol
    try {
      settingsCol = app.findCollectionByNameOrId('pcp_cost_settings')
    } catch (_) {
      settingsCol = null
    }
    if (!settingsCol) {
      const settings = new Collection({
        name: 'pcp_cost_settings',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: null,
        fields: [
          { name: 'default_hour_rate', type: 'number', required: false },
          { name: 'overhead_percent', type: 'number', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      })
      app.save(settings)
      // seed de uma linha de configuração
      try {
        const Model = dynamicImport('models/record').Record
        const rec = new Model(settings, {
          default_hour_rate: 0,
          overhead_percent: 0,
        })
        app.save(rec)
      } catch (_) {}
    }

    // ---- pcp_order_costs (linhas de custo por OP) ----
    let costsCol
    try {
      costsCol = app.findCollectionByNameOrId('pcp_order_costs')
    } catch (_) {
      costsCol = null
    }
    if (!costsCol) {
      const costs = new Collection({
        name: 'pcp_order_costs',
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
          {
            name: 'category',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: [
              'Material',
              'Insumo',
              'Mão de Obra',
              'Terceirização',
              'Impostos',
              'Comissão',
              'RT',
              'Frete',
              'Outros',
            ],
          },
          { name: 'description', type: 'text', required: false },
          { name: 'quantity', type: 'number', required: false },
          { name: 'unit_cost', type: 'number', required: false },
          { name: 'total', type: 'number', required: false },
          {
            name: 'source',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['Automático', 'Manual'],
          },
          { name: 'date', type: 'date', required: false },
          { name: 'notes', type: 'text', required: false },
          {
            name: 'created_by',
            type: 'relation',
            required: false,
            collectionId: '_pb_users_auth_',
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_pcp_order_costs_order ON pcp_order_costs (order_id)',
          'CREATE INDEX idx_pcp_order_costs_category ON pcp_order_costs (category)',
        ],
      })
      app.save(costs)
    }

    // ---- pcp_orders: sale_price e labor_hour_rate ----
    const orders = app.findCollectionByNameOrId('pcp_orders')
    let ordersChanged = false
    if (!orders.fields.getByName('sale_price')) {
      orders.fields.add(new NumberField({ name: 'sale_price', required: false }))
      ordersChanged = true
    }
    if (!orders.fields.getByName('labor_hour_rate')) {
      orders.fields.add(new NumberField({ name: 'labor_hour_rate', required: false }))
      ordersChanged = true
    }
    if (ordersChanged) app.save(orders)
  },
  (app) => {
    try {
      const orders = app.findCollectionByNameOrId('pcp_orders')
      let changed = false
      for (const f of ['sale_price', 'labor_hour_rate']) {
        if (orders.fields.getByName(f)) {
          orders.fields.removeByName(f)
          changed = true
        }
      }
      if (changed) app.save(orders)
    } catch (_) {}
    try {
      const costs = app.findCollectionByNameOrId('pcp_order_costs')
      app.delete(costs)
    } catch (_) {}
    try {
      const settings = app.findCollectionByNameOrId('pcp_cost_settings')
      app.delete(settings)
    } catch (_) {}
  },
)
