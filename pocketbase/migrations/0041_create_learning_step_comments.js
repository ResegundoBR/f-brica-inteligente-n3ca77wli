migrate(
  (app) => {
    const collection = new Collection({
      name: 'learning_step_comments',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule:
        "user_id = @request.auth.id || @request.auth.role.name = 'admin' || @request.auth.role.name = 'Administrador'",
      deleteRule:
        "user_id = @request.auth.id || @request.auth.role.name = 'admin' || @request.auth.role.name = 'Administrador'",
      fields: [
        {
          name: 'step_id',
          type: 'relation',
          required: true,
          collectionId: app.findCollectionByNameOrId('learning_steps').id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'user_id',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'content', type: 'text', required: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_learning_step_comments_step ON learning_step_comments (step_id)'],
    })
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('learning_step_comments')
    app.delete(collection)
  },
)
