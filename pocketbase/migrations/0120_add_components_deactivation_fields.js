migrate(
  (app) => {
    const componentsCol = app.findCollectionByNameOrId('components')

    // Adiciona campo relation deactivated_by para rastreabilidade de quem marcou inativo
    if (!componentsCol.fields.getByName('deactivated_by')) {
      componentsCol.fields.add(
        new RelationField({
          name: 'deactivated_by',
          collectionId: '_pb_users_auth_',
          required: false,
          maxSelect: 1,
        }),
      )
    }

    // Adiciona campo date deactivated_at
    if (!componentsCol.fields.getByName('deactivated_at')) {
      componentsCol.fields.add(
        new DateField({
          name: 'deactivated_at',
          required: false,
        }),
      )
    }

    app.save(componentsCol)
  },
  (app) => {
    try {
      const componentsCol = app.findCollectionByNameOrId('components')
      if (componentsCol.fields.getByName('deactivated_by')) {
        componentsCol.fields.removeByName('deactivated_by')
      }
      if (componentsCol.fields.getByName('deactivated_at')) {
        componentsCol.fields.removeByName('deactivated_at')
      }
      app.save(componentsCol)
    } catch (_) {}
  },
)
