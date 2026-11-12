// Migration 0177 — campo opcional ORDER_GROUP em pcp_order_costs para o painel
// Rentabilidade Especiais: linhas de custo lançadas no nível do GRUPO de pedidos
// (order_id vazio, order_number vazio, order_group = nome do grupo). Complementa a
// migration 0176 (order_group em pcp_orders). Afeta APENAS a Rentabilidade
// Especiais — Kanban, Suprimentos e demais fluxos não usam este campo. Idempotente.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_order_costs')
    if (!col.fields.getByName('order_group')) {
      col.fields.add(new TextField({ name: 'order_group', required: false }))
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('pcp_order_costs')
      const field = col.fields.getByName('order_group')
      if (field) col.fields.removeByName('order_group')
      app.save(col)
    } catch (_) {}
  },
)
