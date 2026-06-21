migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('material_shortages')

    col.fields.add(
      new RelationField({
        name: 'requested_by',
        collectionId: '_pb_users_auth_',
        cascadeDelete: false,
        maxSelect: 1,
        required: false,
      }),
    )

    col.fields.add(
      new NumberField({
        name: 'unit_price',
        required: false,
      }),
    )

    col.fields.add(
      new DateField({
        name: 'purchase_date',
        required: false,
      }),
    )

    col.addIndex('idx_material_shortages_requested_by', false, 'requested_by', '')

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('material_shortages')

    col.fields.removeByName('requested_by')
    col.fields.removeByName('unit_price')
    col.fields.removeByName('purchase_date')
    col.removeIndex('idx_material_shortages_requested_by')

    app.save(col)
  },
)
