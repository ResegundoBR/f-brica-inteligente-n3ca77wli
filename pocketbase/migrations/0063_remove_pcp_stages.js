migrate(
  (app) => {
    app
      .db()
      .newQuery(
        "UPDATE pcp_orders SET stage = 'Separação no estoque fisico' WHERE stage = 'Levantamento de faltas (Comprado fora)' OR stage = 'Levantamento de faltas (Fabricado internamente)'",
      )
      .execute()
    app
      .db()
      .newQuery("UPDATE pcp_orders SET stage = 'Montagem' WHERE stage = 'Testes (Montagem)'")
      .execute()
    app
      .db()
      .newQuery(
        "UPDATE pcp_orders SET stage = 'Embalagem' WHERE stage = 'Testes (Expedição)' OR stage = 'Fotos'",
      )
      .execute()

    const col = app.findCollectionByNameOrId('pcp_orders')
    const field = col.fields.getByName('stage')
    field.values = [
      'Separação no estoque fisico',
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
      'Controle de qualidade',
      'Embalagem',
      'Suprimentos',
      'Fabricação',
      'Acabamento',
      'Expedição',
    ]
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')
    const field = col.fields.getByName('stage')
    field.values = [
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
      'Suprimentos',
      'Fabricação',
      'Acabamento',
      'Expedição',
    ]
    app.save(col)
  },
)
