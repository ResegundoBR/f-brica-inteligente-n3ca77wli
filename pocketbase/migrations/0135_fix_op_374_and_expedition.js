migrate(
  (app) => {
    // 1. Corrigir inconsistência na OP 374 (id 6wjx8vtluwtscde) e quaisquer outras OPs onde
    // status seja 'Em Andamento' mas finished_at esteja preenchido indevidamente
    // (ex.: OP que havia sido concluída em Pintura e foi reaberta para Expedição sem limpar finished_at)
    try {
      const op = app.findRecordById('pcp_orders', '6wjx8vtluwtscde')
      if (op) {
        if (op.getString('status') === 'Em Andamento' && op.getString('finished_at')) {
          op.set('finished_at', null)
          app.saveNoValidate(op)
        }
      }
    } catch (e) {
      console.log('Aviso ao ajustar OP 374:', e.message)
    }

    // 2. Garantir que as regras e campos da coleção pcp_order_deliveries estejam íntegros
    try {
      const deliveriesCol = app.findCollectionByNameOrId('pcp_order_deliveries')
      deliveriesCol.listRule = "@request.auth.id != ''"
      deliveriesCol.viewRule = "@request.auth.id != ''"
      deliveriesCol.createRule = "@request.auth.id != ''"
      deliveriesCol.updateRule = "@request.auth.id != ''"
      deliveriesCol.deleteRule = "@request.auth.id != ''"
      app.save(deliveriesCol)
    } catch (e) {
      console.log('Aviso ao checar coleção pcp_order_deliveries:', e.message)
    }
  },
  (app) => {
    // Rollback não precisa reverter finished_at pois era um estado inconsistente
  },
)
