migrate(
  (app) => {
    // 1. Double check 'Revisão' -> 'Parado' mapping
    app.db().newQuery("UPDATE pcp_orders SET status = 'Parado' WHERE status = 'Revisão'").execute()

    // 2. Map removed stages to matching ones from the new list to prevent validation failures on existing records
    app
      .db()
      .newQuery("UPDATE pcp_orders SET stage = 'Pintura' WHERE stage = 'Acabamento'")
      .execute()
    app
      .db()
      .newQuery("UPDATE pcp_orders SET stage = 'Embalagem' WHERE stage = 'Expedição'")
      .execute()

    const col = app.findCollectionByNameOrId('pcp_orders')
    const statusField = col.fields.getByName('status')
    statusField.values = ['Fila', 'Em Andamento', 'Parado', 'Concluído']

    const stageField = col.fields.getByName('stage')
    stageField.values = [
      'Separação no estoque fisico',
      'Levantamento de faltas (Comprado fora)',
      'Levantamento de faltas (Fabricado internamente)',
      'Cotação',
      'Compra',
      'Retirada',
      'Aguardar chegar',
      'Entrega',
      'Corte',
      'Acabamento corte',
      'Dobra',
      'Calandra',
      'Solda',
      'Acabamento de solda',
      'Furação',
      'Rosca',
      'Bases de concreto',
      'Preparação (wash primer, primer e lixamento)',
      'Pintura',
      'Verniz',
      'Retoques',
      'Montagem',
      'Testes (Montagem)',
      'Controle de qualidade',
      'Testes (Expedição)',
      'Fotos',
      'Embalagem',
    ]

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')
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

    app
      .db()
      .newQuery("UPDATE pcp_orders SET stage = 'Acabamento' WHERE stage = 'Pintura'")
      .execute()
    app
      .db()
      .newQuery("UPDATE pcp_orders SET stage = 'Expedição' WHERE stage = 'Embalagem'")
      .execute()
  },
)
