migrate(
  (app) => {
    const history = new Collection({
      name: 'revision_history',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'revision_point_id',
          type: 'relation',
          required: true,
          collectionId: app.findCollectionByNameOrId('revision_points').id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'user_id',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'action', type: 'text', required: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_revision_history_point ON revision_history (revision_point_id)'],
    })
    app.save(history)

    const notifs = app.findCollectionByNameOrId('notifications')
    notifs.fields.add(new URLField({ name: 'action_url', required: false }))
    app.save(notifs)
  },
  (app) => {
    const history = app.findCollectionByNameOrId('revision_history')
    app.delete(history)

    const notifs = app.findCollectionByNameOrId('notifications')
    notifs.fields.removeByName('action_url')
    app.save(notifs)
  },
)
