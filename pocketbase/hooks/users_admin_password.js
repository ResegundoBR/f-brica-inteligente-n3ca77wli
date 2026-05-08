routerAdd(
  'POST',
  '/backend/v1/users/{id}/password',
  (e) => {
    const id = e.request.pathValue('id')
    const body = e.requestInfo().body || {}

    if (!body.password) {
      const errors = { password: new ValidationError('validation_required', 'Cannot be blank.') }
      throw new BadRequestError('Validation failed.', errors)
    }

    if (body.password.length < 8) {
      const errors = {
        password: new ValidationError(
          'validation_length',
          'A senha deve ter no mínimo 8 caracteres.',
        ),
      }
      throw new BadRequestError('Validation failed.', errors)
    }

    const auth = e.auth
    if (!auth) {
      throw new UnauthorizedError('Authentication required.')
    }

    $app.expandRecord(auth, ['role'])
    const role = auth.expandedOne('role')
    const isAdmin =
      role &&
      (role.getBool('access_users') ||
        role.getString('name') === 'admin' ||
        role.getString('name') === 'Administrador')

    if (!isAdmin && auth.id !== id) {
      throw new ForbiddenError('You can only change your own password.')
    }

    try {
      const user = $app.findRecordById('users', id)
      user.setPassword(body.password)

      if (body.must_change_password !== undefined) {
        user.set('must_change_password', body.must_change_password)
      } else {
        user.set('must_change_password', true)
      }

      $app.save(user)

      return e.json(200, { success: true })
    } catch (err) {
      throw new NotFoundError('User not found.')
    }
  },
  $apis.requireAuth(),
)
