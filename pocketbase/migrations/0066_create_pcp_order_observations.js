migrate(
  (app) => {
    const collection = new Collection({
      name: 'pcp_order_observations',
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
          collectionId: app.findCollectionByNameOrId('pcp_orders').id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'sector',
          type: 'select',
          required: true,
          values: ['Fabricação', 'Acabamento', 'Montagem'],
          maxSelect: 1,
        },
        {
          name: 'content',
          type: 'text',
          required: true,
        },
      ],
    })
    app.save(collection)

    const orders = app.findRecordsByFilter('pcp_orders', "observations != ''", '', 10000, 0)
    for (const order of orders) {
      let sector = order.getString('observation_sector')
      if (!['Fabricação', 'Acabamento', 'Montagem'].includes(sector)) {
        sector = 'Fabricação'
      }
      const obs = new Record(collection)
      obs.set('order_id', order.id)
      obs.set('sector', sector)
      obs.set('content', order.getString('observations'))
      app.save(obs)
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('pcp_order_observations')
    app.delete(collection)
  },
)
