migrate(
  (app) => {
    // Custos no nível do PEDIDO: order_id passa a ser opcional e entra o
    // campo order_number. Linha com order_id vazio + order_number preenchido
    // = custo do pedido como um todo (comissão, frete, impostos do conjunto).
    const col = app.findCollectionByNameOrId('pcp_order_costs')
    let changed = false

    const orderField = col.fields.getByName('order_id')
    if (orderField && orderField.required) {
      orderField.required = false
      changed = true
    }

    if (!col.fields.getByName('order_number')) {
      col.fields.add(new TextField({ name: 'order_number', required: false }))
      changed = true
    }

    const idxName = 'idx_pcp_order_costs_order_number'
    const idxSql = `CREATE INDEX ${idxName} ON pcp_order_costs (order_number)`
    const indexes = col.indexes || []
    const hasIdx = indexes.some((i) => i.includes(idxName))
    if (!hasIdx) {
      col.indexes = [...indexes, idxSql]
      changed = true
    }

    if (changed) app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('pcp_order_costs')
      const field = col.fields.getByName('order_number')
      if (field) col.fields.removeByName('order_number')
      col.indexes = (col.indexes || []).filter(
        (i) => !i.includes('idx_pcp_order_costs_order_number'),
      )
      // order_id permanece opcional no retorno: linhas de nível de pedido
      // já criadas não podem ser invalidadas pelo down.
      app.save(col)
    } catch (_) {}
  },
)
