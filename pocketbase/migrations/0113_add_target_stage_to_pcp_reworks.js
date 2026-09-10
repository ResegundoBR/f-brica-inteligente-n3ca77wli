migrate(
  (app) => {
    // 1. Adicionar campo target_stage na coleção pcp_reworks (opcional para compatibilidade com registros existentes)
    const reworksCol = app.findCollectionByNameOrId('pcp_reworks')
    if (!reworksCol.fields.getByName('target_stage')) {
      reworksCol.fields.add(
        new TextField({
          name: 'target_stage',
          required: false,
        }),
      )
      app.save(reworksCol)
    }

    // 2. Correção de dados: mover a OP 290/2026 da etapa 'Retoque' para 'Corte', status 'Fila', started_at vazio, mantendo o bottleneck_reason 'Retrabalho'
    app
      .db()
      .newQuery(`
      UPDATE pcp_orders 
      SET stage = 'Corte', status = 'Fila', started_at = '' 
      WHERE (op_number = '290/2026' OR order_number = '290/2026' OR op_number LIKE '290/%')
    `)
      .execute()

    // 3. Atualizar o retrabalho em aberto da OP 290/2026 com target_stage = 'Corte' se ainda não preenchido
    app
      .db()
      .newQuery(`
      UPDATE pcp_reworks
      SET target_stage = 'Corte'
      WHERE order_id IN (
        SELECT id FROM pcp_orders WHERE (op_number = '290/2026' OR order_number = '290/2026' OR op_number LIKE '290/%')
      ) AND (target_stage IS NULL OR target_stage = '')
    `)
      .execute()
  },
  (app) => {
    try {
      const reworksCol = app.findCollectionByNameOrId('pcp_reworks')
      const targetStageField = reworksCol.fields.getByName('target_stage')
      if (targetStageField) {
        reworksCol.fields.removeByName('target_stage')
        app.save(reworksCol)
      }
    } catch (_) {}
  },
)
