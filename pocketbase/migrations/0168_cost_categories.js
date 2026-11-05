migrate(
  (app) => {
    // ---- pcp_cost_categories: cadastro dinâmico de categorias de custo ----
    let catCol
    try {
      catCol = app.findCollectionByNameOrId('pcp_cost_categories')
    } catch (_) {
      catCol = null
    }
    if (!catCol) {
      catCol = new Collection({
        name: 'pcp_cost_categories',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: null,
        fields: [
          { name: 'name', type: 'text', required: true },
          { name: 'sort_order', type: 'number', required: false },
          { name: 'active', type: 'bool', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_pcp_cost_categories_name ON pcp_cost_categories (name)',
        ],
      })
      app.save(catCol)
    }

    // ---- seed: as 9 categorias fixas atuais, na mesma ordem ----
    const FIXED = [
      'Material',
      'Insumo',
      'Mão de Obra',
      'Terceirização',
      'Impostos',
      'Comissão',
      'RT',
      'Frete',
      'Outros',
    ]
    const existingCats = {}
    try {
      const rows = app.findRecordsByFilter('pcp_cost_categories', '', '', 500, 0)
      for (const r of rows) {
        existingCats[(r.getString('name') || '').trim().toLowerCase()] = r
      }
    } catch (_) {}
    const Model = dynamicImport('models/record').Record
    const nameToId = {}
    FIXED.forEach((name, i) => {
      const key = name.trim().toLowerCase()
      let rec = existingCats[key]
      if (!rec) {
        rec = new Model(catCol, { name, sort_order: i + 1, active: true })
        app.save(rec)
      } else {
        try {
          if (!rec.getInt('sort_order')) rec.set('sort_order', i + 1)
          if (!rec.getBool('active')) rec.set('active', true)
          app.save(rec)
        } catch (_) {}
      }
      nameToId[key] = rec.id
    })

    // ---- pcp_order_costs: category_id (relation opcional) ----
    const costs = app.findCollectionByNameOrId('pcp_order_costs')
    let costsChanged = false
    if (!costs.fields.getByName('category_id')) {
      costs.fields.add(
        new RelationField({
          name: 'category_id',
          required: false,
          collectionId: catCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      costsChanged = true
    }
    // o campo category (select com 9 valores fixos) passa a aceitar qualquer nome:
    // converte select -> text mantendo os dados existentes (a categoria nova também
    // precisa ser persistida como nome na mesma coluna).
    const catField = costs.fields.getByName('category')
    if (catField && catField.type === 'select') {
      costs.fields.removeByName('category')
      costs.fields.add(new TextField({ name: 'category', required: true }))
      costsChanged = true
    }
    if (costsChanged) app.save(costs)

    // ---- backfill: copia category (nome) para o category_id correspondente ----
    try {
      const cats = app.findRecordsByFilter('pcp_cost_categories', '', '', 500, 0)
      const byNorm = {}
      for (const c of cats) {
        byNorm[(c.getString('name') || '').trim().toLowerCase()] = c.id
      }
      const PAGE = 200
      for (let page = 0; page < 200; page++) {
        const rows = app.findRecordsByFilter(
          'pcp_order_costs',
          "category_id = ''",
          '-created',
          PAGE,
          page * PAGE,
        )
        if (!rows || rows.length === 0) break
        let changedAny = false
        for (const r of rows) {
          const catName = (r.getString('category') || '').trim().toLowerCase()
          const cid = byNorm[catName]
          if (cid) {
            r.set('category_id', cid)
            app.save(r)
            changedAny = true
          }
        }
        if (!changedAny) break
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const costs = app.findCollectionByNameOrId('pcp_order_costs')
      let changed = false
      if (costs.fields.getByName('category_id')) {
        costs.fields.removeByName('category_id')
        changed = true
      }
      if (changed) app.save(costs)
    } catch (_) {}
    try {
      const c = app.findCollectionByNameOrId('pcp_cost_categories')
      app.delete(c)
    } catch (_) {}
  },
)
