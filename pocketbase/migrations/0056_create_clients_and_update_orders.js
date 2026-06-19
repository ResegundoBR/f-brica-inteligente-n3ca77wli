migrate(
  (app) => {
    // 1. Create clients collection
    const clients = new Collection({
      name: 'clients',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_clients_name ON clients (name COLLATE NOCASE)'],
    })
    app.save(clients)

    // 2. Seed clients
    const clientNames = ['Acme Corp', 'Stark Ind', 'Wayne Enterprises', 'Globex', 'Soylent']
    const clientMap = {}
    for (const name of clientNames) {
      const record = new Record(clients)
      record.set('name', name)
      app.save(record)
      clientMap[name] = record.id
    }

    // 3. Update pcp_orders schema
    const pcpOrders = app.findCollectionByNameOrId('pcp_orders')
    pcpOrders.fields.add(
      new RelationField({
        name: 'client_id',
        collectionId: clients.id,
        maxSelect: 1,
        required: false,
      }),
    )
    pcpOrders.fields.add(
      new NumberField({
        name: 'quantity',
        min: 1,
        required: false,
      }),
    )
    app.save(pcpOrders)

    // 4. Migrate existing data
    const orders = app.findRecordsByFilter('pcp_orders', '1=1', '', 1000, 0)
    for (const order of orders) {
      const cName = order.getString('client_name')
      if (clientMap[cName]) {
        order.set('client_id', clientMap[cName])
      } else if (cName) {
        const newClient = new Record(clients)
        newClient.set('name', cName)
        app.save(newClient)
        clientMap[cName] = newClient.id
        order.set('client_id', newClient.id)
      }
      order.set('quantity', 1)
      app.save(order)
    }

    // 5. Enforce required fields
    const clientIdField = pcpOrders.fields.getByName('client_id')
    if (clientIdField) clientIdField.required = true
    const qtyField = pcpOrders.fields.getByName('quantity')
    if (qtyField) qtyField.required = true
    app.save(pcpOrders)
  },
  (app) => {
    const pcpOrders = app.findCollectionByNameOrId('pcp_orders')

    pcpOrders.fields.removeByName('client_id')
    pcpOrders.fields.removeByName('quantity')
    app.save(pcpOrders)

    try {
      const clients = app.findCollectionByNameOrId('clients')
      app.delete(clients)
    } catch (_) {}
  },
)
