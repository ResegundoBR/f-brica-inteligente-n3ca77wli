migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.fields.add(
      new SelectField({
        name: 'role',
        values: ['admin', 'reviewer', 'registrator'],
        maxSelect: 1,
        required: true,
      }),
    )
    users.fields.add(new BoolField({ name: 'must_change_password' }))
    app.save(users)

    const products = new Collection({
      name: 'products',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'registrator')",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'description', type: 'text' },
        {
          name: 'status',
          type: 'select',
          values: ['rascunho', 'revisao', 'pendencia', 'validado'],
          maxSelect: 1,
          required: true,
        },
        {
          name: 'files',
          type: 'file',
          maxSelect: 10,
          maxSize: 52428800,
          mimeTypes: [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'application/octet-stream',
            'application/x-solidworks-part',
            'application/x-solidworks-assembly',
          ],
        },
        {
          name: 'owner',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          required: true,
        },
        { name: 'data', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_products_status ON products (status)',
        'CREATE INDEX idx_products_owner ON products (owner)',
      ],
    })
    app.save(products)

    const logs = new Collection({
      name: 'activity_logs',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'product_id', type: 'relation', collectionId: products.id, maxSelect: 1 },
        { name: 'user_id', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'action', type: 'text', required: true },
        { name: 'details', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(logs)

    const notifications = new Collection({
      name: 'notifications',
      type: 'base',
      listRule: "@request.auth.id != '' && user_id = @request.auth.id",
      viewRule: "@request.auth.id != '' && user_id = @request.auth.id",
      createRule: null,
      updateRule: "@request.auth.id != '' && user_id = @request.auth.id",
      deleteRule: "@request.auth.id != '' && user_id = @request.auth.id",
      fields: [
        {
          name: 'user_id',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          required: true,
        },
        { name: 'message', type: 'text', required: true },
        { name: 'read', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(notifications)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('notifications'))
    } catch (e) {}
    try {
      app.delete(app.findCollectionByNameOrId('activity_logs'))
    } catch (e) {}
    try {
      app.delete(app.findCollectionByNameOrId('products'))
    } catch (e) {}
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      users.fields.removeByName('role')
      users.fields.removeByName('must_change_password')
      app.save(users)
    } catch (e) {}
  },
)
