// Migration 0176 — campo opcional ORDER_GROUP em pcp_orders para o painel
// Rentabilidade Especiais: OPs com a mesma etiqueta consolidam como um único
// negócio no modo "Por Grupo". Afeta APENAS a Rentabilidade Especiais —
// Kanban, Suprimentos e demais fluxos não usam este campo. Idempotente.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')
    if (!col.fields.getByName('order_group')) {
      col.fields.add(new TextField({ name: 'order_group', required: false }))
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('pcp_orders')
      const field = col.fields.getByName('order_group')
      if (field) col.fields.removeByName('order_group')
      app.save(col)
    } catch (_) {}
  },
)
