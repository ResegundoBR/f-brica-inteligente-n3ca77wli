migrate(
  (app) => {
    // Arquivamento de projetos especiais: flag ARCHIVED em pcp_orders.
    // Afeta APENAS o painel Rentabilidade Especiais (some da lista/totais por
    // padrão) — não interfere em Kanban, gargalos ou qualquer outro fluxo.
    const col = app.findCollectionByNameOrId('pcp_orders')
    if (!col.fields.getByName('archived')) {
      col.fields.add(new BoolField({ name: 'archived', required: false }))
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('pcp_orders')
      const field = col.fields.getByName('archived')
      if (field) col.fields.removeByName('archived')
      app.save(col)
    } catch (_) {}
  },
)
