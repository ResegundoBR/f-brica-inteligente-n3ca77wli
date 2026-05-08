migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('users')
    const targetEmail = 'cristina.milani@klaxon.com.br'

    // Check if any user already holds the target email
    let conflictUser
    try {
      conflictUser = app.findFirstRecordByData('users', 'email', targetEmail)
    } catch (_) {
      // No one has this email currently
    }

    // Check if we can find Cristina by name
    let cristina
    try {
      cristina = app.findFirstRecordByData('users', 'name', 'Cristina Milani')
    } catch (_) {
      // Not found by name
    }

    if (cristina) {
      // We found a record for Cristina Milani.
      // If someone else has her email, rename their email to avoid unique constraint failure.
      if (conflictUser && conflictUser.id !== cristina.id) {
        conflictUser.setEmail('conflict_' + conflictUser.id + '@klaxon.com.br')
        app.saveNoValidate(conflictUser)
      }

      // Now safely update Cristina's record
      cristina.setEmail(targetEmail)
      cristina.set('must_change_password', true)
      cristina.set('active', true)
      app.save(cristina)
    } else {
      // Cristina not found by name.
      if (conflictUser) {
        // Someone has her email, let's assume it's her but with a different name.
        conflictUser.set('name', 'Cristina Milani')
        conflictUser.set('must_change_password', true)
        conflictUser.set('active', true)
        app.save(conflictUser)
      } else {
        // She doesn't exist at all. Create her record from scratch.
        const record = new Record(usersCol)
        record.set('name', 'Cristina Milani')
        record.setEmail(targetEmail)
        record.setPassword('Skip@Pass123')
        record.set('must_change_password', true)
        record.set('active', true)
        app.save(record)
      }
    }
  },
  (app) => {
    // Irreversible or not strictly required to revert data fixes
  },
)
