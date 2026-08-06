migrate(
  (app) => {
    const suppliersCol = app.findCollectionByNameOrId('suppliers').id
    const usersCol = '_pb_users_auth_'
    const materialShortagesCol = app.findCollectionByNameOrId('material_shortages').id

    const ordensCollection = new Collection({
      name: 'ordens_de_compra',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'oc_number', type: 'text', required: true },
        { name: 'supplier', type: 'text', required: true },
        {
          name: 'supplier_id',
          type: 'relation',
          required: false,
          collectionId: suppliersCol,
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          required: false,
          values: ['Pendente', 'Enviada', 'Recebida', 'Cancelada'],
          maxSelect: 1,
        },
        { name: 'expected_date', type: 'date', required: false },
        { name: 'delivery_terms', type: 'text', required: false },
        { name: 'total', type: 'number', required: false },
        {
          name: 'user_id',
          type: 'relation',
          required: false,
          collectionId: usersCol,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_ordens_de_compra_oc_number ON ordens_de_compra (oc_number)',
        'CREATE INDEX idx_ordens_de_compra_supplier_id ON ordens_de_compra (supplier_id)',
      ],
    })
    app.save(ordensCollection)

    const ordensColId = app.findCollectionByNameOrId('ordens_de_compra').id

    const itensCollection = new Collection({
      name: 'ordem_compra_itens',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'oc_id',
          type: 'relation',
          required: true,
          collectionId: ordensColId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'material_shortage_id',
          type: 'relation',
          required: false,
          collectionId: materialShortagesCol,
          maxSelect: 1,
        },
        { name: 'description', type: 'text', required: true },
        { name: 'code', type: 'text', required: false },
        { name: 'quantity', type: 'number', required: true },
        { name: 'unit_price', type: 'number', required: false },
        { name: 'total', type: 'number', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_ordem_compra_itens_oc_id ON ordem_compra_itens (oc_id)',
        'CREATE INDEX idx_ordem_compra_itens_material_shortage_id ON ordem_compra_itens (material_shortage_id)',
      ],
    })
    app.save(itensCollection)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('ordem_compra_itens'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('ordens_de_compra'))
    } catch (_) {}
  },
)
