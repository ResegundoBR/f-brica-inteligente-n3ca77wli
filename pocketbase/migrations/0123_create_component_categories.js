migrate(
  (app) => {
    // 1. Criar a coleção 'component_categories' se não existir
    let catCol
    try {
      catCol = app.findCollectionByNameOrId('component_categories')
    } catch (_) {
      catCol = new Collection({
        name: 'component_categories',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'name', type: 'text', required: true },
          { name: 'active', type: 'bool', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_component_categories_name ON component_categories (name COLLATE NOCASE)',
        ],
      })
      app.save(catCol)
    }

    // 2. Pré-cadastrar as categorias solicitadas:
    // Usinagem, Corte a Laser, Borracha, Cabos, Repuxos, Pedras, Ferragens, Estrutura/Solda, Pintura, Elétrica, Outros
    const defaultCategories = [
      'Usinagem',
      'Corte a Laser',
      'Borracha',
      'Cabos',
      'Repuxos',
      'Pedras',
      'Ferragens',
      'Estrutura/Solda',
      'Pintura',
      'Elétrica',
      'Outros',
    ]

    for (const catName of defaultCategories) {
      try {
        app.findFirstRecordByData('component_categories', 'name', catName)
      } catch (_) {
        const record = new Record(catCol)
        record.set('name', catName)
        record.set('active', true)
        app.save(record)
      }
    }

    // 3. Adicionar campo categoria (relation para component_categories) na coleção 'components'
    const componentsCol = app.findCollectionByNameOrId('components')
    if (!componentsCol.fields.getByName('category')) {
      componentsCol.fields.add(
        new RelationField({
          name: 'category',
          collectionId: catCol.id,
          required: false,
          maxSelect: 1,
        }),
      )
      app.save(componentsCol)
    }
  },
  (app) => {
    try {
      const componentsCol = app.findCollectionByNameOrId('components')
      if (componentsCol.fields.getByName('category')) {
        componentsCol.fields.removeByName('category')
        app.save(componentsCol)
      }
    } catch (_) {}

    try {
      const catCol = app.findCollectionByNameOrId('component_categories')
      app.delete(catCol)
    } catch (_) {}
  },
)
