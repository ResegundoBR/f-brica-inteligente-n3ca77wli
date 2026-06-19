migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')
    const stageField = col.fields.getByName('stage')

    const newMacros = ['Suprimentos', 'Fabricação', 'Acabamento', 'Expedição']
    const updatedValues = [...stageField.values]
    for (const macro of newMacros) {
      if (!updatedValues.includes(macro)) {
        updatedValues.push(macro)
      }
    }

    stageField.values = updatedValues
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')
    const stageField = col.fields.getByName('stage')

    const macrosToRemove = ['Suprimentos', 'Fabricação', 'Acabamento', 'Expedição']
    stageField.values = stageField.values.filter((v) => !macrosToRemove.includes(v))

    app.save(col)
  },
)
