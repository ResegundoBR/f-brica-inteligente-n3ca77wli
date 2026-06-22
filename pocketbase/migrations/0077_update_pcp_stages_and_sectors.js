migrate(
  (app) => {
    app
      .db()
      .newQuery(
        "UPDATE pcp_orders SET stage = 'Separação' WHERE stage = 'Separação no estoque fisico'",
      )
      .execute()
    app
      .db()
      .newQuery(
        "UPDATE pcp_order_logs SET stage = 'Separação' WHERE stage = 'Separação no estoque fisico'",
      )
      .execute()

    const colOrders = app.findCollectionByNameOrId('pcp_orders')
    const stageField = colOrders.fields.getByName('stage')
    if (stageField) {
      stageField.values = stageField.values.filter((v) => v !== 'Separação no estoque fisico')
      app.save(colOrders)
    }
  },
  (app) => {
    const colOrders = app.findCollectionByNameOrId('pcp_orders')
    const stageField = colOrders.fields.getByName('stage')
    if (stageField && !stageField.values.includes('Separação no estoque fisico')) {
      stageField.values.push('Separação no estoque fisico')
      app.save(colOrders)
    }
  },
)
