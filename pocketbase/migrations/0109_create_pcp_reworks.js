migrate(
  (app) => {
    const pcpOrdersCol = app.findCollectionByNameOrId('pcp_orders')

    // 1. Garantir que bottleneck_reason inclui 'Retrabalho'
    const bottleneckField = pcpOrdersCol.fields.getByName('bottleneck_reason')
    if (bottleneckField && !bottleneckField.values.includes('Retrabalho')) {
      bottleneckField.values.push('Retrabalho')
      app.save(pcpOrdersCol)
    }

    // 2. Garantir que stage inclui 'Retoque' além de 'Retoques'
    const stageField = pcpOrdersCol.fields.getByName('stage')
    if (stageField && !stageField.values.includes('Retoque')) {
      stageField.values.push('Retoque')
      app.save(pcpOrdersCol)
    }

    // 3. Criar a coleção pcp_reworks para rastreabilidade permanente
    const reworksCol = new Collection({
      name: 'pcp_reworks',
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
          name: 'origin_sector',
          type: 'text',
          required: true,
        },
        {
          name: 'origin_stage',
          type: 'text',
          required: true,
        },
        {
          name: 'target_sector',
          type: 'text',
          required: true,
        },
        {
          name: 'description',
          type: 'text',
          required: true,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['Pendente', 'Em Andamento', 'Concluído'],
          maxSelect: 1,
        },
        {
          name: 'signaled_by',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        {
          name: 'signaled_at',
          type: 'date',
          required: true,
        },
        {
          name: 'executed_by',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        {
          name: 'started_at',
          type: 'date',
          required: false,
        },
        {
          name: 'finished_at',
          type: 'date',
          required: false,
        },
        {
          name: 'duration_minutes',
          type: 'number',
          required: false,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_pcp_reworks_order ON pcp_reworks (order_id)',
        'CREATE INDEX idx_pcp_reworks_status ON pcp_reworks (status)',
        'CREATE INDEX idx_pcp_reworks_created ON pcp_reworks (created)',
        'CREATE INDEX idx_pcp_reworks_origin ON pcp_reworks (origin_sector)',
        'CREATE INDEX idx_pcp_reworks_target ON pcp_reworks (target_sector)',
      ],
    })
    app.save(reworksCol)
  },
  (app) => {
    try {
      const reworksCol = app.findCollectionByNameOrId('pcp_reworks')
      app.delete(reworksCol)
    } catch (_) {}

    try {
      const pcpOrdersCol = app.findCollectionByNameOrId('pcp_orders')
      const bottleneckField = pcpOrdersCol.fields.getByName('bottleneck_reason')
      if (bottleneckField && bottleneckField.values.includes('Retrabalho')) {
        bottleneckField.values = bottleneckField.values.filter((v) => v !== 'Retrabalho')
        app.save(pcpOrdersCol)
      }
      const stageField = pcpOrdersCol.fields.getByName('stage')
      if (stageField && stageField.values.includes('Retoque')) {
        stageField.values = stageField.values.filter((v) => v !== 'Retoque')
        app.save(pcpOrdersCol)
      }
    } catch (_) {}
  },
)
