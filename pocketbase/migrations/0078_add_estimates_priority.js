migrate(
  (app) => {
    const ppCol = app.findCollectionByNameOrId('product_processes')
    ppCol.fields.add(new NumberField({ name: 'estimated_hours' }))
    ppCol.fields.add(new BoolField({ name: 'is_required' }))
    app.save(ppCol)

    const poCol = app.findCollectionByNameOrId('pcp_orders')
    poCol.fields.add(new NumberField({ name: 'manual_priority' }))
    app.save(poCol)

    // Set default manual priority
    app
      .db()
      .newQuery('UPDATE pcp_orders SET manual_priority = 999 WHERE manual_priority IS NULL')
      .execute()
    app
      .db()
      .newQuery('UPDATE product_processes SET is_required = true WHERE is_required IS NULL')
      .execute()
  },
  (app) => {
    const ppCol = app.findCollectionByNameOrId('product_processes')
    ppCol.fields.removeByName('estimated_hours')
    ppCol.fields.removeByName('is_required')
    app.save(ppCol)

    const poCol = app.findCollectionByNameOrId('pcp_orders')
    poCol.fields.removeByName('manual_priority')
    app.save(poCol)
  },
)
