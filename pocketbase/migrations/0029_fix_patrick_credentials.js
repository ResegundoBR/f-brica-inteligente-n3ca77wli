migrate((app) => {
  try {
    const user = app.findAuthRecordByEmail('users', 'patrickmacedo116@gmail.com')
    user.setPassword('Jc45#iKl')
    user.set('active', true)
    app.save(user)
  } catch (_) {
    // User not found, nothing to update
  }
})
