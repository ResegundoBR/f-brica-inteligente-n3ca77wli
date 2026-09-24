migrate(
  (app) => {
    const collection = new Collection({
      name: 'pcp_material_min_levels',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'material_code', type: 'text', required: true },
        { name: 'material_description', type: 'text', required: false },
        { name: 'min_level', type: 'number', required: true },
        {
          name: 'updated_by',
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
        'CREATE UNIQUE INDEX idx_material_min_levels_code ON pcp_material_min_levels (material_code)',
        'CREATE INDEX idx_material_min_levels_updated ON pcp_material_min_levels (updated DESC)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('pcp_material_min_levels')
      app.delete(col)
    } catch (_) {}
  },
)
