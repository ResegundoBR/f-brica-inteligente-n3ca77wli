migrate(
  (app) => {
    const collections = [
      'quotations',
      'material_shortages',
      'inventory_movements',
      'inventory',
      'suppliers',
      'pcp_order_logs',
      'pcp_order_observations',
      'pcp_order_messages',
      'pcp_orders',
      'clients',
    ]

    collections.forEach((name) => {
      try {
        const col = app.findCollectionByNameOrId(name)
        const records = app.findRecordsByFilter(name, '1=1', '', 0, 0)
        for (const r of records) {
          try {
            app.delete(r)
          } catch (_) {}
        }
        try {
          app.truncateCollection(col)
        } catch (_) {}
      } catch (_) {}
    })
  },
  (app) => {
    // Cannot restore deleted test data
  },
)
