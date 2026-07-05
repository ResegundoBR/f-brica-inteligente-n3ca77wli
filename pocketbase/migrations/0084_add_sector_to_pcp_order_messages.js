migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_order_messages')

    if (!col.fields.getByName('sector')) {
      col.fields.add(
        new SelectField({
          name: 'sector',
          values: ['Comercial', 'Operador'],
          maxSelect: 1,
        }),
      )
    }

    app.save(col)

    try {
      const messages = app.findRecordsByFilter('pcp_order_messages', '', 'created', 0, 0)
      for (const msg of messages) {
        if (msg.getString('sector')) continue
        const userId = msg.getString('user_id')
        if (!userId) continue
        try {
          const sender = app.findRecordById('users', userId)
          const roleId = sender.getString('role')
          if (!roleId) continue
          const role = app.findRecordById('roles', roleId)
          if (role.getBool('access_commercial')) {
            msg.set('sector', 'Comercial')
            app.save(msg)
          } else if (role.getBool('access_operator')) {
            msg.set('sector', 'Operador')
            app.save(msg)
          }
        } catch (_) {}
      }
    } catch (_) {}
  },
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_order_messages')
    const field = col.fields.getByName('sector')
    if (field) col.fields.remove(field)
    app.save(col)
  },
)
