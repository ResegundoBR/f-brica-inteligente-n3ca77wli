migrate(
  (app) => {
    const notifications = app.findCollectionByNameOrId('notifications')
    // Permite que usuários autenticados criem notificações para outros usuários
    // (ex.: operador notificando gestores ao finalizar rodada de separação)
    notifications.createRule = "@request.auth.id != ''"
    app.save(notifications)
  },
  (app) => {
    try {
      const notifications = app.findCollectionByNameOrId('notifications')
      notifications.createRule = null
      app.save(notifications)
    } catch (_) {}
  },
)
