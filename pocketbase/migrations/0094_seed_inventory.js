migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('inventory')

    const items = [
      {
        code: 'MAT-001',
        description: 'Barra de Aco SAE 1045 - 25mm',
        quantity: 150,
        min_quantity: 50,
        unit: 'un',
      },
      {
        code: 'MAT-002',
        description: 'Chapa de Aco Carbono 3mm',
        quantity: 30,
        min_quantity: 40,
        unit: 'chapa',
      },
      {
        code: 'MAT-003',
        description: 'Tubo Quadrado 50x50 - 2mm',
        quantity: 80,
        min_quantity: 30,
        unit: 'm',
      },
      {
        code: 'MAT-004',
        description: 'Eletrodo AWS E7018 - 3.25mm',
        quantity: 25,
        min_quantity: 60,
        unit: 'kg',
      },
      {
        code: 'MAT-005',
        description: 'Parafuso M10x30 Inox',
        quantity: 500,
        min_quantity: 200,
        unit: 'un',
      },
      {
        code: 'MAT-006',
        description: 'Tinta Acrilica Branca 18L',
        quantity: 12,
        min_quantity: 5,
        unit: 'lata',
      },
      {
        code: 'MAT-007',
        description: 'Disco de Corte 4.1/2',
        quantity: 8,
        min_quantity: 20,
        unit: 'un',
      },
    ]

    items.forEach(function (item) {
      try {
        app.findFirstRecordByData('inventory', 'code', item.code)
      } catch (_) {
        var record = new Record(col)
        record.set('code', item.code)
        record.set('description', item.description)
        record.set('quantity', item.quantity)
        record.set('min_quantity', item.min_quantity)
        record.set('unit', item.unit)
        app.save(record)
      }
    })
  },
  (app) => {
    try {
      app.db().newQuery("DELETE FROM inventory WHERE code LIKE 'MAT-%'").execute()
    } catch (_) {}
  },
)
