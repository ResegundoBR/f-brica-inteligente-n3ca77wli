migrate(
  (app) => {
    // 1. Criar coleção pcp_programacoes
    const collection = new Collection({
      name: 'pcp_programacoes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'seq_number', type: 'number', required: true },
        { name: 'name', type: 'text', required: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['Em produção', 'Encerrada'],
          maxSelect: 1,
        },
        { name: 'generation_date', type: 'date' },
        { name: 'orders_list', type: 'json' },
        { name: 'compiled_items', type: 'json' },
        { name: 'orders_count', type: 'number' },
        { name: 'ops_count', type: 'number' },
        { name: 'items_count', type: 'number' },
        {
          name: 'separation_id',
          type: 'relation',
          collectionId: app.findCollectionByNameOrId('material_separations').id,
          maxSelect: 1,
        },
        {
          name: 'created_by',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        {
          name: 'closed_by',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'closed_at', type: 'date' },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_pcp_programacoes_status ON pcp_programacoes (status)',
        'CREATE INDEX idx_pcp_programacoes_created ON pcp_programacoes (created DESC)',
        'CREATE INDEX idx_pcp_programacoes_seq ON pcp_programacoes (seq_number DESC)',
      ],
    })

    app.save(collection)

    // 2. Adicionar relation programacao_id em material_separations
    try {
      const sepCol = app.findCollectionByNameOrId('material_separations')
      if (!sepCol.fields.getByName('programacao_id')) {
        sepCol.fields.add(
          new RelationField({
            name: 'programacao_id',
            collectionId: collection.id,
            maxSelect: 1,
          }),
        )
        app.save(sepCol)
      }
    } catch (err) {
      console.log('Erro ao adicionar relation programacao_id em material_separations:', err)
    }
  },
  (app) => {
    try {
      const sepCol = app.findCollectionByNameOrId('material_separations')
      const field = sepCol.fields.getByName('programacao_id')
      if (field) {
        sepCol.fields.remove(field)
        app.save(sepCol)
      }
    } catch (_) {}

    try {
      const col = app.findCollectionByNameOrId('pcp_programacoes')
      app.delete(col)
    } catch (_) {}
  },
)
