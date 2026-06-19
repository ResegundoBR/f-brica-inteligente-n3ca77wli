migrate(
  (app) => {
    const roles = app.findCollectionByNameOrId('roles')
    if (!roles.fields.getByName('access_pcp'))
      roles.fields.add(new BoolField({ name: 'access_pcp' }))
    if (!roles.fields.getByName('access_operator'))
      roles.fields.add(new BoolField({ name: 'access_operator' }))
    if (!roles.fields.getByName('access_commercial'))
      roles.fields.add(new BoolField({ name: 'access_commercial' }))
    app.save(roles)
  },
  (app) => {
    const roles = app.findCollectionByNameOrId('roles')
    if (roles.fields.getByName('access_pcp')) roles.fields.removeByName('access_pcp')
    if (roles.fields.getByName('access_operator')) roles.fields.removeByName('access_operator')
    if (roles.fields.getByName('access_commercial')) roles.fields.removeByName('access_commercial')
    app.save(roles)
  },
)
