routerAdd(
  'POST',
  '/backend/v1/users/change-password',
  (e) => {
    const body = e.requestInfo().body || {}

    const errors = {}
    if (!body.password) {
      errors.password = new ValidationError('validation_required', 'Cannot be blank.')
    }
    if (!body.passwordConfirm) {
      errors.passwordConfirm = new ValidationError('validation_required', 'Cannot be blank.')
    }

    if (Object.keys(errors).length > 0) {
      throw new BadRequestError('Validation failed.', errors)
    }

    if (body.password !== body.passwordConfirm) {
      errors.passwordConfirm = new ValidationError(
        'validation_mismatch',
        'As senhas não coincidem.',
      )
      throw new BadRequestError('Validation failed.', errors)
    }

    if (body.password.length < 8) {
      errors.password = new ValidationError(
        'validation_length',
        'A senha deve ter no mínimo 8 caracteres.',
      )
      throw new BadRequestError('Validation failed.', errors)
    }

    const user = e.auth
    if (!user) {
      throw new UnauthorizedError('Authentication required.')
    }

    // Security check: ensure only logged-in user can change their own password
    if (body.id && body.id !== user.id) {
      throw new ForbiddenError('You can only change your own password.')
    }

    user.setPassword(body.password)
    user.set('must_change_password', false)

    $app.save(user)

    return e.json(200, user)
  },
  $apis.requireAuth(),
)
