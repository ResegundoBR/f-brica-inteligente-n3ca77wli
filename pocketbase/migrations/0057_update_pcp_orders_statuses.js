migrate(
  (app) => {
    app.db().newQuery("UPDATE pcp_orders SET status = 'Parado' WHERE status = 'Revisão'").execute()

    const col = app.findCollectionByNameOrId('pcp_orders')

    const statusField = col.fields.getByName('status')
    statusField.values = ['Fila', 'Em Andamento', 'Parado', 'Concluído']

    const stageField = col.fields.getByName('stage')
    stageField.values = [
      'Corte',
      'Dobra',
      'Calandra',
      'Solda',
      'Montagem',
      'Acabamento',
      'Expedição',
    ]

    app.save(col)
  },
  (app) => {
    app.db().newQuery("UPDATE pcp_orders SET status = 'Revisão' WHERE status = 'Parado'").execute()

    const col = app.findCollectionByNameOrId('pcp_orders')

    const statusField = col.fields.getByName('status')
    statusField.values = ['Fila', 'Em Andamento', 'Revisão', 'Concluído']

    const stageField = col.fields.getByName('stage')
    stageField.values = ['Corte', 'Montagem', 'Acabamento', 'Expedição']

    app.save(col)
  },
)
