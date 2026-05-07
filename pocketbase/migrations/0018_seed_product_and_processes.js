migrate(
  (app) => {
    let product
    try {
      product = app.findFirstRecordByData('products', 'code', '050314PIN')
    } catch (_) {
      const productsCol = app.findCollectionByNameOrId('products')
      product = new Record(productsCol)
      product.set('name', 'Pendente Upper Pintado')
      product.set('code', '050314PIN')
      try {
        const admin = app.findAuthRecordByEmail(
          '_pb_users_auth_',
          'reginaldo.segundo@planagroup.com.br',
        )
        product.set('owner', admin.id)
      } catch (_) {}

      try {
        const statuses = app.findRecordsByFilter('product_statuses', "name ~ 'Iniciado'", '', 1, 0)
        if (statuses.length > 0) {
          product.set('status', statuses[0].id)
        }
      } catch (_) {}
      app.save(product)
    }

    const processes = app.findRecordsByFilter(
      'product_processes',
      `product_id = '${product.id}'`,
      '',
      10,
      0,
    )
    if (processes.length === 0) {
      const col = app.findCollectionByNameOrId('product_processes')

      const p1 = new Record(col)
      p1.set('product_id', product.id)
      p1.set('name', 'Corte')
      p1.set(
        'description',
        'Corte na máquina a laser. Verificar especificações dimensionais da chapa principal.',
      )
      p1.set('order', 1)
      app.save(p1)

      const p2 = new Record(col)
      p2.set('product_id', product.id)
      p2.set('name', 'Dobra')
      p2.set('description', 'Dobra manual em ângulo de 90 graus na peça principal.')
      p2.set('order', 2)
      app.save(p2)

      const p3 = new Record(col)
      p3.set('product_id', product.id)
      p3.set('name', 'Pintura')
      p3.set('description', 'Pintura eletrostática utilizando o pó referenciado no manual.')
      p3.set('order', 3)
      app.save(p3)
    }

    const points = app.findRecordsByFilter(
      'revision_points',
      `product_id = '${product.id}'`,
      '',
      10,
      0,
    )
    if (points.length === 0) {
      let adminId = ''
      try {
        const admin = app.findAuthRecordByEmail(
          '_pb_users_auth_',
          'reginaldo.segundo@planagroup.com.br',
        )
        adminId = admin.id
      } catch (_) {}

      if (adminId) {
        const col = app.findCollectionByNameOrId('revision_points')

        const rp1 = new Record(col)
        rp1.set('product_id', product.id)
        rp1.set('user_id', adminId)
        rp1.set('description', 'Verificar espessura do material após dobra.')
        rp1.set(
          'notes',
          'Registrador: Atualizado conforme manual técnico. Espessura foi corrigida no croqui.',
        )
        rp1.set('resolved', true)
        app.save(rp1)

        const rp2 = new Record(col)
        rp2.set('product_id', product.id)
        rp2.set('user_id', adminId)
        rp2.set('description', 'Falta especificar o tipo da tinta no processo de pintura.')
        rp2.set('notes', '')
        rp2.set('resolved', false)
        app.save(rp2)
      }
    }
  },
  (app) => {
    // Revert not strictly required for seeds.
  },
)
