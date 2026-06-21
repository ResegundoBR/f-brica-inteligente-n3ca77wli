migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')
    const stageField = col.fields.getByName('stage')

    const values = Array.from(stageField.values || [])
    if (!values.includes('Separação no estoque fisico')) {
      values.push('Separação no estoque fisico')
      stageField.values = values
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')
    const stageField = col.fields.getByName('stage')

    const values = Array.from(stageField.values || [])
    if (values.includes('Separação no estoque fisico')) {
      stageField.values = values.filter((v) => v !== 'Separação no estoque fisico')
      app.save(col)
    }
  },
)
