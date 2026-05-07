migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    let adminId
    try {
      const admin = app.findAuthRecordByEmail(
        '_pb_users_auth_',
        'reginaldo.segundo@planagroup.com.br',
      )
      adminId = admin.id
    } catch (_) {
      const record = new Record(users)
      record.setEmail('reginaldo.segundo@planagroup.com.br')
      record.setPassword('Skip@Pass')
      record.setVerified(true)
      record.set('name', 'Admin')
      record.set('role', 'admin')
      record.set('must_change_password', true)
      app.save(record)
      adminId = record.id
    }

    const defaultData = { processes: [], composition: [], checklist: [], reviewPoints: [] }
    const products = app.findCollectionByNameOrId('products')

    try {
      app.findFirstRecordByData('products', 'name', 'Válvula de Pressão X1')
    } catch (_) {
      const p1 = new Record(products)
      p1.set('name', 'Válvula de Pressão X1')
      p1.set('description', 'Válvula industrial alta pressão')
      p1.set('status', 'rascunho')
      p1.set('owner', adminId)
      p1.set('data', { ...defaultData, checklist: ['Verificar vedação'] })
      app.save(p1)
    }

    try {
      app.findFirstRecordByData('products', 'name', 'Eixo Motor B-22')
    } catch (_) {
      const p2 = new Record(products)
      p2.set('name', 'Eixo Motor B-22')
      p2.set('description', 'Eixo de transmissão primária')
      p2.set('status', 'rascunho')
      p2.set('owner', adminId)
      p2.set('data', {
        ...defaultData,
        reviewPoints: [
          {
            id: 'r1',
            description: 'Cota de tolerância incorreta',
            resolved: null,
            observation: '',
          },
        ],
      })
      app.save(p2)
    }

    try {
      app.findFirstRecordByData('products', 'name', 'Painel de Controle Zeta')
    } catch (_) {
      const p3 = new Record(products)
      p3.set('name', 'Painel de Controle Zeta')
      p3.set('description', 'Gabinete elétrico principal')
      p3.set('status', 'rascunho')
      p3.set('owner', adminId)
      p3.set('data', defaultData)
      app.save(p3)
    }
  },
  (app) => {
    try {
      const products = app.findCollectionByNameOrId('products')
      app.truncateCollection(products)
    } catch (e) {}
  },
)
