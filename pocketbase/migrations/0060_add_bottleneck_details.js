/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')
    if (!col.fields.getByName('bottleneck_details')) {
      const TextField = require('pocketbase/models/schema').TextField
      col.fields.add(new TextField({ name: 'bottleneck_details' }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_orders')
    col.fields.removeByName('bottleneck_details')
    app.save(col)
  },
)
