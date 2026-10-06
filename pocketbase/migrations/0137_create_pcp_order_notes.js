migrate(
  (app) => {
    const pcpOrdersCol = app.findCollectionByNameOrId('pcp_orders')

    const notesCol = new Collection({
      name: 'pcp_order_notes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: null,
      deleteRule: null,
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
          name: 'content',
          type: 'text',
          required: true,
        },
        {
          name: 'created_by',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_pcp_order_notes_order ON pcp_order_notes (order_id)',
        'CREATE INDEX idx_pcp_order_notes_created ON pcp_order_notes (created DESC)',
      ],
    })
    app.save(notesCol)
  },
  (app) => {
    try {
      const notesCol = app.findCollectionByNameOrId('pcp_order_notes')
      app.delete(notesCol)
    } catch (_) {}
  },
)
