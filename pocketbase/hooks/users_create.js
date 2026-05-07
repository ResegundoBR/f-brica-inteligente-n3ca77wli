routerAdd(
  'POST',
  '/backend/v1/users',
  (e) => {
    if (!e.auth || e.auth.getString('role') !== 'admin') {
      return e.forbiddenError('Only admins can create users')
    }

    const body = e.requestInfo().body
    if (!body.name || !body.email || !body.role) {
      return e.badRequestError('Missing fields')
    }

    const users = $app.findCollectionByNameOrId('users')
    const user = new Record(users)
    user.set('name', body.name)
    user.setEmail(body.email)
    user.setPassword('Skip@Pass123!')
    user.set('role', body.role)
    user.set('must_change_password', true)
    user.setVerified(true)

    $app.save(user)

    return e.json(201, { id: user.id })
  },
  $apis.requireAuth(),
)
