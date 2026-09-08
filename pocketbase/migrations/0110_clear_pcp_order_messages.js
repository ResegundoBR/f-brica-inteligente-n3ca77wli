migrate(
  (app) => {
    // Exclui todos os registros de pcp_order_messages (mensagens de teste/demonstração e avisos antigos)
    try {
      const records = app.findRecordsByFilter('pcp_order_messages', '1=1', '', 0, 0)
      for (const r of records) {
        try {
          app.delete(r)
        } catch (_) {}
      }
    } catch (_) {}

    try {
      app.db().newQuery('DELETE FROM pcp_order_messages').execute()
    } catch (_) {}
  },
  (app) => {
    // Não é possível restaurar mensagens de teste excluídas
  },
)
