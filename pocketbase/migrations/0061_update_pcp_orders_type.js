/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')

    col.fields.add(
      new SelectField({
        name: 'op_type',
        values: ['Linha', 'Especial', 'Assistência'],
        required: false,
      }),
    )
    col.fields.add(
      new TextField({
        name: 'manual_product_name',
        required: false,
      }),
    )

    app.save(col)

    app
      .db()
      .newQuery(
        "UPDATE pcp_orders SET op_type = 'Especial' WHERE is_special = 1 OR is_special = true",
      )
      .execute()
    app
      .db()
      .newQuery(
        "UPDATE pcp_orders SET op_type = 'Linha' WHERE is_special = 0 OR is_special = false OR is_special IS NULL",
      )
      .execute()

    const updatedCol = app.findCollectionByNameOrId('pcp_orders')
    const opTypeField = updatedCol.fields.getByName('op_type')
    if (opTypeField) opTypeField.required = true

    updatedCol.fields.removeByName('is_special')
    app.save(updatedCol)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')

    col.fields.add(new BoolField({ name: 'is_special' }))
    app.save(col)

    app.db().newQuery("UPDATE pcp_orders SET is_special = 1 WHERE op_type = 'Especial'").execute()
    app.db().newQuery("UPDATE pcp_orders SET is_special = 0 WHERE op_type != 'Especial'").execute()

    const updatedCol = app.findCollectionByNameOrId('pcp_orders')
    updatedCol.fields.removeByName('op_type')
    updatedCol.fields.removeByName('manual_product_name')
    app.save(updatedCol)
  },
)
