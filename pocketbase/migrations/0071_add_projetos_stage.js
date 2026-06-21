migrate(
  (app) => {
    const colOrders = app.findCollectionByNameOrId('pcp_orders')

    const stageField = colOrders.fields.getByName('stage')
    if (!stageField.values.includes('Projetos')) {
      stageField.values.push('Projetos')
    }

    const obsSectorField = colOrders.fields.getByName('observation_sector')
    if (obsSectorField && !obsSectorField.values.includes('Projetos')) {
      obsSectorField.values.push('Projetos')
    }

    app.save(colOrders)

    const colObs = app.findCollectionByNameOrId('pcp_order_observations')
    const sectorField = colObs.fields.getByName('sector')
    if (!sectorField.values.includes('Projetos')) {
      sectorField.values.push('Projetos')
    }
    app.save(colObs)
  },
  (app) => {
    const colOrders = app.findCollectionByNameOrId('pcp_orders')

    const stageField = colOrders.fields.getByName('stage')
    if (stageField.values.includes('Projetos')) {
      stageField.values = stageField.values.filter((v) => v !== 'Projetos')
    }

    const obsSectorField = colOrders.fields.getByName('observation_sector')
    if (obsSectorField && obsSectorField.values.includes('Projetos')) {
      obsSectorField.values = obsSectorField.values.filter((v) => v !== 'Projetos')
    }

    app.save(colOrders)

    const colObs = app.findCollectionByNameOrId('pcp_order_observations')
    const sectorField = colObs.fields.getByName('sector')
    if (sectorField.values.includes('Projetos')) {
      sectorField.values = sectorField.values.filter((v) => v !== 'Projetos')
    }
    app.save(colObs)
  },
)
