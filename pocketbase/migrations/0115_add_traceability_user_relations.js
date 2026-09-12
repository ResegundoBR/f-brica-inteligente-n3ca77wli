migrate(
  (app) => {
    // 1. quotations.quoted_by -> relation to _pb_users_auth_
    const quotationsCol = app.findCollectionByNameOrId('quotations')
    if (!quotationsCol.fields.getByName('quoted_by')) {
      quotationsCol.fields.add(
        new RelationField({
          name: 'quoted_by',
          collectionId: '_pb_users_auth_',
          required: false,
          maxSelect: 1,
        }),
      )
    }
    app.save(quotationsCol)

    // 2. material_shortages.received_by & material_shortages.distributed_by -> relation to _pb_users_auth_
    const shortagesCol = app.findCollectionByNameOrId('material_shortages')
    if (!shortagesCol.fields.getByName('received_by')) {
      shortagesCol.fields.add(
        new RelationField({
          name: 'received_by',
          collectionId: '_pb_users_auth_',
          required: false,
          maxSelect: 1,
        }),
      )
    }
    if (!shortagesCol.fields.getByName('distributed_by')) {
      shortagesCol.fields.add(
        new RelationField({
          name: 'distributed_by',
          collectionId: '_pb_users_auth_',
          required: false,
          maxSelect: 1,
        }),
      )
    }
    app.save(shortagesCol)

    // 3. pcp_orders.bottleneck_by -> relation to _pb_users_auth_
    const ordersCol = app.findCollectionByNameOrId('pcp_orders')
    if (!ordersCol.fields.getByName('bottleneck_by')) {
      ordersCol.fields.add(
        new RelationField({
          name: 'bottleneck_by',
          collectionId: '_pb_users_auth_',
          required: false,
          maxSelect: 1,
        }),
      )
    }
    app.save(ordersCol)
  },
  (app) => {
    try {
      const quotationsCol = app.findCollectionByNameOrId('quotations')
      quotationsCol.fields.removeByName('quoted_by')
      app.save(quotationsCol)
    } catch (_) {}

    try {
      const shortagesCol = app.findCollectionByNameOrId('material_shortages')
      shortagesCol.fields.removeByName('received_by')
      shortagesCol.fields.removeByName('distributed_by')
      app.save(shortagesCol)
    } catch (_) {}

    try {
      const ordersCol = app.findCollectionByNameOrId('pcp_orders')
      ordersCol.fields.removeByName('bottleneck_by')
      app.save(ordersCol)
    } catch (_) {}
  },
)
