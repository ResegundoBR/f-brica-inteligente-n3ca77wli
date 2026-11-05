migrate(
  (app) => {
    // 1. Criar a coleção 'pcp_cost_categories' se não existir
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
        indexes: ['CREATE UNIQUE INDEX idx_pcp_cost_categories_name ON pcp_cost_categories (name)'],
      })
      app.save(catCol)
    }

    // 2. Pré-popular com as 9 categorias fixas atuais, na mesma ordem
    const FIXED_CATEGORIES = [
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

    for (let i = 0; i < FIXED_CATEGORIES.length; i++) {
      const catName = FIXED_CATEGORIES[i]
      try {
        app.findFirstRecordByData('pcp_cost_categories', 'name', catName)
      } catch (_) {
        const record = new Record(catCol)
        record.set('name', catName)
        record.set('sort_order', i + 1)
        record.set('active', true)
        app.save(record)
      }
    }

    // 3. Adicionar category_id (relation para pcp_cost_categories) em pcp_order_costs e manter category
    const costsCol = app.findCollectionByNameOrId('pcp_order_costs')
    let costsChanged = false

    if (!costsCol.fields.getByName('category_id')) {
      costsCol.fields.add(
        new RelationField({
          name: 'category_id',
          collectionId: catCol.id,
          required: false,
          maxSelect: 1,
        }),
      )
      costsChanged = true
    }

    // Converter campo category de select para text caso ainda seja select,
    // para permitir salvar o nome de qualquer categoria nova sem restrição de enum
    const catField = costsCol.fields.getByName('category')
    if (catField && catField.type === 'select') {
      costsCol.fields.removeByName('category')
      costsCol.fields.add(new TextField({ name: 'category', required: false }))
      costsChanged = true
    }

    if (costsChanged) {
      app.save(costsCol)
    }

    // 4. Copiar valor de category para category_id nas linhas existentes
    try {
      const allCategories = app.findRecordsByFilter('pcp_cost_categories', '', '', 200, 0)
      const catMap = {}
      for (const cat of allCategories) {
        catMap[cat.getString('name')] = cat.id
      }

      const costRecords = app.findRecordsByFilter(
        'pcp_order_costs',
        "category_id = ''",
        '',
        1000,
        0,
      )
      for (const cost of costRecords) {
        const catName = cost.getString('category')
        if (catName && catMap[catName]) {
          cost.set('category_id', catMap[catName])
          app.save(cost)
        }
      }
    } catch (e) {
      console.log('Aviso ao migrar category_id em pcp_order_costs: ' + e)
    }
  },
  (app) => {
    try {
      const costsCol = app.findCollectionByNameOrId('pcp_order_costs')
      if (costsCol.fields.getByName('category_id')) {
        costsCol.fields.removeByName('category_id')
        app.save(costsCol)
      }
    } catch (_) {}

    try {
      const catCol = app.findCollectionByNameOrId('pcp_cost_categories')
      app.delete(catCol)
    } catch (_) {}
  },
)
