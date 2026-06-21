migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')

    col.fields.add(
      new JSONField({
        name: 'outsourcing_data',
        required: false,
      }),
    )

    const stageField = col.fields.getByName('stage')
    stageField.values = [
      'Separação',
      'Cotação',
      'Compra',
      'Retirada',
      'Aguardando',
      'Corte',
      'Dobra',
      'Calandra',
      'Solda',
      'Acab. Solda',
      'Furação',
      'Rosca',
      'Concreto',
      'Terceirização',
      'Preparação',
      'Pintura',
      'Verniz',
      'Retoques',
      'Montagem',
      'Qualidade',
      'Embalagem',
      'Suprimentos',
      'Fabricação',
      'Acabamento',
      'Expedição',
    ]

    app.save(col)

    const queries = [
      "UPDATE pcp_orders SET stage = 'Separação' WHERE stage = 'Separação no estoque fisico'",
      "UPDATE pcp_orders SET stage = 'Aguardando' WHERE stage = 'Aguardar chegar'",
      "UPDATE pcp_orders SET stage = 'Acab. Solda' WHERE stage = 'Acabamento de solda'",
      "UPDATE pcp_orders SET stage = 'Concreto' WHERE stage = 'Bases de concreto'",
      "UPDATE pcp_orders SET stage = 'Preparação' WHERE stage = 'Preparação (wash primer, primer e lixamento)'",
      "UPDATE pcp_orders SET stage = 'Qualidade' WHERE stage = 'Controle de qualidade'",
      "UPDATE pcp_orders SET stage = 'Corte' WHERE stage = 'Acabamento corte'",
      "UPDATE pcp_orders SET stage = 'Aguardando' WHERE stage = 'Entrega'",
    ]

    for (const query of queries) {
      app.db().newQuery(query).execute()
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')
    col.fields.removeByName('outsourcing_data')
    app.save(col)
  },
)
