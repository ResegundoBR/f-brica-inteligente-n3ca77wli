migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('material_shortages')

    if (!collection.fields.getByName('batch_id')) {
      collection.fields.add(
        new TextField({
          name: 'batch_id',
          required: false,
        }),
      )
    }

    if (!collection.fields.getByName('batch_info')) {
      collection.fields.add(
        new JSONField({
          name: 'batch_info',
          required: false,
        }),
      )
    }

    app.save(collection)

    try {
      collection.addIndex('idx_material_shortages_batch_id', false, 'batch_id', '')
      app.save(collection)
    } catch (_) {
      // index might already exist
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('material_shortages')
    try {
      collection.removeIndex('idx_material_shortages_batch_id')
    } catch (_) {}

    const f1 = collection.fields.getByName('batch_id')
    if (f1) collection.fields.remove(f1)
    const f2 = collection.fields.getByName('batch_info')
    if (f2) collection.fields.remove(f2)

    app.save(collection)
  },
)
