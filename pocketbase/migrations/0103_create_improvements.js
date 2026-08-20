/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const usersCollectionId = '_pb_users_auth_'

    const collection = new Collection({
      name: 'improvements',
      type: 'base',
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      fields: [
        { name: 'title', type: 'text', required: true, min: 3, max: 200 },
        {
          name: 'category',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['Operacional', 'Processual', 'Ferramental', 'Infraestrutura', 'Inovação'],
        },
        {
          name: 'priority',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['Crítica', 'Alta', 'Média', 'Baixa'],
        },
        { name: 'description', type: 'text', required: true, min: 5 },
        { name: 'root_cause', type: 'text', required: true, min: 3 },
        { name: 'solution_idea', type: 'text', required: false },
        { name: 'expected_impact', type: 'text', required: true, min: 3 },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: [
            'Identificado',
            'Em Análise',
            'Planejado',
            'Em Execução',
            'Verificando',
            'Concluído',
            'Reaberto',
          ],
        },
        { name: 'ia_suggestions', type: 'json', required: false, maxSize: 5242880 },
        { name: 'actions_log', type: 'json', required: false, maxSize: 5242880 },
        {
          name: 'created_by',
          type: 'relation',
          required: true,
          collectionId: usersCollectionId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'assigned_to',
          type: 'relation',
          required: false,
          collectionId: usersCollectionId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_improvements_status ON improvements (status)',
        'CREATE INDEX idx_improvements_priority ON improvements (priority)',
        'CREATE INDEX idx_improvements_created_by ON improvements (created_by)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('improvements')
      app.delete(collection)
    } catch (_) {}
  },
)
