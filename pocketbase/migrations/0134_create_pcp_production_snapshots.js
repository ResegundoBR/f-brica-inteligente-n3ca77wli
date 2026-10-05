migrate(
  (app) => {
    const collection = new Collection({
      name: 'pcp_production_snapshots',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'reference_date', type: 'text', required: true },
        { name: 'total_units', type: 'number', required: true },
        { name: 'delayed_units', type: 'number', required: true },
        { name: 'to_start_units', type: 'number', required: false },
        { name: 'in_process_units', type: 'number', required: false },
        { name: 'expedition_units', type: 'number', required: false },
        { name: 'linha_units', type: 'number', required: false },
        { name: 'especial_units', type: 'number', required: false },
        { name: 'assistencia_units', type: 'number', required: false },
        { name: 'open_orders_count', type: 'number', required: false },
        { name: 'delayed_orders_count', type: 'number', required: false },
        { name: 'metadata', type: 'json', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_production_snapshots_date ON pcp_production_snapshots (reference_date)',
        'CREATE INDEX idx_production_snapshots_date_desc ON pcp_production_snapshots (reference_date DESC)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('pcp_production_snapshots')
      app.delete(col)
    } catch (_) {}
  },
)
