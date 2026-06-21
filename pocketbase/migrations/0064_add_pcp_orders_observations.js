migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')

    col.fields.add(new TextField({ name: 'observations' }))

    const sectorField = new SelectField({
      name: 'observation_sector',
      maxSelect: 1,
      values: ['Fabricação', 'Acabamento', 'Montagem'],
    })
    col.fields.add(sectorField)

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')
    col.fields.removeByName('observations')
    col.fields.removeByName('observation_sector')
    app.save(col)
  },
)
